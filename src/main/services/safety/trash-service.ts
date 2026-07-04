import { access, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { shell } from 'electron'
import type { OperationResult } from '../../../../shared/types'
import { PlatformService } from '../../platform/platform-service'
import { PrivilegeService } from '../../platform/privilege-service'

export class TrashService {
  constructor(
    private readonly platform: PlatformService,
    private readonly privilege: PrivilegeService
  ) {}

  async moveToTrash(paths: string[]): Promise<OperationResult> {
    if (paths.length === 0) {
      return { success: true, message: '没有需要移动到回收站的项目' }
    }

    const existingPaths = await this.filterExisting(paths)

    if (existingPaths.length === 0) {
      return { success: true, message: '目标项目已不存在,无需清理' }
    }

    const needsElevation: string[] = []

    for (const target of existingPaths) {
      const moved = await this.trashItem(target)
      if (!moved || (await this.pathExists(target))) {
        needsElevation.push(target)
      }
      await delay(0)
    }

    let remaining = needsElevation

    // 中文注释: 需要管理员权限的项目合并为一次提权批量处理,避免每个文件弹一次授权框。
    if (needsElevation.length > 0 && this.platform.isWindows()) {
      remaining = await this.trashElevatedBatchWindows(needsElevation)
    } else if (needsElevation.length > 0 && this.platform.isMacOS()) {
      remaining = await this.trashElevatedBatchMac(needsElevation)
    }

    const movedCount = existingPaths.length - remaining.length
    const isMacElevatedDelete = this.platform.isMacOS() && needsElevation.length > 0

    if (remaining.length === 0) {
      return {
        success: true,
        message: isMacElevatedDelete
          ? `已清理 ${movedCount} 个需管理员授权的项目(系统临时文件为永久删除)`
          : `已移动 ${movedCount} 个项目到回收站`
      }
    }

    const failedNames = remaining.map((path) => basename(path)).join('、')

    if (movedCount > 0) {
      return {
        success: true,
        message: isMacElevatedDelete
          ? `已清理 ${movedCount} 个项目,${remaining.length} 个未能删除(${failedNames})。请关闭占用程序后重试。`
          : `已移动 ${movedCount} 个项目到回收站,${remaining.length} 个项目未能清理(${failedNames})。请关闭占用程序后重试。`
      }
    }

    return {
      success: false,
      message: `${remaining.length} 个项目移动失败(${failedNames})。可能被程序占用,或您取消了管理员授权。`
    }
  }

  private async trashItem(target: string): Promise<boolean> {
    try {
      await shell.trashItem(target)
      return true
    } catch {
      return false
    }
  }

  /**
   * 单次 UAC 提权,批量将路径移入回收站(无逐文件弹窗)。
   * 使用临时 JSON 列表 + PowerShell 脚本,避免命令行转义问题。
   */
  private async trashElevatedBatchWindows(paths: string[]): Promise<string[]> {
    const stamp = Date.now()
    const listFile = join(tmpdir(), `pccleaner-trash-${stamp}.json`)
    const scriptFile = join(tmpdir(), `pccleaner-trash-${stamp}.ps1`)
    const psListFile = listFile.replace(/'/g, "''")

    const scriptContent = [
      'Add-Type -AssemblyName Microsoft.VisualBasic',
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
      `$paths = Get-Content -LiteralPath '${psListFile}' -Raw | ConvertFrom-Json`,
      'foreach ($p in $paths) {',
      '  try {',
      '    if (-not (Test-Path -LiteralPath $p)) { continue }',
      '    if ((Get-Item -LiteralPath $p -Force).PSIsContainer) {',
      '      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, [Microsoft.VisualBasic.FileIO.DeleteDirectoryOption]::SendToRecycleBin)',
      '    } else {',
      '      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)',
      '    }',
      '  } catch { }',
      '}'
    ].join('\n')

    await writeFile(listFile, JSON.stringify(paths), 'utf8')
    await writeFile(scriptFile, scriptContent, 'utf8')

    try {
      await this.privilege.runElevated({
        name: 'PCCleaner',
        command: `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`
      })
    } catch {
      // 用户取消 UAC 或脚本异常,下面仍根据磁盘实际状态统计结果
    } finally {
      await unlink(listFile).catch(() => undefined)
      await unlink(scriptFile).catch(() => undefined)
    }

    return this.collectRemaining(paths)
  }

  /**
   * macOS 提权批量清理: 用户目录下尝试移入废纸篓,系统目录永久删除。
   * 使用 JSON 列表 + shell 脚本,避免命令行转义问题。
   */
  private async trashElevatedBatchMac(paths: string[]): Promise<string[]> {
    const stamp = Date.now()
    const listFile = join(tmpdir(), `pccleaner-trash-mac-${stamp}.json`)
    const scriptFile = join(tmpdir(), `pccleaner-trash-mac-${stamp}.sh`)
    const home = homedir()
    const trashDir = join(home, '.Trash')

    const scriptContent = `#!/bin/bash
LIST_FILE="${listFile.replace(/"/g, '\\"')}"
TRASH_DIR="${trashDir.replace(/"/g, '\\"')}"
HOME_DIR="${home.replace(/"/g, '\\"')}"

while IFS= read -r p; do
  [ -z "$p" ] && continue
  [ ! -e "$p" ] && continue
  if [[ "$p" == "$HOME_DIR"* ]]; then
    base=$(basename "$p")
    dest="$TRASH_DIR/\${base}_pccleaner_\$(date +%s)"
    mv "$p" "$dest" 2>/dev/null || rm -rf "$p" 2>/dev/null
  else
    rm -rf "$p" 2>/dev/null
  fi
done < <(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(p=>console.log(p))" "$LIST_FILE")
`

    await writeFile(listFile, JSON.stringify(paths), 'utf8')
    await writeFile(scriptFile, scriptContent, 'utf8')

    try {
      await this.privilege.runElevated({
        name: 'PCCleaner',
        command: `chmod +x "${scriptFile}" && "${scriptFile}"`
      })
    } catch {
      // 用户取消授权或脚本异常,下面仍根据磁盘实际状态统计结果
    } finally {
      await unlink(listFile).catch(() => undefined)
      await unlink(scriptFile).catch(() => undefined)
    }

    return this.collectRemaining(paths)
  }

  private async collectRemaining(paths: string[]): Promise<string[]> {
    const remaining: string[] = []
    for (const target of paths) {
      if (await this.pathExists(target)) {
        remaining.push(target)
      }
      await delay(0)
    }
    return remaining
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await access(target)
      return true
    } catch {
      return false
    }
  }

  private async filterExisting(paths: string[]): Promise<string[]> {
    const checks = await Promise.all(
      paths.map(async (target) => {
        try {
          await access(target)
          return target
        } catch {
          return undefined
        }
      })
    )

    return checks.filter((value): value is string => Boolean(value))
  }
}
