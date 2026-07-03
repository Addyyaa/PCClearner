import { ShieldCheck } from 'lucide-react'
import { FeatureCard } from '../components/FeatureCard'
import { StatusBadge } from '../components/StatusBadge'
import { zhCN } from '../i18n/zh-CN'

const features = ['磁盘清理', '注册表清理', '重复文件', '网络诊断', '磁盘占用', '开机启动', '广告检测']

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-gradient-to-br from-brand-600 to-slate-900 p-8 text-white shadow-card">
        <div className="flex items-start justify-between gap-6">
          <div>
            <StatusBadge tone="success">安全模式已启用</StatusBadge>
            <h1 className="mt-5 text-4xl font-bold">系统清理与网络修复中心</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-brand-50">{zhCN.safetyNotice}</p>
          </div>
          <ShieldCheck className="h-16 w-16 text-brand-100" aria-hidden="true" />
        </div>
      </section>
      <FeatureCard title="功能模块" description="各模块已接入真实扫描、诊断与清理逻辑,危险操作均支持预览、备份与二次确认。">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {features.map((feature) => (
            <div key={feature} className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {feature}
            </div>
          ))}
        </div>
      </FeatureCard>
    </div>
  )
}
