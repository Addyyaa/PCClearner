import { useState } from 'react'
import type { DiskUsageNode, DiskUsageReport } from '../../../../shared/types'
import { FeatureCard } from '../components/FeatureCard'
import { ProgressBar } from '../components/ProgressBar'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function UsageTreeNode({ node, depth = 0 }: { node: DiskUsageNode; depth?: number }) {
  return (
    <div className="ml-4" style={{ marginLeft: depth * 12 }}>
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="truncate">{node.name}</span>
        <span className="ml-2 shrink-0 text-slate-500">{formatBytes(node.sizeBytes)}</span>
      </div>
      {node.children?.slice(0, 8).map((child) => (
        <UsageTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function DiskUsagePage() {
  const { api, withLoading } = useAppApi()
  const [report, setReport] = useState<DiskUsageReport>()

  async function loadReport() {
    const rootPath = await api.app.getPlatform().then((platform) => (platform === 'windows' ? 'C:\\' : '/'))
    const nextReport = await withLoading('正在分析磁盘占用...', () => api.diskUsage.report(rootPath))
    setReport(nextReport)
  }

  return (
    <FeatureCard title="磁盘占用" description="展示各磁盘容量、目录树占用和选择删除后的可释放空间预估。">
      <Touchable onClick={loadReport}>分析磁盘</Touchable>
      <div className="mt-6 space-y-4">
        {report?.volumes.map((volume) => (
          <div key={volume.id}>
            <ProgressBar
              label={`${volume.name} 使用率`}
              value={volume.totalBytes ? Math.round((volume.usedBytes / volume.totalBytes) * 100) : 0}
            />
            <p className="mt-1 text-xs text-slate-500">
              已用 {formatBytes(volume.usedBytes)} / 总计 {formatBytes(volume.totalBytes)} · 可用 {formatBytes(volume.freeBytes)}
            </p>
          </div>
        ))}
      </div>
      {report?.tree[0] ? (
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
          <strong className="text-sm">目录占用 Top</strong>
          <UsageTreeNode node={report.tree[0]} />
        </div>
      ) : null}
    </FeatureCard>
  )
}
