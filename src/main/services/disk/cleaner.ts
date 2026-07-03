import type { CleanRequest, CleanableItem, OperationResult } from '../../../../shared/types'
import { BackupManager } from '../safety/backup-manager'
import { OperationHistory } from '../safety/operation-history'
import { TrashService } from '../safety/trash-service'

export class DiskCleaner {
  constructor(
    private readonly trashService: TrashService,
    private readonly backupManager: BackupManager,
    private readonly history: OperationHistory
  ) {}

  async clean(request: CleanRequest, items: CleanableItem[]): Promise<OperationResult> {
    const selectedItems = items.filter((item) => request.itemIds.includes(item.id))

    if (request.createBackup) {
      // 中文注释: 仅对不可回收或高风险项目做备份,此处保留调用入口供后续细化。
      await Promise.all(
        selectedItems
          .filter((item) => item.riskLevel === 'cautious' || item.riskLevel === 'dangerous')
          .map((item) => this.backupManager.backupFile(item.path).catch(() => undefined))
      )
    }

    const result = await this.trashService.moveToTrash(selectedItems.map((item) => item.path))
    const rollback = this.history.record('磁盘清理', '文件已移动到系统回收站,可在回收站中恢复。')

    return {
      ...result,
      rollbackId: rollback.id
    }
  }
}
