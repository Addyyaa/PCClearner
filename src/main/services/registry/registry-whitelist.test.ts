import { describe, expect, it } from 'vitest'
import { filterSafeRegistryIssues, isProtectedRegistryPath } from './registry-whitelist'

describe('registry-whitelist', () => {
  it('拒绝清理系统关键路径', () => {
    expect(isProtectedRegistryPath('SYSTEM\\CurrentControlSet\\Control')).toBe(true)
    expect(isProtectedRegistryPath('Software\\MyApp\\Run', 'Windows Defender')).toBe(true)
  })

  it('过滤受保护注册表问题', () => {
    const issues = filterSafeRegistryIssues([
      {
        id: '1',
        hive: 'HKCU',
        keyPath: 'Software\\Demo',
        issueType: 'startup',
        riskLevel: 'recommended',
        selectedByDefault: true,
        description: 'demo'
      },
      {
        id: '2',
        hive: 'HKLM',
        keyPath: 'SYSTEM\\Demo',
        issueType: 'startup',
        riskLevel: 'dangerous',
        selectedByDefault: false,
        description: 'protected'
      }
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe('1')
  })
})
