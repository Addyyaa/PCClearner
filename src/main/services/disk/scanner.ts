import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CleanableItem, CleanableLocation, DiskScanOptions, DiskScanResult } from '../../../../shared/types'
import { createId } from '../../utils/id'
import { resolveEnvironmentPath } from '../../utils/path-resolver'
import { CleanupRuleEngine } from './rules'

/** 命中即整目录清理的垃圾目录名（小写）。 */
const JUNK_DIR_NAMES = new Set([
  'cache',
  'caches',
  'gpucache',
  'code cache',
  'codecache',
  'crashpad',
  'crashdumps',
  'blob_storage',
  'service worker',
  'logs',
  'temp',
  'tmp'
])

/** 垃圾文件扩展名（小写）。 */
const JUNK_FILE_EXTENSIONS = new Set(['.log', '.tmp', '.dmp', '.old', '.etl', '.cache'])

/** 启发式扫描时跳过的敏感目录名，避免误伤配置或数据。 */
const HEURISTIC_SKIP_DIRS = new Set(['user data', 'databases', 'local storage', 'indexeddb', 'sync data'])

/** 启发式扫描的最大递归深度（相对每个根目录）。 */
const HEURISTIC_MAX_DEPTH = 4

export class DiskScanner {
  constructor(private readonly ruleEngine: CleanupRuleEngine) {}

  async scan(locations: CleanableLocation[], options: DiskScanOptions): Promise<DiskScanResult> {
    const items: CleanableItem[] = []
    const maxDepth = options.maxDepth ?? 2

    for (const location of locations) {
      const resolvedPath = resolveEnvironmentPath(location.path)

      const locationItems =
        location.scanMode === 'junkHeuristic'
          ? await this.scanJunkHeuristic(location, resolvedPath, HEURISTIC_MAX_DEPTH)
          : await this.scanDirectory(location, resolvedPath, maxDepth)

      items.push(...locationItems)
    }

    const selectedItems = items.filter((item) => item.selectedByDefault)
    const inaccessibleLocations = locations
      .filter((location) => location.requiresElevation && !items.some((item) => item.sourceLocationId === location.id))
      .map((location) => location.name)

    return {
      items,
      summary: {
        totalItems: items.length,
        selectedItems: selectedItems.length,
        totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
        selectedBytes: selectedItems.reduce((sum, item) => sum + item.sizeBytes, 0),
        inaccessibleLocations: inaccessibleLocations.length > 0 ? inaccessibleLocations : undefined
      }
    }
  }

  private async scanDirectory(location: CleanableLocation, directoryPath: string, depth: number): Promise<CleanableItem[]> {
    if (depth < 0) return []

    try {
      const entries = await readdir(directoryPath, { withFileTypes: true })
      const items: CleanableItem[] = []

      for (const entry of entries) {
        const entryPath = join(directoryPath, entry.name)
        const stats = await stat(entryPath)

        if (entry.isDirectory()) {
          items.push(...(await this.scanDirectory(location, entryPath, depth - 1)))
          continue
        }

        const rule = this.ruleEngine.classify(location, entryPath, stats.size)
        items.push({
          id: createId('clean'),
          path: entryPath,
          name: entry.name,
          sizeBytes: stats.size,
          category: location.category,
          sourceLocationId: location.id,
          lastModified: stats.mtime.toISOString(),
          ...rule
        })
      }

      return items
    } catch {
      // 中文注释: 扫描系统目录时权限不足是预期情况,后续在 UI 中展示为可提权扫描。
      return []
    }
  }

  /**
   * 启发式扫描：递归第三方应用目录，命中垃圾目录整目录聚合、命中垃圾文件单独列出。
   * appDepth 用于标记当前是否已进入某个应用的子目录，便于展示来源应用名。
   */
  private async scanJunkHeuristic(
    location: CleanableLocation,
    directoryPath: string,
    depth: number,
    appName?: string
  ): Promise<CleanableItem[]> {
    if (depth < 0) return []

    try {
      const entries = await readdir(directoryPath, { withFileTypes: true })
      const items: CleanableItem[] = []

      for (const entry of entries) {
        const entryPath = join(directoryPath, entry.name)
        const lowerName = entry.name.toLowerCase()

        if (entry.isSymbolicLink()) continue

        if (entry.isDirectory()) {
          if (HEURISTIC_SKIP_DIRS.has(lowerName)) continue

          // 顶层子目录名视为应用名，用于结果展示。
          const nextAppName = appName ?? entry.name

          if (JUNK_DIR_NAMES.has(lowerName)) {
            const sizeBytes = await this.computeDirectorySize(entryPath, 6)
            if (sizeBytes > 0) {
              items.push(
                this.createHeuristicItem(location, entryPath, entry.name, sizeBytes, true, nextAppName, lowerName)
              )
            }
            continue
          }

          items.push(...(await this.scanJunkHeuristic(location, entryPath, depth - 1, nextAppName)))
          continue
        }

        if (!entry.isFile()) continue

        const extension = lowerName.slice(lowerName.lastIndexOf('.'))
        if (!JUNK_FILE_EXTENSIONS.has(extension)) continue

        try {
          const stats = await stat(entryPath)
          items.push(this.createHeuristicItem(location, entryPath, entry.name, stats.size, false, appName, extension))
        } catch {
          // 中文注释: 单文件读取失败忽略,不影响整体扫描。
        }
      }

      return items
    } catch {
      return []
    }
  }

  private createHeuristicItem(
    location: CleanableLocation,
    path: string,
    name: string,
    sizeBytes: number,
    isDirectory: boolean,
    appName: string | undefined,
    matchedKey: string
  ): CleanableItem {
    const category = this.mapJunkCategory(matchedKey)
    const rule = this.ruleEngine.classify({ ...location, category }, path, sizeBytes)
    const appLabel = appName ? `「${appName}」` : ''

    return {
      id: createId('clean'),
      path,
      name,
      sizeBytes,
      category,
      sourceLocationId: location.id,
      isDirectory,
      appName,
      ...rule,
      description: isDirectory
        ? `${appLabel}应用的${name}垃圾目录,清理后应用会按需重建。`
        : `${appLabel}应用产生的${name}垃圾文件。`
    }
  }

  private mapJunkCategory(matchedKey: string): CleanableLocation['category'] {
    if (matchedKey.includes('log') || matchedKey === '.log' || matchedKey === '.etl') return 'log'
    if (matchedKey.includes('temp') || matchedKey.includes('tmp') || matchedKey === '.tmp') return 'temp'
    return 'cache'
  }

  /** 递归汇总目录大小，带深度上限防止极端目录树拖慢扫描。 */
  private async computeDirectorySize(directoryPath: string, depth: number): Promise<number> {
    if (depth < 0) return 0

    try {
      const entries = await readdir(directoryPath, { withFileTypes: true })
      let total = 0

      for (const entry of entries) {
        const entryPath = join(directoryPath, entry.name)

        if (entry.isSymbolicLink()) continue

        if (entry.isDirectory()) {
          total += await this.computeDirectorySize(entryPath, depth - 1)
          continue
        }

        try {
          const stats = await stat(entryPath)
          total += stats.size
        } catch {
          // 忽略无法读取的文件
        }
      }

      return total
    } catch {
      return 0
    }
  }
}
