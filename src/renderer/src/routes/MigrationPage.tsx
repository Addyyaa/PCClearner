import { useEffect, useMemo, useState } from 'react'
import type { DiskVolumeUsage, InstalledProgram, InstalledProgramListResult } from '../../../../shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FeatureCard } from '../components/FeatureCard'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

function formatBytes(bytes?: number): string {
  if (!bytes) return '未知大小'
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function MigrationPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [result, setResult] = useState<InstalledProgramListResult>()
  const [volumes, setVolumes] = useState<DiskVolumeUsage[]>([])
  const [targetDrive, setTargetDrive] = useState('')
  const [pending, setPending] = useState<InstalledProgram>()

  const targetVolumes = useMemo(() => volumes.filter((volume) => !volume.isSystemVolume), [volumes])

  useEffect(() => {
    void api.disk.listVolumes().then((nextVolumes: DiskVolumeUsage[]) => {
      setVolumes(nextVolumes)
      const firstTarget = nextVolumes.find((volume) => !volume.isSystemVolume)
      if (firstTarget) {
        setTargetDrive(firstTarget.mountPoint.replace(/\\+$/, ''))
      }
    })
  }, [api])

  async function loadPrograms() {
    const nextResult = await withLoading('正在读取已安装程序清单...', () => api.migration.list())
    if (nextResult) {
      setResult(nextResult)
    }
  }

  async function migrate() {
    const program = pending
    setPending(undefined)
    if (!program?.installLocation || !targetDrive) return

    const operation = await withLoading(`正在迁移「${program.name}」,请勿关闭应用...`, () =>
      api.migration.migrate({ name: program.name, sourcePath: program.installLocation!, targetDrive })
    )

    if (operation) {
      showToast(operation.message)
      if (operation.success) {
        await loadPrograms()
      }
    }
  }

  return (
    <FeatureCard
      title="C 盘软件迁移"
      description="将系统盘上的第三方软件目录搬到其他磁盘,并在原位置建立目录联接(Junction),让快捷方式和注册表仍可正常调用,从而释放系统盘空间。"
    >
      <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        迁移前请务必<strong>完全关闭要迁移的软件</strong>;迁移过程需要管理员授权,会弹出 UAC 提示。系统组件、
        Microsoft Office/Visual Studio 等关键目录已被禁止迁移。UWP/应用商店应用不适用本功能。
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-[220px] flex-col gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          迁移目标磁盘
          <select
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={targetDrive}
            onChange={(event) => setTargetDrive(event.target.value)}
          >
            {targetVolumes.length === 0 ? <option value="">无可用的非系统磁盘</option> : null}
            {targetVolumes.map((volume) => (
              <option key={volume.id} value={volume.mountPoint.replace(/\\+$/, '')}>
                {volume.name} ({formatBytes(volume.freeBytes)} 可用)
              </option>
            ))}
          </select>
        </label>
        <Touchable onClick={loadPrograms}>扫描可迁移软件</Touchable>
      </div>

      {result && !result.supported ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">{result.message}</p>
      ) : null}

      {result && result.supported ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          共发现 {result.programs.length} 个安装在系统盘的软件。
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {result?.programs.map((program) => (
          <div key={program.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="truncate">{program.name}</strong>
              {program.publisher ? <StatusBadge tone="neutral">{program.publisher}</StatusBadge> : null}
              <StatusBadge tone={program.canMigrate ? 'success' : 'warning'}>
                {program.canMigrate ? '可迁移' : '不可迁移'}
              </StatusBadge>
              <span className="text-xs text-slate-500">{formatBytes(program.estimatedSizeBytes)}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{program.installLocation}</p>
            {program.migrateBlockReason ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{program.migrateBlockReason}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Touchable
                variant="secondary"
                className="min-h-9 px-3 py-1 text-xs"
                onClick={() => program.installLocation && api.app.showItemInFolder(program.installLocation)}
              >
                打开所在位置
              </Touchable>
              <Touchable
                variant="primary"
                className="min-h-9 px-3 py-1 text-xs"
                disabled={!program.canMigrate || !targetDrive}
                onClick={() => setPending(program)}
              >
                迁移到 {targetDrive || '目标磁盘'}
              </Touchable>
            </div>
          </div>
        ))}
        {!result ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">点击「扫描可迁移软件」列出安装在系统盘的第三方软件。</p>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title="确认迁移软件"
        description={
          pending
            ? `将把「${pending.name}」从 ${pending.installLocation} 迁移到 ${targetDrive},并在原位置建立目录联接。请确认该软件已完全关闭,迁移过程中会请求管理员权限。`
            : ''
        }
        onConfirm={migrate}
        onCancel={() => setPending(undefined)}
      />
    </FeatureCard>
  )
}
