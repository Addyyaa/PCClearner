import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAC_CLEANABLE_LOCATIONS } from './catalog.mac'

describe('MAC_CLEANABLE_LOCATIONS', () => {
  it('包含至少 10 个清理位置', () => {
    expect(MAC_CLEANABLE_LOCATIONS.length).toBeGreaterThanOrEqual(10)
  })

  it('浏览器缓存路径位于用户目录下', () => {
    const browserLocations = MAC_CLEANABLE_LOCATIONS.filter((location) => location.category === 'browser')
    expect(browserLocations.length).toBeGreaterThanOrEqual(3)
    for (const location of browserLocations) {
      expect(location.path.startsWith(homedir())).toBe(true)
      expect(location.platform).toBe('macos')
    }
  })

  it('启发式扫描位置配置了 junkHeuristic', () => {
    const heuristicLocations = MAC_CLEANABLE_LOCATIONS.filter((location) => location.scanMode === 'junkHeuristic')
    expect(heuristicLocations.length).toBeGreaterThanOrEqual(2)
    expect(heuristicLocations.some((location) => location.path.includes('Application Support'))).toBe(true)
    expect(heuristicLocations.some((location) => location.path.includes('Containers'))).toBe(true)
  })

  it('Containers 启发式扫描使用更深递归深度', () => {
    const containers = MAC_CLEANABLE_LOCATIONS.find((location) => location.id === 'mac-containers-junk')
    expect(containers?.heuristicMaxDepth).toBe(5)
  })

  it('Xcode DerivedData 路径正确', () => {
    const derived = MAC_CLEANABLE_LOCATIONS.find((location) => location.id === 'mac-xcode-derived')
    expect(derived?.path).toBe(join(homedir(), 'Library', 'Developer', 'Xcode', 'DerivedData'))
  })
})
