import type { DesktopAdResolveRequest, DesktopAdScanResult, DesktopAdSuspect, OperationResult } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { createId } from '../../utils/id'
import { BackupManager } from '../safety/backup-manager'
import { OperationHistory } from '../safety/operation-history'

const AD_KEYWORDS = ['广告', '弹窗', 'popup', 'promotion', 'promo', 'sponsor', 'banner', 'coupon', 'offer']
const PROTECTED_PROCESS_NAMES = new Set(['TextInputHost', 'SearchHost', 'StartMenuExperienceHost', 'ShellExperienceHost'])

interface SuspectMeta {
  pid?: number
  executablePath?: string
  processName: string
}

export class DesktopAdDetectorService {
  private lastSuspects = new Map<string, SuspectMeta>()

  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly history: OperationHistory,
    private readonly backupManager: BackupManager
  ) {}

  async scan(): Promise<DesktopAdScanResult> {
    this.lastSuspects.clear()
    const suspects = this.platform.isWindows() ? await this.scanWindowsPopups() : await this.scanMacPopups()

    return {
      suspects,
      limitations: [
        '桌面广告检测属于启发式判断,需要结合窗口行为、启动项、签名和用户确认。',
        '一键解决前必须展示进程路径和风险说明,避免误杀正常软件。'
      ]
    }
  }

  async resolve(request: DesktopAdResolveRequest): Promise<OperationResult> {
    const failures: string[] = []
    let handled = 0

    for (const suspectId of request.suspectIds) {
      const meta = this.lastSuspects.get(suspectId)

      if (!meta) {
        failures.push(suspectId)
        continue
      }

      try {
        if (request.terminateProcess && meta.pid) {
          await this.terminateProcess(meta.pid)
        }

        if (request.quarantine && meta.executablePath) {
          await this.backupManager.quarantineFile(meta.executablePath)
        }

        handled += 1
      } catch {
        failures.push(suspectId)
      }
    }

    const rollback = this.history.record('桌面广告处理', '已记录处理动作,后续可恢复被禁用的启动项或解除隔离。')

    return {
      success: failures.length === 0,
      message:
        failures.length === 0
          ? `已处理 ${handled} 个可疑广告来源`
          : `成功 ${handled} 项,失败 ${failures.length} 项`,
      rollbackId: rollback.id
    }
  }

  private async scanWindowsPopups(): Promise<DesktopAdSuspect[]> {
    const script =
      "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle, Path | ConvertTo-Json -Compress"
    const result = await this.commandRunner
      .run('powershell', ['-NoProfile', '-Command', script])
      .catch(() => ({ stdout: '', stderr: '' }))

    if (!result.stdout.trim()) {
      return []
    }

    try {
      const parsed = JSON.parse(result.stdout) as
        | Array<{ Id?: number; ProcessName?: string; MainWindowTitle?: string; Path?: string }>
        | { Id?: number; ProcessName?: string; MainWindowTitle?: string; Path?: string }

      const processes = Array.isArray(parsed) ? parsed : [parsed]

      return processes
        .filter((process) =>
          this.isSuspiciousProcess(process.ProcessName ?? '', process.MainWindowTitle ?? '', process.Path)
        )
        .map((process) => this.createSuspect(process.ProcessName ?? '未知进程', process.Id, process.Path, process.MainWindowTitle))
    } catch {
      return []
    }
  }

  private async scanMacPopups(): Promise<DesktopAdSuspect[]> {
    const result = await this.commandRunner.run('ps', ['-axo', 'pid,comm']).catch(() => ({ stdout: '', stderr: '' }))

    return result.stdout
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .filter((parts) => this.isSuspiciousProcess(parts[1], '', undefined))
      .slice(0, 10)
      .map((parts) => this.createSuspect(parts[1], Number(parts[0]), undefined, undefined))
  }

  private isSuspiciousProcess(processName: string, windowTitle: string, executablePath: string | undefined): boolean {
    if (this.isProtectedSystemProcess(processName, executablePath)) {
      return false
    }

    const haystack = `${processName} ${windowTitle}`.toLowerCase()
    return AD_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()))
  }

  private isProtectedSystemProcess(processName: string, executablePath: string | undefined): boolean {
    if (PROTECTED_PROCESS_NAMES.has(processName)) {
      return true
    }

    if (!executablePath) {
      return false
    }

    const normalizedPath = executablePath.toLowerCase()
    return (
      normalizedPath.startsWith('c:\\windows\\') ||
      normalizedPath.includes('\\systemapps\\') ||
      normalizedPath.includes('\\microsoftwindows.')
    )
  }

  private createSuspect(
    processName: string,
    pid?: number,
    executablePath?: string,
    windowTitle?: string
  ): DesktopAdSuspect {
    const id = createId('ad')
    const signals = [
      windowTitle ? `窗口标题: ${windowTitle}` : '存在可见窗口进程',
      executablePath ? `路径: ${executablePath}` : '未能读取完整路径',
      '匹配广告/弹窗启发式关键词'
    ]

    this.lastSuspects.set(id, { pid, executablePath, processName })

    return {
      id,
      processName,
      pid,
      executablePath,
      windowTitle,
      signals,
      confidence: windowTitle && AD_KEYWORDS.some((keyword) => windowTitle.includes(keyword)) ? 'high' : 'medium',
      riskLevel: 'cautious',
      suggestedAction: '先结束进程并禁用自启动,确认无业务影响后再隔离文件。'
    }
  }

  private async terminateProcess(pid: number): Promise<void> {
    if (this.platform.isWindows()) {
      await this.commandRunner.run('taskkill', ['/PID', String(pid), '/F'])
      return
    }

    await this.commandRunner.run('kill', ['-9', String(pid)])
  }
}
