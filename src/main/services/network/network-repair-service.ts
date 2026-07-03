import type { NetworkFixAction, NetworkRepairResult } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { PrivilegeService } from '../../platform/privilege-service'

export class NetworkRepairService {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly privilegeService: PrivilegeService
  ) {}

  async repair(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (action.platform !== 'all') {
      const isSupported =
        (action.platform === 'windows' && this.platform.isWindows()) ||
        (action.platform === 'macos' && this.platform.isMacOS())

      if (!isSupported) {
        return { actionId: action.id, success: false, message: '该修复动作不适用于当前平台。' }
      }
    }

    if (action.id === 'flush-dns') return this.flushDns(action)
    if (action.id === 'renew-ip') return this.renewIp(action)
    if (action.id === 'reset-winsock') return this.resetWinsock(action)

    return { actionId: action.id, success: false, message: '未知网络修复动作。' }
  }

  private async flushDns(action: NetworkFixAction): Promise<NetworkRepairResult> {
    const command = this.platform.isWindows() ? 'ipconfig' : 'dscacheutil'
    const args = this.platform.isWindows() ? ['/flushdns'] : ['-flushcache']
    await this.commandRunner.run(command, args)
    return { actionId: action.id, success: true, message: 'DNS 缓存已刷新。' }
  }

  private async renewIp(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (this.platform.isWindows()) {
      await this.privilegeService.runElevated({ name: 'PCCleaner', command: 'ipconfig /release && ipconfig /renew' })
      return { actionId: action.id, success: true, message: '已释放并重新获取 IP。' }
    }

    const serviceResult = await this.commandRunner.run('networksetup', ['-listallnetworkservices']).catch(() => ({
      stdout: '',
      stderr: ''
    }))

    const serviceName =
      serviceResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('*')) ?? 'Wi-Fi'

    await this.privilegeService.runElevated({
      name: 'PCCleaner',
      command: `networksetup -setdhcp "${serviceName.replace(/"/g, '\\"')}"`
    })

    return { actionId: action.id, success: true, message: `已对「${serviceName}」重新申请 DHCP 地址。` }
  }

  private async resetWinsock(action: NetworkFixAction): Promise<NetworkRepairResult> {
    if (!this.platform.isWindows()) {
      return { actionId: action.id, success: false, message: 'Winsock 重置仅适用于 Windows。' }
    }

    await this.privilegeService.runElevated({ name: 'PCCleaner', command: 'netsh winsock reset' })
    return { actionId: action.id, success: true, message: 'Winsock 已重置,通常需要重启系统生效。' }
  }
}
