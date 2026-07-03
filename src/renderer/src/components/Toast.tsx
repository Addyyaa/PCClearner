import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function Toast() {
  const toast = useAppStore((state) => state.toast)
  const clearToast = useAppStore((state) => state.clearToast)

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(clearToast, 3000)
    return () => window.clearTimeout(timer)
  }, [clearToast, toast])

  if (!toast) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-card" role="alert">
      {toast}
    </div>
  )
}
