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

  it('事件日志定位进程时优先推荐参数化终止修复', () => {
    const sampleApp = 'LeakApp.exe'
    const checks: NetworkCheck[] = [
      {
        id: 'transport-socket',
        layer: 'transport',
        name: 'Socket 与 TCP 资源',
        status: 'fail',
        message: `${sampleApp} 报告 Socket 10055`,
        evidence: [],
        riskLevel: 'recommended',
        relatedFixes: [
          {
            id: 'stop-socket-leak-process',
            title: `终止占用 Socket 的进程/服务 (${sampleApp})`,
            description: `停止 ${sampleApp}`,
            requiresElevation: true,
            reversible: true,
            platform: 'windows',
            target: sampleApp
          }
        ]
      }
    ]

    const fixes = new NetworkRuleEngine().inferDiagnosis(checks).recommendedFixes
    const stopFix = fixes.find((fix) => fix.id === 'stop-socket-leak-process')

    expect(stopFix?.target).toBe(sampleApp)
    expect(fixes[0].id).toBe('stop-socket-leak-process')
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
