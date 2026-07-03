import type { NetworkFixAction, NetworkRepairResult } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { PrivilegeService } from '../../platform/privilege-service'
import { parseWindowsAdapterStates, parseWindowsNetAdapterJson } from './link-checker'
import { NETWORK_FIX_DEFINITIONS, toFixAction } from './network-fix-catalog'

/** 默认公共 DNS,主备各一,兼顾国内外可达性。 */
const PUBLIC_DNS_SERVERS = ['1.1.1.1', '223.5.5.5']

export class NetworkRepairService {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly privilegeService: PrivilegeService
  ) {}

  /**
   * 列出当前平台可执行的修复动作,供渲染层"修复工具箱"始终展示。
   * 关键点: 即使诊断全部通过,用户也能主动执行修复,不再依赖是否检测到故障。
   */
  listAvailableFixes(): NetworkFixAction[] {
    return NETWORK_FIX_DEFINITIONS.filter((definition) => this.isSupported(definition.platform)).map(toFixAction)
  }

  async repair(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (!this.isSupported(action.platform)) {
      return { actionId: action.id, success: false, message: '该修复动作不适用于当前平台。' }
    }

    try {
      if (action.id === 'enable-adapter') return await this.enableAdapter(action)
      if (action.id === 'flush-dns') return await this.flushDns(action)
      if (action.id === 'set-public-dns') return await this.setPublicDns(action)
      if (action.id === 'renew-ip') return await this.renewIp(action)
      if (action.id === 'reset-winsock') return await this.resetWinsock(action)
      if (action.id === 'reset-dynamic-ports') return await this.resetDynamicPorts(action)
      if (action.id === 'reset-tcpip') return await this.resetTcpIp(action)

      return { actionId: action.id, success: false, message: '未知网络修复动作。' }
    } catch (error) {
      // 中文注释: 提权命令被用户取消或执行失败时,返回友好提示而非抛出,避免 UI 崩溃。
      return {
        actionId: action.id,
        success: false,
        message: error instanceof Error ? `修复未完成: ${error.message}` : '修复未完成,请稍后重试或以管理员身份运行。'
      }
    }
  }

  private isSupported(platform: NetworkFixAction['platform']): boolean {
    if (platform === 'all') return true
    if (platform === 'windows') return this.platform.isWindows()
    if (platform === 'macos') return this.platform.isMacOS()
    return false
  }

  private async flushDns(action: NetworkFixAction): Promise<NetworkRepairResult> {
    const command = this.platform.isWindows() ? 'ipconfig' : 'dscacheutil'
    const args = this.platform.isWindows() ? ['/flushdns'] : ['-flushcache']
    await this.commandRunner.run(command, args)

    if (this.platform.isMacOS()) {
      // 中文注释: macOS 刷新 DNS 还需要重启 mDNSResponder 才能完全生效。
      await this.privilegeService.runElevated({ name: 'PCCleaner', command: 'killall -HUP mDNSResponder' }).catch(() => undefined)
    }

    return { actionId: action.id, success: true, message: 'DNS 缓存已刷新。' }
  }

  private async setPublicDns(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (this.platform.isWindows()) {
      const serviceName = await this.getWindowsPrimaryInterface()
      const primary = `netsh interface ipv4 set dns name="${serviceName}" static ${PUBLIC_DNS_SERVERS[0]}`
      const secondary = `netsh interface ipv4 add dns name="${serviceName}" ${PUBLIC_DNS_SERVERS[1]} index=2`
      await this.privilegeService.runElevated({ name: 'PCCleaner', command: `${primary} && ${secondary}` })
      return {
        actionId: action.id,
        success: true,
        message: `已将「${serviceName}」的 DNS 切换为 ${PUBLIC_DNS_SERVERS.join(' / ')}。`
      }
    }

    const serviceName = await this.getMacPrimaryService()
    await this.privilegeService.runElevated({
      name: 'PCCleaner',
      command: `networksetup -setdnsservers "${serviceName.replace(/"/g, '\\"')}" ${PUBLIC_DNS_SERVERS.join(' ')}`
    })

    return {
      actionId: action.id,
      success: true,
      message: `已将「${serviceName}」的 DNS 切换为 ${PUBLIC_DNS_SERVERS.join(' / ')}。`
    }
  }

  /**
   * 将网卡切换为自动获取 IP/DNS 并重新申请地址。
   * 关键点: Windows 上先把接口 IP 与 DNS 都设为 source=dhcp,再 release/renew,
   *        这样即使用户配置了错误的静态 IP 也能强制恢复为自动获取。
   */
  private async renewIp(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (this.platform.isWindows()) {
      const interfaceName = await this.getWindowsPrimaryInterface()
      const escaped = interfaceName.replace(/"/g, '')
      // 用 & 顺序执行,避免某条(如已是 DHCP)返回非零码时中断后续命令
      const command =
        `netsh interface ip set address name="${escaped}" source=dhcp & ` +
        `netsh interface ip set dns name="${escaped}" source=dhcp & ` +
        `ipconfig /release & ipconfig /renew`
      await this.privilegeService.runElevated({ name: 'PCCleaner', command })
      return {
        actionId: action.id,
        success: true,
        message: `已将「${interfaceName}」设置为自动获取 IP 和 DNS,并重新申请地址。`
      }
    }

    const serviceName = await this.getMacPrimaryService()
    await this.privilegeService.runElevated({
      name: 'PCCleaner',
      command:
        `networksetup -setdhcp "${serviceName.replace(/"/g, '\\"')}" && ` +
        `networksetup -setdnsservers "${serviceName.replace(/"/g, '\\"')}" Empty`
    })

    return { actionId: action.id, success: true, message: `已将「${serviceName}」设置为自动获取 IP/DNS 并重新申请地址。` }
  }

  /** 启用被禁用的网络适配器(有线/无线)。 */
  private async enableAdapter(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (this.platform.isWindows()) {
      const disabled = await this.getWindowsDisabledInterfaces()
      if (disabled.length === 0) {
        return { actionId: action.id, success: true, message: '未发现被禁用的网络适配器,无需启用。' }
      }

      const command = disabled.map((name) => `netsh interface set interface name="${name.replace(/"/g, '')}" admin=enabled`).join(' & ')
      await this.privilegeService.runElevated({ name: 'PCCleaner', command })
      return {
        actionId: action.id,
        success: true,
        message: `已尝试启用适配器: ${disabled.join('、')}。请确认已连接 Wi-Fi 或插入网线。`
      }
    }

    const serviceName = await this.getMacPrimaryService()
    await this.privilegeService.runElevated({
      name: 'PCCleaner',
      command: `networksetup -setnetworkserviceenabled "${serviceName.replace(/"/g, '\\"')}" on`
    })
    return { actionId: action.id, success: true, message: `已启用网络服务「${serviceName}」。` }
  }

  private async resetWinsock(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (!this.platform.isWindows()) {
      return { actionId: action.id, success: false, message: 'Winsock 重置仅适用于 Windows。' }
    }

    await this.privilegeService.runElevated({ name: 'PCCleaner', command: 'netsh winsock reset' })
    return { actionId: action.id, success: true, message: 'Winsock 已重置,通常需要重启系统生效。' }
  }

  /** 恢复 Windows 默认 TCP 动态端口范围,解决临时端口池过小或耗尽导致无法上网。 */
  private async resetDynamicPorts(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (!this.platform.isWindows()) {
      return { actionId: action.id, success: false, message: '动态端口范围重置仅适用于 Windows。' }
    }

    const command =
      'netsh int ipv4 set dynamicport tcp start=1024 num=13977 && ' +
      'netsh int ipv6 set dynamicport tcp start=1024 num=13977'

    await this.privilegeService.runElevated({ name: 'PCCleaner', command })

    return {
      actionId: action.id,
      success: true,
      message:
        'TCP 动态端口范围已恢复为默认值(起始 1024,共 13977 个)。' +
        '若仍无法上网,请确认已停止占用端口的测试脚本或异常程序(如 listen9999.py / sockettest.py)。'
    }
  }

  private async resetTcpIp(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (!this.platform.isWindows()) {
      return { actionId: action.id, success: false, message: 'TCP/IP 协议栈重置仅适用于 Windows。' }
    }

    // 中文注释: netsh int ip reset 会重写 TCP/IP 注册表项,属于高风险操作,必须提权且提示重启。
    await this.privilegeService.runElevated({ name: 'PCCleaner', command: 'netsh int ip reset' })
    return { actionId: action.id, success: true, message: 'TCP/IP 协议栈已重置,请重启计算机使其完全生效。' }
  }

  /**
   * 获取 Windows 当前主用网络接口名称,失败时回退到常见的「以太网」。
   * 关键点: 只在物理网卡中选择,避免把 DHCP/DNS 设置误应用到 VPN 隧道或 WSL 虚拟网卡上。
   */
  private async getWindowsPrimaryInterface(): Promise<string> {
    const adapters = await this.getWindowsAdapterStates()
    const physical = adapters.filter((a) => !a.isVirtual && a.name)
    // 优先返回已启用且已连接的物理接口
    const connected = physical.find((a) => a.enabled && a.connected)
    if (connected?.name) return connected.name
    // 其次返回任一已启用物理接口
    const enabled = physical.find((a) => a.enabled)
    if (enabled?.name) return enabled.name
    // 再退一步返回任一物理接口(可能被禁用,由调用方决定后续动作)
    if (physical[0]?.name) return physical[0].name

    return '以太网'
  }

  /**
   * 获取 Windows 被禁用的物理网络接口名称列表。
   * 关键点: 排除 VPN/TAP/WSL 等虚拟适配器,避免「启用网络适配器」误开启用户手动关闭的 VPN 隧道。
   */
  private async getWindowsDisabledInterfaces(): Promise<string[]> {
    const adapters = await this.getWindowsAdapterStates()
    return adapters.filter((a) => !a.enabled && !a.isVirtual && a.name).map((a) => a.name)
  }

  private async getWindowsAdapterStates(): Promise<ReturnType<typeof parseWindowsAdapterStates>> {
    const psResult = await this.commandRunner
      .run('powershell', [
        '-NoProfile',
        '-Command',
        'Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, AdminStatus, MediaConnectionState | ConvertTo-Json -Compress'
      ])
      .catch(() => ({ stdout: '', stderr: '' }))

    const fromPowerShell = parseWindowsNetAdapterJson(psResult.stdout)
    if (fromPowerShell.length > 0) return fromPowerShell

    const result = await this.commandRunner
      .run('netsh', ['interface', 'show', 'interface'])
      .catch(() => ({ stdout: '', stderr: '' }))
    return parseWindowsAdapterStates(result.stdout)
  }

  /** 获取 macOS 当前启用的网络服务名称,失败时回退到「Wi-Fi」。 */
  private async getMacPrimaryService(): Promise<string> {
    const result = await this.commandRunner
      .run('networksetup', ['-listallnetworkservices'])
      .catch(() => ({ stdout: '', stderr: '' }))

    const serviceName = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('*') && !/An asterisk/i.test(line))

    return serviceName ?? 'Wi-Fi'
  }
}
