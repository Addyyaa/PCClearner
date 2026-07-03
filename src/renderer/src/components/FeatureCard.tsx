import type { PropsWithChildren } from 'react'
import { motion } from 'framer-motion'

interface FeatureCardProps {
  title: string
  description: string
}

export function FeatureCard({ title, description, children }: PropsWithChildren<FeatureCardProps>) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-5">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      {children}
    </motion.section>
  )
}
