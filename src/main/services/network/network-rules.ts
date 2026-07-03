import type { NetworkCheck, NetworkDiagnosis, NetworkFixAction } from '../../../../shared/types'

export class NetworkRuleEngine {
  inferDiagnosis(checks: NetworkCheck[]): Pick<NetworkDiagnosis, 'rootCauses' | 'recommendedFixes'> {
    const failedChecks = checks.filter((check) => check.status === 'fail' || check.status === 'warning')
    const rootCauses = failedChecks.map((check) => `${check.name}: ${check.message}`)

    return {
      rootCauses,
      recommendedFixes: this.selectFixes(failedChecks)
    }
  }

  private selectFixes(checks: NetworkCheck[]): NetworkFixAction[] {
    const fixes: NetworkFixAction[] = []

    if (checks.some((check) => check.layer === 'dns')) {
      fixes.push({
        id: 'flush-dns',
        title: '刷新 DNS 缓存',
        description: '清理本机 DNS 缓存,用于解决解析污染、陈旧记录或 DNS 缓存异常。',
        requiresElevation: false,
        reversible: false,
        platform: 'all'
      })
    }

    if (checks.some((check) => check.layer === 'network')) {
      fixes.push({
        id: 'renew-ip',
        title: '释放并重新获取 IP',
        description: '重新向 DHCP 服务器申请地址,用于解决 IP 配置异常或网关不可达问题。',
        requiresElevation: true,
        reversible: false,
        platform: 'all'
      })
    }

    if (checks.some((check) => check.layer === 'transport')) {
      fixes.push({
        id: 'reset-winsock',
        title: '重置 Socket/Winsock',
        description: '重置网络套接字目录,用于处理 socket 资源不足或 Winsock 损坏。',
        requiresElevation: true,
        reversible: false,
        platform: 'windows'
      })
    }

    return fixes
  }
}
