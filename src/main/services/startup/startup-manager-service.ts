import { access, readdir, rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { OperationResult, StartupChangeRequest, StartupItem } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { OsPaths } from '../../platform/os-paths'
import { PlatformService } from '../../platform/platform-service'
import { createId } from '../../utils/id'
import { resolveEnvironmentPath } from '../../utils/path-resolver'
import { extractExecutablePath } from '../registry/registry-whitelist'
import { OperationHistory } from '../safety/operation-history'

interface StartupItemMeta {
  hive?: 'HKCU' | 'HKLM'
  keyPath?: string
  valueName?: string
  command?: string
  plistPath?: string
  disabledPlistPath?: string
  startupFolderPath?: string
  scheduledTaskName?: string
  serviceName?: string
}

export class StartupManagerService {
  private readonly itemMeta = new Map<string, StartupItemMeta>()

  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly osPaths: OsPaths,
    private readonly history: OperationHistory
  ) {}

  async listStartupItems(): Promise<StartupItem[]> {
    this.itemMeta.clear()

    if (this.platform.isWindows()) {
      return this.listWindowsStartupItems()
    }

    if (this.platform.isMacOS()) {
      return this.listMacStartupItems()
    }

    return []
  }

  async setEnabled(request: StartupChangeRequest): Promise<OperationResult> {
    const snapshots: Array<{ id: string; enabled: boolean; meta: StartupItemMeta }> = []
    const failures: string[] = []

    for (const itemId of request.itemIds) {
      const meta = this.itemMeta.get(itemId)

      if (!meta) {
        failures.push(itemId)
        continue
      }

      snapshots.push({ id: itemId, enabled: !request.enabled, meta: { ...meta } })

      try {
        if (this.platform.isWindows()) {
          await this.applyWindowsStartupChange(meta, request.enabled)
        } else if (this.platform.isMacOS()) {
          await this.applyMacStartupChange(meta, request.enabled)
        }
      } catch {
        failures.push(itemId)
      }
    }

    const rollback = request.createRollback
      ? this.history.record('启动项变更', '已保存原始启动状态,可恢复。', async () => {
          for (const snapshot of snapshots) {
            if (this.platform.isWindows()) {
              await this.applyWindowsStartupChange(snapshot.meta, snapshot.enabled).catch(() => undefined)
            } else if (this.platform.isMacOS()) {
              await this.applyMacStartupChange(snapshot.meta, snapshot.enabled).catch(() => undefined)
            }
          }

          return { success: true, message: '启动项状态已恢复' }
        })
      : undefined

    return {
      success: failures.length === 0,
      message:
        failures.length === 0
          ? `已${request.enabled ? '启用' : '关闭'} ${request.itemIds.length} 个启动项`
          : `部分启动项操作失败(${failures.length} 项)`,
      rollbackId: rollback?.id
    }
  }

  private async listWindowsStartupItems(): Promise<StartupItem[]> {
    const items: StartupItem[] = []

    items.push(...(await this.readRegistryRunItems('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Run')))
    items.push(...(await this.readRegistryRunItems('HKLM', 'Software\\Microsoft\\Windows\\CurrentVersion\\Run')))
    items.push(...(await this.readRegistryRunItems('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce')))
    items.push(...(await this.readRegistryRunItems('HKLM', 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce')))
    items.push(...(await this.readRegistryRunItems('HKLM', 'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run')))
    items.push(...(await this.readStartupFolderItems()))
    items.push(...(await this.readScheduledTasks()))
    items.push(...(await this.readAutoServices()))

    return items
  }

  private async readRegistryRunItems(hive: 'HKCU' | 'HKLM', keyPath: string): Promise<StartupItem[]> {
    const result = await this.commandRunner.run('reg', ['query', `${hive}\\${keyPath}`]).catch(() => ({ stdout: '', stderr: '' }))
    const items: StartupItem[] = []

    for (const line of result.stdout.split('\n')) {
      const match = line.trim().match(/^(\S+)\s+REG_\S+\s+(.+)$/)

      if (!match) continue

      const [, valueName, command] = match
      const id = createId('startup')

      this.itemMeta.set(id, { hive, keyPath, valueName, command: command.trim() })

      items.push({
        id,
        name: valueName,
        command: command.trim(),
        source: 'registryRun',
        enabled: true,
        path: resolveEnvironmentPath(extractExecutablePath(command) ?? ''),
        riskLevel: hive === 'HKLM' ? 'cautious' : 'recommended',
        description: `${hive} 启动项,关闭前请确认不是安全软件、输入法或驱动相关程序。`
      })
    }

    return items
  }

  private async readStartupFolderItems(): Promise<StartupItem[]> {
    const startupFolder = join(
      this.osPaths.getAppDataDirectory(),
      '..',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup'
    )
    const resolvedFolder = resolveEnvironmentPath(startupFolder)

    try {
      const entries = await readdir(resolvedFolder)
      const items: StartupItem[] = []

      for (const entry of entries) {
        const entryPath = join(resolvedFolder, entry)
        const id = createId('startup')

        this.itemMeta.set(id, { startupFolderPath: entryPath })

        items.push({
          id,
          name: basename(entry),
          command: entryPath,
          source: 'startupFolder',
          enabled: true,
          path: entryPath,
          riskLevel: 'recommended',
          description: '启动文件夹快捷方式,禁用后不会随系统自动运行。'
        })
      }

      return items
    } catch {
      return []
    }
  }

  private async readScheduledTasks(): Promise<StartupItem[]> {
    const script =
      "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' } | Select-Object TaskName, TaskPath, State | ConvertTo-Json -Compress"
    const result = await this.commandRunner
      .run('powershell', ['-NoProfile', '-Command', script])
      .catch(() => ({ stdout: '', stderr: '' }))

    if (!result.stdout.trim()) {
      return []
    }

    try {
      const parsed = JSON.parse(result.stdout) as
        | Array<{ TaskName?: string; TaskPath?: string; State?: string }>
        | { TaskName?: string; TaskPath?: string; State?: string }
      const tasks = Array.isArray(parsed) ? parsed : [parsed]

      return tasks
        .filter((task) => task.TaskName)
        .slice(0, 100)
        .map((task) => {
          const taskName = `${task.TaskPath ?? '\\'}${task.TaskName}`
          const id = createId('startup')
          this.itemMeta.set(id, { scheduledTaskName: taskName })

          return {
            id,
            name: task.TaskName ?? taskName,
            command: taskName,
            source: 'scheduledTask' as const,
            enabled: task.State !== 'Disabled',
            riskLevel: 'cautious' as const,
            description: 'Windows 计划任务启动项,常见于远程控制、更新器、AI 客户端和后台同步程序。'
          }
        })
    } catch {
      return []
    }
  }

  private async readAutoServices(): Promise<StartupItem[]> {
    const script =
      "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' } | Select-Object Name, DisplayName, PathName, State | ConvertTo-Json -Compress"
    const result = await this.commandRunner
      .run('powershell', ['-NoProfile', '-Command', script])
      .catch(() => ({ stdout: '', stderr: '' }))

    if (!result.stdout.trim()) {
      return []
    }

    try {
      const parsed = JSON.parse(result.stdout) as
        | Array<{ Name?: string; DisplayName?: string; PathName?: string; State?: string }>
        | { Name?: string; DisplayName?: string; PathName?: string; State?: string }
      const services = Array.isArray(parsed) ? parsed : [parsed]

      return services
        .filter((service) => service.Name)
        .slice(0, 120)
        .map((service) => {
          const id = createId('startup')
          this.itemMeta.set(id, { serviceName: service.Name })

          return {
            id,
            name: service.DisplayName ?? service.Name ?? '未知服务',
            command: service.PathName ?? service.Name ?? '',
            source: 'service' as const,
            enabled: true,
            path: resolveEnvironmentPath(extractExecutablePath(service.PathName ?? '') ?? ''),
            riskLevel: 'cautious' as const,
            description: 'Windows 自动启动服务,可能包含向日葵、更新器、后台同步或驱动服务。'
          }
        })
    } catch {
      return []
    }
  }

  private async listMacStartupItems(): Promise<StartupItem[]> {
    const launchAgentsDir = join(this.osPaths.getHomeDirectory(), 'Library', 'LaunchAgents')

    try {
      const entries = await readdir(launchAgentsDir)
      const items: StartupItem[] = []

      for (const entry of entries.filter((name) => name.endsWith('.plist'))) {
        const plistPath = join(launchAgentsDir, entry)
        const disabledPath = `${plistPath}.disabled`
        const isDisabled = await this.pathExists(disabledPath)
        const id = createId('startup')

        this.itemMeta.set(id, {
          plistPath: isDisabled ? disabledPath : plistPath,
          disabledPlistPath: disabledPath
        })

        items.push({
          id,
          name: entry.replace('.plist', ''),
          command: plistPath,
          source: 'launchAgent',
          enabled: !isDisabled,
          path: plistPath,
          riskLevel: 'recommended',
          description: '用户级 LaunchAgent,关闭后对应程序不会自动启动。'
        })
      }

      return items
    } catch {
      return []
    }
  }

  private async applyWindowsStartupChange(meta: StartupItemMeta, enabled: boolean): Promise<void> {
    if (meta.startupFolderPath) {
      const disabledPath = `${meta.startupFolderPath}.disabled`

      if (enabled) {
        if (await this.pathExists(disabledPath)) {
          await rename(disabledPath, meta.startupFolderPath)
        }
      } else if (await this.pathExists(meta.startupFolderPath)) {
        await rename(meta.startupFolderPath, disabledPath)
      }

      return
    }

    if (!meta.hive || !meta.keyPath || !meta.valueName) {
      if (meta.scheduledTaskName) {
        await this.commandRunner.run('schtasks', ['/Change', '/TN', meta.scheduledTaskName, enabled ? '/Enable' : '/Disable'])
        return
      }

      if (meta.serviceName) {
        await this.commandRunner.run('sc', ['config', meta.serviceName, 'start=', enabled ? 'auto' : 'disabled'])
        return
      }

      throw new Error('缺少注册表启动项元数据')
    }

    if (!enabled) {
      await this.commandRunner.run('reg', ['delete', `${meta.hive}\\${meta.keyPath}`, '/v', meta.valueName, '/f'])
      return
    }

    if (meta.command) {
      await this.commandRunner.run('reg', ['add', `${meta.hive}\\${meta.keyPath}`, '/v', meta.valueName, '/t', 'REG_SZ', '/d', meta.command, '/f'])
    }
  }

  private async applyMacStartupChange(meta: StartupItemMeta, enabled: boolean): Promise<void> {
    if (!meta.plistPath || !meta.disabledPlistPath) {
      throw new Error('缺少 LaunchAgent 元数据')
    }

    if (enabled) {
      if (await this.pathExists(meta.disabledPlistPath)) {
        await rename(meta.disabledPlistPath, meta.plistPath)
      }
    } else if (await this.pathExists(meta.plistPath)) {
      await rename(meta.plistPath, meta.disabledPlistPath)
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }
}
