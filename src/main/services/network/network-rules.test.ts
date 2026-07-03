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
  })
})
