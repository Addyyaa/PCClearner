import { access } from 'node:fs/promises'
import type { OperationResult, RegistryCleanRequest, RegistryIssue, RegistryScanResult } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { createId } from '../../utils/id'
import { resolveEnvironmentPath } from '../../utils/path-resolver'
import { BackupManager } from '../safety/backup-manager'
import { OperationHistory } from '../safety/operation-history'
import { extractExecutablePath, filterSafeRegistryIssues, isProtectedRegistryPath } from './registry-whitelist'

const RUN_KEY_PATHS = [
  { hive: 'HKCU' as const, keyPath: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  { hive: 'HKLM' as const, keyPath: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run' }
]

const UNINSTALL_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

export class RegistryCleanerService {
  private lastIssues: RegistryIssue[] = []

  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly backupManager: BackupManager,
    private readonly history: OperationHistory
  ) {}

  async scan(): Promise<RegistryScanResult> {
    if (!this.platform.isWindows()) {
      return {
        supported: false,
        issues: [],
        message: '注册表清理仅在 Windows 平台可用。'
      }
    }

    const issues = await this.scanWindowsRegistryIssues()
    this.lastIssues = filterSafeRegistryIssues(issues)

    return {
      supported: true,
      issues: this.lastIssues
    }
  }

  async clean(request: RegistryCleanRequest): Promise<OperationResult> {
    if (!this.platform.isWindows()) {
      return { success: false, message: '当前平台不支持注册表清理。' }
    }

    let backupPath: string | undefined

    if (request.exportBackup) {
      const backup = await this.exportRegistryBackup()
      backupPath = backup.backupPath
    }

    const issues = this.lastIssues.filter((issue) => request.issueIds.includes(issue.id))
    const failures: string[] = []
    let successCount = 0

    for (const issue of issues) {
      if (isProtectedRegistryPath(issue.keyPath, issue.valueName)) {
        failures.push(`${issue.keyPath}: 受保护项,已跳过`)
        continue
      }

      const args = issue.valueName
        ? ['delete', `${issue.hive}\\${issue.keyPath}`, '/v', issue.valueName, '/f']
        : ['delete', `${issue.hive}\\${issue.keyPath}`, '/f']

      try {
        await this.commandRunner.run('reg', args)
        successCount += 1
      } catch {
        failures.push(`${issue.hive}\\${issue.keyPath}`)
      }
    }

    const rollback = this.history.record('注册表清理', '已导出 .reg 备份,可通过导入备份还原。')

    return {
      success: failures.length === 0,
      message:
        failures.length === 0
          ? `已处理 ${successCount} 个注册表问题${backupPath ? '，备份已保存' : ''}`
          : `成功 ${successCount} 项,失败 ${failures.length} 项`,
      rollbackId: rollback.id
    }
  }

  private async scanWindowsRegistryIssues(): Promise<RegistryIssue[]> {
    const issues: RegistryIssue[] = []

    for (const runKey of RUN_KEY_PATHS) {
      issues.push(...(await this.scanInvalidStartupEntries(runKey.hive, runKey.keyPath)))
    }

    issues.push(...(await this.scanUninstallResidue()))
    issues.push(...(await this.scanMruEntries()))

    return issues
  }

  private async scanInvalidStartupEntries(hive: RegistryIssue['hive'], keyPath: string): Promise<RegistryIssue[]> {
    const result = await this.commandRunner
      .run('reg', ['query', `${hive}\\${keyPath}`])
      .catch(() => ({ stdout: '', stderr: '' }))

    const issues: RegistryIssue[] = []

    for (const line of result.stdout.split('\n')) {
      const match = line.trim().match(/^(\S+)\s+REG_\S+\s+(.+)$/)

      if (!match) continue

      const [, valueName, rawCommand] = match
      const executablePath = extractExecutablePath(rawCommand)

      if (!executablePath) continue

      const resolvedPath = resolveEnvironmentPath(executablePath)
      const exists = await this.pathExists(resolvedPath)

      if (!exists) {
        issues.push({
          id: createId('reg'),
          hive,
          keyPath,
          valueName,
          issueType: 'startup',
          riskLevel: 'recommended',
          selectedByDefault: true,
          description: `启动项「${valueName}」指向的程序不存在: ${resolvedPath}`
        })
      }
    }

    return issues
  }

  private async scanUninstallResidue(): Promise<RegistryIssue[]> {
    const result = await this.commandRunner
      .run('reg', ['query', UNINSTALL_KEY])
      .catch(() => ({ stdout: '', stderr: '' }))

    const subKeys = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('HKEY_') && line.includes('Uninstall\\'))

    const issues: RegistryIssue[] = []

    for (const subKeyLine of subKeys.slice(0, 50)) {
      const keyPath = subKeyLine.replace(/^HKEY_LOCAL_MACHINE\\/, '')
      const detail = await this.commandRunner.run('reg', ['query', `HKLM\\${keyPath}`]).catch(() => ({ stdout: '', stderr: '' }))
      const displayName = this.readRegistryValue(detail.stdout, 'DisplayName')
      const uninstallString = this.readRegistryValue(detail.stdout, 'UninstallString')
      const installLocation = this.readRegistryValue(detail.stdout, 'InstallLocation')

      if (!displayName) continue

      const targetPath = installLocation || extractExecutablePath(uninstallString ?? '')

      if (targetPath && !(await this.pathExists(resolveEnvironmentPath(targetPath)))) {
        issues.push({
          id: createId('reg'),
          hive: 'HKLM',
          keyPath,
          issueType: 'uninstallResidue',
          riskLevel: 'cautious',
          selectedByDefault: false,
          description: `卸载残留:「${displayName}」安装目录或卸载程序已不存在`
        })
      }
    }

    return issues
  }

  private async scanMruEntries(): Promise<RegistryIssue[]> {
    const mruKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'
    const result = await this.commandRunner.run('reg', ['query', mruKey]).catch(() => ({ stdout: '', stderr: '' }))

    const valueCount = result.stdout.split('\n').filter((line) => line.includes('REG_BINARY')).length

    if (valueCount <= 20) {
      return []
    }

    return [
      {
        id: createId('reg'),
        hive: 'HKCU',
        keyPath: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs',
        issueType: 'mru',
        riskLevel: 'safe',
        selectedByDefault: false,
        description: `最近文档 MRU 缓存较多(${valueCount} 项),清理后不影响系统运行,仅清除最近打开记录。`
      }
    ]
  }

  private readRegistryValue(output: string, valueName: string): string | undefined {
    const line = output.split('\n').find((entry) => entry.trim().startsWith(`${valueName} `))
    if (!line) return undefined

    const parts = line.trim().split(/\s{2,}/)
    return parts.slice(2).join(' ').trim() || undefined
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private async exportRegistryBackup(): Promise<{ backupPath: string }> {
    const tempDir = resolveEnvironmentPath('%TEMP%')
    const exportPath = `${tempDir}\\pccleaner-hkcu-${Date.now()}.reg`

    await this.commandRunner.run('reg', ['export', 'HKCU\\Software', exportPath, '/y']).catch(() => undefined)

    const record = await this.backupManager.writeTextBackup('registry-export-note.txt', `注册表备份路径: ${exportPath}`)
    return { backupPath: record.backupPath }
  }
}
