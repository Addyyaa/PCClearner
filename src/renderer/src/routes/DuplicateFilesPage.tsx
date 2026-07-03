import { useEffect, useState } from 'react'
import type { DiskVolumeUsage, DuplicateFileGroup } from '../../../../shared/types'
import { FeatureCard } from '../components/FeatureCard'
import { ProgressBar } from '../components/ProgressBar'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DuplicateFilesPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [volumes, setVolumes] = useState<DiskVolumeUsage[]>([])
  const [selectedVolume, setSelectedVolume] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [groups, setGroups] = useState<DuplicateFileGroup[]>([])

  useEffect(() => {
    void api.disk.listVolumes().then((nextVolumes: DiskVolumeUsage[]) => {
      setVolumes(nextVolumes)
      const systemVolume = nextVolumes.find((volume) => volume.isSystemVolume) ?? nextVolumes[0]
      if (systemVolume) {
        setSelectedVolume(systemVolume.mountPoint)
      }
    })
  }, [api])

  async function scan() {
    if (!selectedVolume) {
      showToast('请先选择要扫描的磁盘。')
      return
    }

    setScanning(true)
    setScanProgress(8)

    const timer = window.setInterval(() => {
      setScanProgress((current) => Math.min(current + 7, 92))
    }, 700)

    const nextGroups = await withLoading('正在按大小和哈希检测重复文件...', () =>
      api.duplicates.scan({ roots: [selectedVolume], minSizeBytes: 1024 * 1024, ignoreHiddenFiles: true })
    )

    window.clearInterval(timer)
    setScanProgress(100)
    setGroups(nextGroups ?? [])
    window.setTimeout(() => {
      setScanning(false)
      setScanProgress(0)
    }, 500)
  }

  return (
    <FeatureCard title="重复文件" description="先按文件大小分组,再使用哈希确认重复,并给出保留一份的建议。">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-[220px] flex-col gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          选择磁盘
          <select
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={selectedVolume}
            onChange={(event) => {
              setSelectedVolume(event.target.value)
              setGroups([])
            }}
          >
            {volumes.length === 0 ? <option value="">正在加载磁盘列表...</option> : null}
            {volumes.map((volume) => (
              <option key={volume.id} value={volume.mountPoint}>
                {volume.name} ({formatBytes(volume.freeBytes)} 可用)
              </option>
            ))}
          </select>
        </label>
        <Touchable onClick={scan} disabled={!selectedVolume || scanning}>
          {scanning ? '扫描中...' : '扫描重复文件'}
        </Touchable>
      </div>
      {scanning ? (
        <div className="mt-5">
          <ProgressBar label="重复文件扫描进度" value={scanProgress} />
        </div>
      ) : null}
      <p className="mt-6 text-sm font-bold text-slate-700 dark:text-slate-200">发现 {groups.length} 组重复文件。</p>

      <div className="mt-4 space-y-4">
        {groups.slice(0, 20).map((group) => (
          <div key={group.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <strong>
              {formatBytes(group.sizeBytes)} × {group.files.length} 份
            </strong>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{group.reason}</p>
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">建议保留: {group.recommendedKeepPath}</p>
            <ul className="mt-2 list-disc pl-5 text-xs leading-6 text-slate-500">
              {group.files.map((file) => (
                <li key={file.id} className="truncate">
                  {file.path}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </FeatureCard>
  )
}
