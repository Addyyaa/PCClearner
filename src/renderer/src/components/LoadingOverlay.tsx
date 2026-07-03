import { Loader2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export function LoadingOverlay() {
  const loading = useAppStore((state) => state.loading)
  const loadingText = useAppStore((state) => state.loadingText)

  if (!loading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="rounded-3xl bg-white px-8 py-7 text-center shadow-card dark:bg-slate-900">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{loadingText || '正在处理,请稍候...'}</p>
      </div>
    </div>
  )
}
