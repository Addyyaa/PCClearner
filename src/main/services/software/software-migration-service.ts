import { access, stat } from 'node:fs/promises'
import { basename, join, parse } from 'node:path'
import type {
  InstalledProgram,
  InstalledProgramListResult,
  SoftwareMigrationRequest,
  SoftwareMigrationResult
} from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { PrivilegeService } from '../../platform/privilege-service'
import { createId } from '../../utils/id'
import { OperationHistory } from '../safety/operation-history'
import { readInstalledPrograms } from './installed-programs'

/** 迁移落地的目标子目录，避免污染磁盘根目录。 */
const MIGRATION_FOLDER = 'PCCleanerMigrated'

export class SoftwareMigrationService {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly privilege: PrivilegeService,
    private readonly history: OperationHistory
  ) {}

  async listPrograms(): Promise<InstalledProgramListResult> {
    if (!this.platform.isWindows()) {
      return { supported: false, programs: [], message: '软件迁移目前仅支持 Windows。' }
    }

    const systemDrive = (process.env.SystemDrive ?? 'C:').toLowerCase()
    const installed = await readInstalledPrograms(this.commandRunner)
    const programs: InstalledProgram[] = []

    for (const program of installed) {
      const evaluated = await this.evaluateProgram(program, systemDrive)
      if (evaluated) {
        programs.push(evaluated)
      }
    }

    return {
      supported: true,
      programs: programs.sort((left, right) => (right.estimatedSizeBytes ?? 0) - (left.estimatedSizeBytes ?? 0))
    }
  }

  async migrate(request: SoftwareMigrationRequest): Promise<SoftwareMigrationResult> {
    if (!this.platform.isWindows()) {
      return { success: false, message: '软件迁移目前仅支持 Windows。' }
    }

    const source = request.sourcePath.replace(/[\\/]+$/, '')
    const validationError = await this.validateSource(source)
    if (validationError) {
      return { success: false, message: validationError }
    }

    const targetDrive = request.targetDrive.replace(/[\\/]+$/, '')
    if (!/^[a-z]:$/i.test(targetDrive)) {
      return { success: false, message: '目标磁盘格式不正确,应形如 D:。' }
    }

    const systemDrive = (process.env.SystemDrive ?? 'C:').toLowerCase()
    if (targetDrive.toLowerCase() === systemDrive) {
      return { success: false, message: '目标磁盘不能是系统盘,请选择其他磁盘。' }
    }

    const targetPath = join(`${targetDrive}\\`, MIGRATION_FOLDER, basename(source))
    if (await this.pathExists(targetPath)) {
      return { success: false, message: `目标位置已存在同名目录: ${targetPath},请先清理后再迁移。` }
    }

    try {
      await this.privilege.runElevated({
        name: 'PCCleaner',
        command: this.buildMigrationCommand(source, targetPath)
      })
    } catch (error) {
      return {
        success: false,
        message: `迁移失败: ${error instanceof Error ? error.message : '未知错误'}。原目录未改动,请确认程序已关闭且拥有管理员权限。`
      }
    }

    // 校验联接是否创建成功。
    if (!(await this.pathExists(source)) || !(await this.pathExists(targetPath))) {
      return { success: false, message: '迁移过程异常,请手动检查原目录与目标目录状态。' }
    }

    const rollback = this.history.record(
      `迁移软件「${request.name}」`,
      `已将 ${source} 迁移到 ${targetPath} 并建立目录联接。如需还原,请删除联接后将目录移回原位置。`
    )

    return {
      success: true,
      message: `「${request.name}」已迁移到 ${targetPath},原路径已建立目录联接,程序可正常使用。`,
      targetPath,
      rollbackId: rollback.id
    }
  }

  private async evaluateProgram(
    program: Awaited<ReturnType<typeof readInstalledPrograms>>[number],
    systemDrive: string
  ): Promise<InstalledProgram | undefined> {
    const base: InstalledProgram = {
      id: createId('program'),
      name: program.name,
      publisher: program.publisher,
      installLocation: program.installLocation,
      estimatedSizeBytes: program.estimatedSizeBytes,
      isOnSystemDrive: false,
      canMigrate: false
    }

    if (!program.installLocation) {
      return undefined
    }

    const location = program.installLocation
    const onSystemDrive = location.slice(0, 2).toLowerCase() === systemDrive
    base.isOnSystemDrive = onSystemDrive

    if (!onSystemDrive) {
      return undefined
    }

    const blockReason = this.getProtectedReason(location)
    if (blockReason) {
      base.migrateBlockReason = blockReason
      base.canMigrate = false
      return base
    }

    try {
      const stats = await stat(location)
      if (!stats.isDirectory()) {
        base.migrateBlockReason = '安装位置不是有效目录。'
        return base
      }
    } catch {
      base.migrateBlockReason = '安装目录不存在或无法访问。'
      return base
    }

    base.canMigrate = true
    return base
  }

  private async validateSource(source: string): Promise<string | undefined> {
    if (!/^[a-z]:\\/i.test(source)) {
      return '源路径不合法。'
    }

    const protectedReason = this.getProtectedReason(source)
    if (protectedReason) {
      return protectedReason
    }

    try {
      const stats = await stat(source)
      if (!stats.isDirectory()) {
        return '源路径不是目录,无法迁移。'
      }
    } catch {
      return '源目录不存在或无法访问。'
    }

    return undefined
  }

  /** 判断路径是否为受保护/不可迁移目录。 */
  private getProtectedReason(rawPath: string): string | undefined {
    const normalized = rawPath.replace(/\//g, '\\').toLowerCase()
    const parsed = parse(normalized)

    // 磁盘根目录不可迁移。
    if (parsed.dir === parsed.root && parsed.base === '') {
      return '磁盘根目录不可迁移。'
    }

    const windowsDir = (process.env.SystemRoot ?? 'C:\\Windows').toLowerCase()
    if (normalized === windowsDir || normalized.startsWith(`${windowsDir}\\`)) {
      return 'Windows 系统目录不可迁移。'
    }

    const blockedFragments = [
      '\\windowsapps',
      '\\common files',
      '\\microsoft\\windows',
      '\\windowsdefender',
      '\\microsoft office',
      '\\microsoft visual studio'
    ]
    if (blockedFragments.some((fragment) => normalized.includes(fragment))) {
      return '系统或关键组件目录,迁移可能导致程序无法运行,已阻止。'
    }

    // 直接等于 Program Files 根目录（而非其下的具体软件）不可迁移。
    const programRoots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())
    if (programRoots.includes(normalized)) {
      return '请选择具体软件目录,而不是 Program Files 根目录。'
    }

    return undefined
  }

  /**
   * 构建单行批处理迁移命令（在提权环境执行）：
   * 1. robocopy 完整复制（错误码 <8 视为成功）；2. 删除原目录；3. 建立目录联接。
   */
  private buildMigrationCommand(source: string, target: string): string {
    return (
      `robocopy "${source}" "${target}" /E /COPYALL /DCOPY:DAT /R:1 /W:1 ` +
      `& if errorlevel 8 (exit /b 1) else (rmdir /S /Q "${source}" && mklink /J "${source}" "${target}")`
    )
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await access(target)
      return true
    } catch {
      return false
    }
  }
}
