import type { NetworkCheck, NetworkDiagnosis, NetworkLayer } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { withTimeout } from '../../utils/timeout'
import { formatDnsEvidence, probeSystemDns } from './dns-checker'
import {
  type AdapterState,
  inspectNetworkInterfaces,
  parseMacAdapterStates,
  parseWindowsAdapterStates,
  parseWindowsNetAdapterJson
} from './link-checker'
import { NetworkRuleEngine } from './network-rules'

export class NetworkDiagnosticsService {
  /** 整次诊断的最大耗时,防止个别系统命令在断网时长时间无响应。 */
  private static readonly DIAGNOSE_TIMEOUT_MS = 45_000

  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly ruleEngine: NetworkRuleEngine
  ) {}

  async diagnose(): Promise<NetworkDiagnosis> {
    return withTimeout(
      this.diagnoseInternal(),
      NetworkDiagnosticsService.DIAGNOSE_TIMEOUT_MS,
      '网络诊断超时,请稍后重试或检查系统网络命令是否正常响应。'
    )
  }

  private async diagnoseInternal(): Promise<NetworkDiagnosis> {
    // 中文注释: 先完成链路层检测;若物理链路不可用,跳过后续耗时的 DNS/HTTP/公网检测,避免断网时 UI 长时间 loading。
    const linkCheck = await this.checkLinkLayer()
    const checks: NetworkCheck[] = [linkCheck]

    if (linkCheck.status === 'fail') {
      checks.push(
        this.createSkippedCheck(
          'network-public-ip',
          'network',
          '公网 IP 连通性',
          '物理链路异常,未执行公网连通性测试(请先连接 Wi-Fi 或插入网线)。'
        ),
        this.createSkippedCheck('dns-resolution', 'dns', 'DNS 解析', '物理链路异常,未执行 DNS 解析测试。'),
        this.createSkippedCheck(
          'transport-socket',
          'transport',
          'Socket 与 TCP 资源',
          '物理链路异常,未执行传输层检测。'
        ),
        this.createSkippedCheck(
          'application-http',
          'application',
          'HTTP 应用层访问',
          '物理链路异常,未执行 HTTP 访问测试。'
        ),
        this.createSkippedCheck('external-isp', 'external', '外部网络因素', '物理链路异常,未执行外部节点测试。')
      )
    } else {
      checks.push(
        await this.checkNetworkLayer(),
        await this.checkDnsLayer(),
        await this.checkTransportLayer(),
        await this.checkApplicationLayer(),
        await this.checkExternalFactors()
      )
    }

    const inferred = this.ruleEngine.inferDiagnosis(checks)

    return {
      checks,
      ...inferred
    }
  }

  /** 链路层失败时快速跳过的检查项,避免断网场景下重复等待超时。 */
  private createSkippedCheck(
    id: string,
    layer: NetworkLayer,
    name: string,
    message: string
  ): NetworkCheck {
    return {
      id,
      layer,
      name,
      status: 'unknown',
      message,
      evidence: [message],
      riskLevel: 'safe'
    }
  }

  private async checkLinkLayer(): Promise<NetworkCheck> {
    // 中文注释: 链路层判定顺序: 物理适配器状态(启用/连接) 优先于 IP 地址。
    // 网线拔出/Wi-Fi 关闭后 IP 可能仍残留在系统中,不能仅凭 IP 判定 pass。
    const summary = inspectNetworkInterfaces()
    const adapters = await this.getAdapterStates()
    const physicalAdapters = adapters.filter((a) => !a.isVirtual)

    const enabledPhysical = physicalAdapters.filter((a) => a.enabled)
    const disabledPhysical = physicalAdapters.filter((a) => !a.enabled)
    const connectedPhysical = physicalAdapters.filter((a) => a.enabled && a.connected)
    const connectedNames = new Set(connectedPhysical.map((a) => a.name.toLowerCase()))

    const ipOnConnectedPhysical = summary.physicalValidInterfaces.filter((item) =>
      connectedNames.has(item.name.toLowerCase())
    )

    const virtualHint = summary.virtualValidInterfaces.length
      ? `当前虚拟适配器(${summary.virtualValidInterfaces.map((i) => i.name).join('、')})持有 IP,不代表 Wi-Fi/网线已连接。`
      : ''

    const evidence = [
      summary.physicalValidInterfaces.length
        ? `物理网卡 IPv4: ${summary.physicalValidInterfaces.map((i) => `${i.name}(${i.address})`).join(', ')}`
        : '物理网卡 IPv4: 无',
      ipOnConnectedPhysical.length
        ? `已连接物理网卡 IPv4: ${ipOnConnectedPhysical.map((i) => `${i.name}(${i.address})`).join(', ')}`
        : '已连接物理网卡 IPv4: 无',
      summary.virtualValidInterfaces.length
        ? `虚拟适配器 IPv4(不作为联网依据): ${summary.virtualValidInterfaces.map((i) => `${i.name}(${i.address})`).join(', ')}`
        : '',
      physicalAdapters.length
        ? `物理适配器: ${physicalAdapters.map((a) => `${a.name}[${a.enabled ? '启用' : '禁用'}/${a.connected ? '已连接' : '未连接'}]`).join('; ')}`
        : '物理适配器: 未识别'
    ].filter(Boolean)

    if (physicalAdapters.length === 0) {
      return {
        id: 'link-adapter',
        layer: 'link',
        name: '网卡与链路状态',
        status: 'fail',
        message: '未识别到 WLAN/以太网等物理网络适配器,无法判断链路状态。',
        evidence,
        riskLevel: 'recommended'
      }
    }

    // 情况 1: 所有物理网卡均被禁用
    if (enabledPhysical.length === 0) {
      return {
        id: 'link-adapter',
        layer: 'link',
        name: '网卡与链路状态',
        status: 'fail',
        message:
          `所有物理网络适配器(${physicalAdapters.map((a) => a.name).join('、')})均被禁用,无法联网。` +
          '请执行「启用网络适配器」。' +
          virtualHint,
        evidence,
        riskLevel: 'recommended'
      }
    }

    // 情况 2: 物理网卡已启用但均未连接(Wi-Fi 关闭/未连,或网线未插入) — 必须在 IP 检查之前
    if (connectedPhysical.length === 0) {
      const wlanAdapters = physicalAdapters.filter((a) => /wlan|wi-?fi|无线/i.test(a.name))
      const wiredAdapters = physicalAdapters.filter((a) => /以太网|ethernet/i.test(a.name))
      const hints: string[] = []

      if (wlanAdapters.some((a) => !a.enabled)) {
        hints.push('WLAN 适配器被禁用,可执行「启用网络适配器」')
      } else if (wlanAdapters.length) {
        hints.push('请开启 Wi-Fi 并连接到可用网络')
      }

      if (wiredAdapters.some((a) => a.enabled && !a.connected)) {
        hints.push('以太网已启用但网线未插入或未检测到链路,请检查网线连接')
      }

      if (disabledPhysical.length) {
        hints.push(`仍被禁用的适配器: ${disabledPhysical.map((a) => a.name).join('、')}`)
      }

      return {
        id: 'link-adapter',
        layer: 'link',
        name: '网卡与链路状态',
        status: 'fail',
        message: `未检测到已连接的物理网络(Wi-Fi 未连接或网线未插入)。${hints.join('; ')}。${virtualHint}`,
        evidence,
        riskLevel: 'recommended'
      }
    }

    // 情况 3: 已连接但仅有 APIPA(169.254)
    const apipaOnConnected = summary.apipaInterfaces.filter((item) => connectedNames.has(item.name.toLowerCase()))
    if (ipOnConnectedPhysical.length === 0 && apipaOnConnected.length > 0) {
      return {
        id: 'link-adapter',
        layer: 'link',
        name: '网卡与链路状态',
        status: 'fail',
        message:
          '物理网卡已连接,但仅获取到 169.254.x.x 自动专用地址(APIPA),未能从路由器获取有效 IP。' +
          '建议执行「释放并重新获取 IP(自动获取)」。' +
          virtualHint,
        evidence,
        riskLevel: 'recommended'
      }
    }

    // 情况 4: 已连接但未获取到有效 IP(可能残留 IP 在未连接的虚拟/其他接口上)
    if (ipOnConnectedPhysical.length === 0) {
      return {
        id: 'link-adapter',
        layer: 'link',
        name: '网卡与链路状态',
        status: 'fail',
        message:
          `物理网卡(${connectedPhysical.map((a) => a.name).join('、')})已连接但未获取到有效 IP,` +
          '建议执行「释放并重新获取 IP(自动获取)」。' +
          virtualHint,
        evidence,
        riskLevel: 'recommended'
      }
    }

    // 情况 5: 已连接的物理网卡持有有效 IP
    return {
      id: 'link-adapter',
      layer: 'link',
      name: '网卡与链路状态',
      status: 'pass',
      message: `物理网卡(${connectedPhysical.map((a) => a.name).join('、')})已连接并获取有效 IP,链路正常。`,
      evidence,
      riskLevel: 'safe'
    }
  }

  /** 获取当前平台网卡的启用/连接状态。Windows 优先用 Get-NetAdapter 获取 MediaConnectionState。 */
  private async getAdapterStates(): Promise<AdapterState[]> {
    if (this.platform.isWindows()) {
      const psResult = await this.commandRunner
        .run(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            'Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, AdminStatus, MediaConnectionState | ConvertTo-Json -Compress'
          ],
          10_000
        )
        .catch(() => ({ stdout: '', stderr: '' }))

      const fromPowerShell = parseWindowsNetAdapterJson(psResult.stdout)
      if (fromPowerShell.length > 0) return fromPowerShell

      const netshResult = await this.commandRunner
        .run('netsh', ['interface', 'show', 'interface'], 10_000)
        .catch(() => ({ stdout: '', stderr: '' }))
      return parseWindowsAdapterStates(netshResult.stdout)
    }

    const result = await this.commandRunner.run('ifconfig', [], 10_000).catch(() => ({ stdout: '', stderr: '' }))
    return parseMacAdapterStates(result.stdout)
  }

  private async checkNetworkLayer(): Promise<NetworkCheck> {
    const host = '1.1.1.1'
    const args = this.platform.isWindows() ? ['-n', '1', host] : ['-c', '1', host]
    const result = await this.commandRunner.run('ping', args, 5_000).catch(() => ({ stdout: '', stderr: '网关或公网 IP 不可达' }))
    const reachable = /TTL=|ttl=/i.test(result.stdout)

    return {
      id: 'network-public-ip',
      layer: 'network',
      name: '公网 IP 连通性',
      status: reachable ? 'pass' : 'fail',
      message: reachable ? '公网 IP 可达。' : '公网 IP 不可达,可能是网关、路由、IP 配置或运营商链路问题。',
      evidence: [result.stdout || result.stderr],
      riskLevel: reachable ? 'safe' : 'recommended'
    }
  }

  private async checkDnsLayer(): Promise<NetworkCheck> {
    // 中文注释: 以 Node.js 系统解析器为主判定依据,nslookup 仅作辅助证据,避免 Windows 环境下误报。
    const summary = await probeSystemDns()
    const evidence = formatDnsEvidence(summary)

    if (summary.systemDnsOk) {
      return {
        id: 'dns-resolution',
        layer: 'dns',
        name: 'DNS 解析',
        status: 'pass',
        message: `DNS 解析正常,${summary.successCount} 个探测域名已成功解析。`,
        evidence,
        riskLevel: 'safe'
      }
    }

    // 系统 DNS 失败时,用公共 DNS 对照判断是本地 DNS 配置问题还是全网不可达
    const publicResult = await this.commandRunner
      .run('nslookup', ['example.com', '1.1.1.1'], 8_000)
      .catch(() => ({ stdout: '', stderr: '' }))
    const publicResolved = this.isNslookupResolved(`${publicResult.stdout}\n${publicResult.stderr}`)
    const reason = this.explainDnsResult(false, publicResolved, summary.probes.map((p) => p.error).join('; '))

    return {
      id: 'dns-resolution',
      layer: 'dns',
      name: 'DNS 解析',
      status: 'fail',
      message: `DNS 解析异常(${summary.successCount}/3 个域名成功)。原因判断: ${reason}`,
      evidence: [...evidence, `公共 DNS(1.1.1.1): ${publicResolved ? '成功' : '失败'}`],
      riskLevel: 'recommended'
    }
  }

  private isNslookupResolved(output: string): boolean {
    const text = output.trim()
    if (!text) return false
    const hasAddress = /Name:|名称:|Addresses?:|地址:|Address:\s*\d/i.test(text)
    const hasFailure = /can't find|Non-existent|NXDOMAIN|找不到|超时|timed out|No response from server|请求超时|非权威应答.*失败/i.test(text)
    return hasAddress && !hasFailure
  }

  private explainDnsResult(defaultResolved: boolean, publicResolved: boolean, defaultEvidence: string): string {
    if (defaultResolved) {
      return '本机 DNS 已成功解析。'
    }

    if (publicResolved) {
      return '公共 DNS 可解析但本机默认 DNS 失败，优先检查当前 DNS 服务器、代理/VPN 或运营商 DNS 缓存。'
    }

    if (/timed out|超时/i.test(defaultEvidence)) {
      return 'DNS 请求超时，可能是防火墙、代理/VPN 或网络出口阻断 UDP/TCP 53。'
    }

    return '本机 DNS 与公共 DNS 都失败，可能是当前网络出口不可用或系统网络栈异常。'
  }

  private async checkTransportLayer(): Promise<NetworkCheck> {
    const netstat = await this.commandRunner.run('netstat', ['-an'], 8_000).catch(() => ({ stdout: '', stderr: '' }))
    const timeWaitCount = (netstat.stdout.match(/TIME_WAIT/gi) ?? []).length
    const establishedCount = (netstat.stdout.match(/ESTABLISHED/gi) ?? []).length
    const localhost9999Listening = /127\.0\.0\.1:9999.*LISTENING/i.test(netstat.stdout)
    const localhost9999Established = (netstat.stdout.match(/127\.0\.0\.1:9999.*ESTABLISHED/gi) ?? []).length

    let portStart = 0
    let portCount = 0
    let portMessage = ''

    if (this.platform.isWindows()) {
      const portRange = await this.commandRunner
        .run('netsh', ['int', 'ipv4', 'show', 'dynamicport', 'tcp'], 8_000)
        .catch(() => ({ stdout: '', stderr: '' }))
      const numbers = [...portRange.stdout.matchAll(/:\s*(\d+)/g)].map((match) => Number(match[1]))
      if (numbers.length >= 2) {
        portStart = numbers[0]
        portCount = numbers[1]
        portMessage = `动态端口: ${portStart} ~ ${portStart + portCount - 1} (共 ${portCount} 个)`
      } else {
        portMessage = portRange.stdout.slice(0, 200)
      }
    }

    const portExhaustionRisk = portCount > 0 && establishedCount >= Math.max(200, Math.floor(portCount * 0.7))
    const smallPortRange = portCount > 0 && portCount < 5000
    const suspiciousTestPattern = localhost9999Listening && localhost9999Established > 50

    let status: NetworkCheck['status'] = 'pass'
    let message = `TIME_WAIT ${timeWaitCount} 个, ESTABLISHED ${establishedCount} 个, Socket 资源正常。`
    let riskLevel: NetworkCheck['riskLevel'] = 'safe'

    if (suspiciousTestPattern || portExhaustionRisk) {
      status = 'fail'
      riskLevel = 'recommended'
      message = `临时端口资源紧张或已耗尽(ESTABLISHED=${establishedCount}`
      if (portCount > 0) {
        message += `, 动态端口池=${portCount}`
      }
      message += ')。'
      if (suspiciousTestPattern) {
        message += ' 检测到本机 127.0.0.1:9999 大量连接,请先停止端口占用测试脚本(如 listen9999.py / sockettest.py)。'
      }
      message += ' 建议使用「重置 TCP 动态端口范围」修复;DNS/ Winsock 重置无法释放已被占用的临时端口。'
    } else if (timeWaitCount > 5000 || smallPortRange) {
      status = 'warning'
      riskLevel = 'recommended'
      message = smallPortRange
        ? `动态端口范围偏小(仅 ${portCount} 个),高并发下容易端口耗尽,建议使用「重置 TCP 动态端口范围」。`
        : `TIME_WAIT 连接过多(${timeWaitCount}),可能存在端口回收延迟。`
    }

    return {
      id: 'transport-socket',
      layer: 'transport',
      name: 'Socket 与 TCP 资源',
      status,
      message,
      evidence: [
        `TIME_WAIT=${timeWaitCount}`,
        `ESTABLISHED=${establishedCount}`,
        localhost9999Established > 0 ? `127.0.0.1:9999 ESTABLISHED=${localhost9999Established}` : '',
        portMessage
      ].filter(Boolean),
      riskLevel
    }
  }

  private async checkApplicationLayer(): Promise<NetworkCheck> {
    const testUrl = 'https://www.microsoft.com'
    let statusCode = '0'

    if (this.platform.isWindows()) {
      const script = `(Invoke-WebRequest -Uri '${testUrl}' -UseBasicParsing -TimeoutSec 5).StatusCode`
      const result = await this.commandRunner
        .run('powershell', ['-NoProfile', '-Command', script], 8_000)
        .catch(() => ({ stdout: '', stderr: '' }))
      statusCode = result.stdout.trim()
    } else {
      const result = await this.commandRunner
        .run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', testUrl, '--max-time', '5'], 8_000)
        .catch(() => ({ stdout: '', stderr: '' }))
      statusCode = result.stdout.trim()
    }

    const ok = statusCode.startsWith('2') || statusCode.startsWith('3')

    return {
      id: 'application-http',
      layer: 'application',
      name: 'HTTP 应用层访问',
      status: ok ? 'pass' : statusCode === '0' ? 'unknown' : 'fail',
      message: ok ? 'HTTPS 访问正常,应用层无异常。' : 'HTTP 访问失败,可能存在代理、防火墙或认证门户拦截。',
      evidence: [`HTTP ${statusCode}`],
      riskLevel: ok ? 'safe' : 'recommended'
    }
  }

  private async checkExternalFactors(): Promise<NetworkCheck> {
    const hosts = ['8.8.8.8', '223.5.5.5', '1.1.1.1']
    const results = await Promise.all(
      hosts.map(async (host) => {
        const args = this.platform.isWindows() ? ['-n', '1', host] : ['-c', '1', host]
        const result = await this.commandRunner.run('ping', args, 4_000).catch(() => ({ stdout: '', stderr: '' }))
        return { host, ok: /TTL=|ttl=/i.test(result.stdout) }
      })
    )

    const reachableCount = results.filter((item) => item.ok).length
    const status = reachableCount === hosts.length ? 'pass' : reachableCount === 0 ? 'fail' : 'warning'

    return {
      id: 'external-isp',
      layer: 'external',
      name: '外部网络因素',
      status,
      message:
        reachableCount === hosts.length
          ? '多个外部节点可达,运营商链路正常。'
          : reachableCount === 0
            ? '外部节点均不可达,可能是运营商链路或区域性网络故障。'
            : `部分外部节点不可达(${reachableCount}/${hosts.length}),可能存在区域性 DNS 污染或路由问题。`,
      evidence: results.map((item) => `${item.host}: ${item.ok ? '可达' : '不可达'}`),
      riskLevel: reachableCount === hosts.length ? 'safe' : 'recommended'
    }
  }
}
