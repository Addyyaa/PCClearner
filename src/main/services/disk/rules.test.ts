import { describe, expect, it } from 'vitest'
import type { CleanableLocation } from '../../../../shared/types'
import { CleanupRuleEngine } from './rules'

const tempLocation: CleanableLocation = {
  id: 'temp',
  name: '临时目录',
  path: '/tmp',
  platform: 'macos',
  category: 'temp',
  requiresElevation: false,
  description: '临时文件目录'
}

describe('CleanupRuleEngine', () => {
  it('默认勾选建议删除项', () => {
    const result = new CleanupRuleEngine().classify(tempLocation, '/tmp/demo.tmp', 1024)

    expect(result.riskLevel).toBe('recommended')
    expect(result.selectedByDefault).toBe(true)
    expect(result.recommendedLabel).toBe('建议删除')
  })
})
