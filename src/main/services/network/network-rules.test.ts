import { describe, expect, it } from 'vitest'
import type { NetworkCheck } from '../../../../shared/types'
import { NetworkRuleEngine } from './network-rules'

describe('NetworkRuleEngine', () => {
  it('DNS 异常时推荐刷新 DNS 缓存', () => {
    const checks: NetworkCheck[] = [
      {
        id: 'dns',
        layer: 'dns',
        name: 'DNS 解析',
        status: 'fail',
        message: '解析失败',
        evidence: [],
        riskLevel: 'recommended'
      }
    ]

    const result = new NetworkRuleEngine().inferDiagnosis(checks)

    expect(result.rootCauses).toHaveLength(1)
    expect(result.recommendedFixes.some((fix) => fix.id === 'flush-dns')).toBe(true)
    expect(result.recommendedFixes.some((fix) => fix.id === 'set-public-dns')).toBe(true)
  })

  it('传输层故障时推荐重置 Winsock 与 TCP/IP', () => {
    const checks: NetworkCheck[] = [
      {
        id: 'transport',
        layer: 'transport',
        name: 'Socket 与 TCP 资源',
        status: 'warning',
        message: 'TIME_WAIT 过多',
        evidence: [],
        riskLevel: 'recommended'
      }
    ]

    const fixIds = new NetworkRuleEngine().inferDiagnosis(checks).recommendedFixes.map((fix) => fix.id)

    expect(fixIds).toContain('reset-winsock')
    expect(fixIds).toContain('reset-dynamic-ports')
    expect(fixIds).toContain('reset-tcpip')
  })

  it('全部检查通过时不推荐任何修复', () => {
    const checks: NetworkCheck[] = [
      {
        id: 'dns',
        layer: 'dns',
        name: 'DNS 解析',
        status: 'pass',
        message: '正常',
        evidence: [],
        riskLevel: 'safe'
      }
    ]

    expect(new NetworkRuleEngine().inferDiagnosis(checks).recommendedFixes).toHaveLength(0)
  })
})
