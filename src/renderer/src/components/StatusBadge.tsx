import { clsx } from 'clsx'

interface StatusBadgeProps {
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  children: string
}

const toneClassName: Record<StatusBadgeProps['tone'], string> = {
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <span className={clsx('rounded-full px-3 py-1 text-xs font-bold', toneClassName[tone])}>{children}</span>
}
