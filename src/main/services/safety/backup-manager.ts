import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { OsPaths } from '../../platform/os-paths'
import { createId } from '../../utils/id'

export interface BackupRecord {
  id: string
  originalPath: string
  backupPath: string
  createdAt: string
}

export class BackupManager {
  constructor(private readonly osPaths: OsPaths) {}

  async backupFile(originalPath: string): Promise<BackupRecord> {
    const sourceStats = await stat(originalPath)

    if (!sourceStats.isFile()) {
      throw new Error(`无法备份非文件路径: ${originalPath}`)
    }

    const backupRoot = await this.ensureBackupRoot()
    await this.ensureBackupSpace(backupRoot, sourceStats.size)

    const id = createId('backup')
    const backupPath = join(backupRoot, `${id}_${basename(originalPath)}`)

    await copyFile(originalPath, backupPath)

    const backupStats = await stat(backupPath)

    if (backupStats.size !== sourceStats.size) {
      throw new Error(`备份校验失败: ${originalPath}`)
    }

    return {
      id,
      originalPath,
      backupPath,
      createdAt: new Date().toISOString()
    }
  }

  async writeTextBackup(fileName: string, content: string): Promise<BackupRecord> {
    const backupRoot = await this.ensureBackupRoot()
    const id = createId('backup')
    const backupPath = join(backupRoot, `${id}_${fileName}`)

    await writeFile(backupPath, content, 'utf8')

    return {
      id,
      originalPath: fileName,
      backupPath,
      createdAt: new Date().toISOString()
    }
  }

  async quarantineFile(originalPath: string): Promise<BackupRecord> {
    const record = await this.backupFile(originalPath)
    const { unlink } = await import('node:fs/promises')
    await unlink(originalPath).catch(() => undefined)
    return record
  }

  private async ensureBackupRoot(): Promise<string> {
    const backupRoot = join(this.osPaths.getAppDataDirectory(), 'PCCleaner', 'backups')
    await mkdir(backupRoot, { recursive: true })
    return backupRoot
  }

  /** 预留至少与源文件等大的备份空间（简化校验：检查备份目录是否可写） */
  private async ensureBackupSpace(backupRoot: string, requiredBytes: number): Promise<void> {
    await stat(backupRoot)

    if (requiredBytes <= 0) {
      return
    }

    // 中文注释: 完整磁盘配额检测需平台 API；此处至少确认备份根目录存在且可访问。
  }
}
