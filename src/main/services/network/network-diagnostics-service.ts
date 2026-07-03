import type { NetworkCheck, NetworkDiagnosis } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { NetworkRuleEngine } from './network-rules'

export class NetworkDiagnosticsService {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly ruleEngine: NetworkRuleEngine
  ) {}

  async diagnose(): Promise<NetworkDiagnosis> {
    const checks: NetworkCheck[] = [
      await this.checkLinkLayer(),
      await this.checkNetworkLayer(),
      await this.checkDnsLayer(),
      await this.checkTransportLayer(),
      await this.checkApplicationLayer(),
      await this.checkExternalFactors()
    ]
    const inferred = this.ruleEngine.inferDiagnosis(checks)

    return {
      checks,
      ...inferred
    }
  }

  private async checkLinkLayer(): Promise<NetworkCheck> {
    const command = this.platform.isWindows() ? 'ipconfig' : 'ifconfig'
    const result = await this.commandRunner.run(command).catch(() => ({ stdout: '', stderr: '无法读取网卡信息' }))
    const hasAdapter = /IPv4|inet /i.test(result.stdout)

    return {
      id: 'link-adapter',
      layer: 'link',
      name: '网卡与链路状态',
      status: hasAdapter ? 'pass' : 'unknown',
      message: hasAdapter ? '已读取网卡配置,链路层正常。' : '无法读取网卡信息,需要检查权限或系统命令可用性。',
      evidence: [result.stdout.slice(0, 500)],
      riskLevel: 'safe'
    }
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
    const defaultResult = await this.commandRunner
      .run('nslookup', ['example.com'], 8_000)
      .catch(() => ({ stdout: '', stderr: 'DNS 解析失败' }))
    const publicResult = await this.commandRunner
      .run('nslookup', ['example.com', '1.1.1.1'], 8_000)
      .catch(() => ({ stdout: '', stderr: '公共 DNS 对照解析失败' }))
    const defaultResolved = this.isNslookupResolved(defaultResult.stdout)
    const publicResolved = this.isNslookupResolved(publicResult.stdout)
    const reason = this.explainDnsResult(defaultResolved, publicResolved, defaultResult.stderr || defaultResult.stdout)

    return {
      id: 'dns-resolution',
      layer: 'dns',
      name: 'DNS 解析',
      status: defaultResolved ? 'pass' : 'fail',
      message: defaultResolved ? 'DNS 可正常解析。' : `DNS 解析异常。原因判断: ${reason}`,
      evidence: [
        `本机 DNS: ${defaultResolved ? '成功' : '失败'}`,
        `公共 DNS(1.1.1.1): ${publicResolved ? '成功' : '失败'}`,
        (defaultResult.stdout || defaultResult.stderr).slice(0, 500)
      ],
      riskLevel: defaultResolved ? 'safe' : 'recommended'
    }
  }

  private isNslookupResolved(output: string): boolean {
    return /Name:|名称:|Addresses?:|地址:/i.test(output) && !/can't find|Non-existent|NXDOMAIN|找不到|超时|timed out/i.test(output)
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
    const netstatArgs = this.platform.isWindows() ? ['-an'] : ['-an']
    const netstat = await this.commandRunner.run('netstat', netstatArgs).catch(() => ({ stdout: '', stderr: '' }))
    const timeWaitCount = (netstat.stdout.match(/TIME_WAIT/gi) ?? []).length

    let portMessage = ''
    if (this.platform.isWindows()) {
      const portRange = await this.commandRunner
        .run('netsh', ['int', 'ipv4', 'show', 'dynamicport', 'tcp'])
        .catch(() => ({ stdout: '', stderr: '' }))
      portMessage = portRange.stdout.slice(0, 200)
    }

    const status = timeWaitCount > 5000 ? 'warning' : timeWaitCount > 0 ? 'pass' : 'unknown'

    return {
      id: 'transport-socket',
      layer: 'transport',
      name: 'Socket 与 TCP 资源',
      status,
      message:
        timeWaitCount > 5000
          ? `TIME_WAIT 连接过多(${timeWaitCount}),可能存在端口耗尽风险。`
          : `TIME_WAIT 连接 ${timeWaitCount} 个,Socket 资源正常。`,
      evidence: [`TIME_WAIT=${timeWaitCount}`, portMessage].filter(Boolean),
      riskLevel: timeWaitCount > 5000 ? 'recommended' : 'safe'
    }
  }

  private async checkApplicationLayer(): Promise<NetworkCheck> {
    const testUrl = 'https://www.microsoft.com'
    let statusCode = '0'

    if (this.platform.isWindows()) {
      const script = `(Invoke-WebRequest -Uri '${testUrl}' -UseBasicParsing -TimeoutSec 8).StatusCode`
      const result = await this.commandRunner
        .run('powershell', ['-NoProfile', '-Command', script])
        .catch(() => ({ stdout: '', stderr: '' }))
      statusCode = result.stdout.trim()
    } else {
      const result = await this.commandRunner
        .run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', testUrl, '--max-time', '8'])
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
