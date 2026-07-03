import type { CleanRequest, DiskScanOptions, DiskScanResult, OperationResult } from '../../../../shared/types'
import { PlatformService } from '../../platform/platform-service'
import { resolveEnvironmentPath } from '../../utils/path-resolver'
import { DiskCleaner } from './cleaner'
import { MAC_CLEANABLE_LOCATIONS } from './catalog.mac'
import { WINDOWS_CLEANABLE_LOCATIONS } from './catalog.win'
import { DiskScanner } from './scanner'

export class DiskCleanerService {
  private lastScan?: DiskScanResult

  constructor(
    private readonly platform: PlatformService,
    private readonly scanner: DiskScanner,
    private readonly cleaner: DiskCleaner
  ) {}

  async scan(options: DiskScanOptions): Promise<DiskScanResult> {
    const allLocations = this.platform.isWindows() ? WINDOWS_CLEANABLE_LOCATIONS : MAC_CLEANABLE_LOCATIONS
    const targetLocations = options.includeBrowserCaches
      ? allLocations
      : allLocations.filter((location) => location.category !== 'browser')
    const locations = options.targetPath
      ? targetLocations.filter((location) => this.isLocationOnVolume(location.path, options.targetPath!))
      : targetLocations

    this.lastScan = await this.scanner.scan(locations, options)
    return this.lastScan
  }

  async clean(request: CleanRequest): Promise<OperationResult> {
    if (!this.lastScan) {
      return { success: false, message: '请先完成扫描再执行清理' }
    }

    return this.cleaner.clean(request, this.lastScan.items)
  }

  /** 判断清理目录是否位于所选磁盘卷上 */
  private isLocationOnVolume(locationPath: string, targetVolume: string): boolean {
    const resolved = resolveEnvironmentPath(locationPath)
    const normalizedTarget = targetVolume.replace(/[/\\]+$/, '')

    if (this.platform.isWindows()) {
      const driveLetter = normalizedTarget.slice(0, 2).toUpperCase()
      return resolved.toUpperCase().startsWith(driveLetter)
    }

    if (normalizedTarget === '/') {
      return true
    }

    return resolved.startsWith(normalizedTarget)
  }
}
