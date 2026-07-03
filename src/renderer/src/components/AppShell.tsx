import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  Bug,
  FileCheck,
  FolderInput,
  Gauge,
  HardDrive,
  Network,
  Power,
  Radar,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { clsx } from 'clsx'
import { LoadingOverlay } from './LoadingOverlay'
import { Toast } from './Toast'
import { zhCN } from '../i18n/zh-CN'

const navigation = [
  { to: '/', label: '总览', icon: Gauge },
  { to: '/disk-cleaner', label: '磁盘清理', icon: HardDrive },
  { to: '/disk-usage', label: '磁盘占用', icon: Activity },
  { to: '/duplicates', label: '重复文件', icon: Radar },
  { to: '/registry', label: '注册表', icon: ShieldCheck },
  { to: '/network', label: '网络修复', icon: Network },
  { to: '/startup', label: '开机启动', icon: Power },
  { to: '/ads', label: '广告检测', icon: Bug },
  { to: '/signature', label: '文件检测', icon: FileCheck },
  { to: '/residual', label: '卸载残留', icon: Trash2 },
  { to: '/migration', label: '软件迁移', icon: FolderInput }
]

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-light text-slate-900 dark:bg-surface-dark dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-20 w-72 border-r border-slate-200 bg-white/90 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="rounded-3xl bg-brand-600 p-5 text-white">
          <h1 className="text-2xl font-bold">{zhCN.appName}</h1>
          <p className="mt-2 text-sm leading-6 text-brand-50">{zhCN.subtitle}</p>
        </div>
        <nav className="mt-6 space-y-2" aria-label="主功能导航">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition',
                    isActive
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-600 dark:text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  )
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <main className="ml-72 min-h-screen p-8">
        <Outlet />
      </main>
      <LoadingOverlay />
      <Toast />
    </div>
  )
}
