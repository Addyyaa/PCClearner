import { Touchable } from './Touchable'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** 危险操作二次确认弹窗 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认执行',
  cancelLabel = '取消',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-card dark:bg-slate-900">
        <h2 id="confirm-title" className="text-lg font-bold text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Touchable variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Touchable>
          <Touchable variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Touchable>
        </div>
      </div>
    </div>
  )
}
