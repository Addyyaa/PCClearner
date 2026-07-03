import type { OperationResult } from '../../../../shared/types'
import { createId } from '../../utils/id'

export interface RollbackEntry {
  id: string
  title: string
  createdAt: string
  rollbackNote: string
}

export type RollbackHandler = () => Promise<OperationResult>

export class OperationHistory {
  private readonly entries = new Map<string, RollbackEntry>()
  private readonly handlers = new Map<string, RollbackHandler>()

  record(title: string, rollbackNote: string, handler?: RollbackHandler): RollbackEntry {
    const entry: RollbackEntry = {
      id: createId('rollback'),
      title,
      createdAt: new Date().toISOString(),
      rollbackNote
    }

    this.entries.set(entry.id, entry)

    if (handler) {
      this.handlers.set(entry.id, handler)
    }

    return entry
  }

  list(): RollbackEntry[] {
    return Array.from(this.entries.values()).sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
  }

  async rollback(id: string): Promise<OperationResult> {
    const entry = this.entries.get(id)

    if (!entry) {
      return { success: false, message: '未找到可还原的操作记录' }
    }

    const handler = this.handlers.get(id)

    if (handler) {
      return handler()
    }

    return {
      success: true,
      message: `${entry.title}：${entry.rollbackNote}`,
      rollbackId: id
    }
  }
}
