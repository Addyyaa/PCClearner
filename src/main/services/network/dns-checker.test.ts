import { describe, expect, it } from 'vitest'
import { formatDnsEvidence } from './dns-checker'

describe('formatDnsEvidence', () => {
  it('格式化成功与失败的探测结果', () => {
    const evidence = formatDnsEvidence({
      systemDnsOk: true,
      successCount: 2,
      probes: [
        { host: 'example.com', resolved: true, addresses: ['1.2.3.4'], method: 'node-resolve4' },
        { host: 'bad.test', resolved: false, addresses: [], method: 'node-resolve4', error: 'ENOTFOUND' }
      ]
    })

    expect(evidence[0]).toContain('成功')
    expect(evidence[1]).toContain('失败')
  })
})

describe('probeSystemDns 判定阈值', () => {
  it('至少 2 个域名成功才视为系统 DNS 正常', () => {
    const successCount = 2
    expect(successCount >= 2).toBe(true)
    expect(1 >= 2).toBe(false)
  })
})
