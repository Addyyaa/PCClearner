import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ResidualItem,
  ResidualQuarantineRequest,
  ResidualQuarantineResult,
  ResidualScanResult
} from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { createId } from '../../utils/id'
import { OperationHistory } from '../safety/operation-history'
import { TrashService } from '../safety/trash-service'
import { normalizeName, readInstalledPrograms } from './installed-programs'

interface ScanRoot {
  path: string | undefined
  source: ResidualItem['source']
}

/** 归一化后视为系统/共享目录，永不当作残留。 */
const SAFE_FOLDER_NAMES = new Set(
  [
    'microsoft',
    'windows',
    'windowsapps',
    'windowsdefender',
    'common files',
    'commonfiles',
    'internet explorer',
    'windows nt',
    'windows photo viewer',
    'windows portable devices',
    'windows sidebar',
    'windows mail',
    'windows media player',
    'reference assemblies',
    'msbuild',
    'application verifier',
    'uninstall information',
    'modifiablewindowsapps',
    'packages',
    'package cache',
    'temp',
    'tmp',
    'google',
    'mozilla',
    'nvidia',
    'nvidia corporation',
    'intel',
    'amd',
    'realtek',
    'programdata',
    'desktop',
    'start menu',
    'startmenu',
    'ssh',
    'connecteddevicesplatform',
    'comms',
    'd3dscache',
    'elevateddiagnostics'
  ].map(normalizeName)
)

/** 递归汇总目录大小的最大深度，避免极端目录树拖慢扫描。 */
const SIZE_DEPTH_LIMIT = 5

export class ResidualScannerService {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly trashService: TrashService,
    private readonly history: OperationHistory
  ) {}

  async scan(): Promise<ResidualScanResult> {
    if (!this.platform.isWindows()) {
      return { supported: false, items: [], message: '卸载残留检测目前仅支持 Windows。' }
    }

    const installed = await readInstalledPrograms(this.commandRunner)
    const knownNames = new Set(installed.map((program) => normalizeName(program.name)).filter(Boolean))
    const knownLocations = installed
      .map((program) => program.installLocation?.toLowerCase())
      .filter((value): value is string => Boolean(value))

    const roots: ScanRoot[] = [
      { path: process.env.APPDATA, source: 'roamingAppData' },
      { path: process.env.LOCALAPPDATA, source: 'localAppData' },
      { path: process.env.ProgramData, source: 'programData' },
      { path: process.env.ProgramFiles, source: 'programFiles' },
      { path: process.env['ProgramFiles(x86)'], source: 'programFilesX86' }
    ]

    const items: ResidualItem[] = []

    for (const root of roots) {
      if (!root.path) continue
      items.push(...(await this.scanRoot(root.path, root.source, knownNames, knownLocations)))
    }

    return {
      supported: true,
      items: items.sort((left, right) => right.sizeBytes - left.sizeBytes)
    }
  }

  async quarantine(request: ResidualQuarantineRequest): Promise<ResidualQuarantineResult> {
    if (request.paths.length === 0) {
      return { success: false, message: '没有需要清理的残留目录。' }
    }

    const result = await this.trashService.moveToTrash(request.paths)
    const rollback = this.history.record('卸载残留清理', '残留目录已移动到系统回收站,可在回收站中恢复。')

    return { ...result, rollbackId: rollback.id }
  }

  private async scanRoot(
    rootPath: string,
    source: ResidualItem['source'],
    knownNames: Set<string>,
    knownLocations: string[]
  ): Promise<ResidualItem[]> {
    try {
      const entries = await readdir(rootPath, { withFileTypes: true })
      const items: ResidualItem[] = []

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue

        const folderName = entry.name
        const normalized = normalizeName(folderName)
        if (!normalized || SAFE_FOLDER_NAMES.has(normalized)) continue

        const entryPath = join(rootPath, folderName)
        const lowerPath = entryPath.toLowerCase()

        // 目录仍属于某个已安装程序的安装目录 -> 不是残留。
        const matchedByLocation = knownLocations.some(
          (location) => location.startsWith(lowerPath) || lowerPath.startsWith(location)
        )
        if (matchedByLocation) continue

        // 目录名能与已安装程序名互相包含 -> 认为仍在使用。
        const matchedByName = Array.from(knownNames).some(
          (name) => name.length > 2 && (name.includes(normalized) || normalized.includes(name))
        )
        if (matchedByName) continue

        const sizeBytes = await this.computeDirectorySize(entryPath, SIZE_DEPTH_LIMIT)
        if (sizeBytes === 0) continue

        items.push(this.createResidualItem(entryPath, folderName, sizeBytes, source))
      }

      return items
    } catch {
      return []
    }
  }

  private createResidualItem(
    path: string,
    name: string,
    sizeBytes: number,
    source: ResidualItem['source']
  ): ResidualItem {
    // 程序目录（Program Files）里的残留更可能是完整卸载遗留，风险等级低；
    // AppData 里残留可能含用户配置/存档，标记为谨慎处理。
    const inProgramDir = source === 'programFiles' || source === 'programFilesX86'
    const riskLevel = inProgramDir ? 'recommended' : 'cautious'

    return {
      id: createId('residual'),
      name,
      path,
      sizeBytes,
      source,
      riskLevel,
      reason: `在注册表已安装程序清单中未找到「${name}」对应的记录，疑似软件卸载后的残留目录。`,
      recommendation: inProgramDir
        ? '通常为卸载未清干净的程序目录，确认后可删除。'
        : '可能包含该软件的配置或存档，删除前请确认不再需要。'
    }
  }

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
