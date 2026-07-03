import { clsx } from 'clsx'
import { Touchable } from './Touchable'

interface SelectionActionsProps {
  /** 当前列表中可勾选项数量，为 0 时禁用按钮。 */
  itemCount: number
  onSelectAll: () => void
  onClearAll: () => void
  className?: string
}

/** 列表页通用的全选 / 取消全选操作栏。 */
export function SelectionActions({ itemCount, onSelectAll, onClearAll, className }: SelectionActionsProps) {
  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      <Touchable
        variant="ghost"
        className="min-h-9 px-3 py-1 text-xs"
        disabled={itemCount === 0}
        onClick={onSelectAll}
      >
        全选
      </Touchable>
      <Touchable
        variant="ghost"
        className="min-h-9 px-3 py-1 text-xs"
        disabled={itemCount === 0}
        onClick={onClearAll}
      >
        取消全选
      </Touchable>
    </div>
  )
}
