import type { PropsWithChildren } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { clsx } from 'clsx'

type TouchableVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface TouchableProps extends HTMLMotionProps<'button'> {
  variant?: TouchableVariant
}

const variantClassName: Record<TouchableVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700'
}

export function Touchable({ children, className, variant = 'primary', ...props }: PropsWithChildren<TouchableProps>) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -1 }}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variantClassName[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  )
}
