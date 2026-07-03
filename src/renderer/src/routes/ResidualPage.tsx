import { useMemo, useState } from 'react'
import type { ResidualItem, ResidualScanResult } from '../../../../shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FeatureCard } from '../components/FeatureCard'
import { SelectionActions } from '../components/SelectionActions'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

const SOURCE_LABEL: Record<ResidualItem['source'], string> = {
  roamingAppData: 'AppData\\Roaming',
  localAppData: 'AppData\\Local',
  programData: 'ProgramData',
  programFiles: 'Program Files',
  programFilesX86: 'Program Files (x86)'
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function ResidualPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [result, setResult] = useState<ResidualScanResult>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const selectedBytes = useMemo(() => {
    if (!result) return 0
    return result.items.filter((item) => selectedIds.includes(item.id)).reduce((sum, item) => sum + item.sizeBytes, 0)
  }, [result, selectedIds])

  async function scan() {
    const nextResult = await withLoading('正在比对已安装程序清单,查找卸载残留...', () => api.residual.scan())

    if (nextResult) {
      setResult(nextResult)
      setSelectedIds([])
    }
  }

  function toggleItem(item: ResidualItem) {
    setSelectedIds((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
    )
  }

  async function quarantine() {
    setConfirmOpen(false)
    const paths = (result?.items ?? []).filter((item) => selectedIds.includes(item.id)).map((item) => item.path)
    const operation = await withLoading('正在移动到回收站...', () => api.residual.quarantine({ paths }))

    if (operation) {
      showToast(operation.message)
      if (operation.success) {
        setResult((current) =>
          current ? { ...current, items: current.items.filter((item) => !selectedIds.includes(item.id)) } : current
        )
        setSelectedIds([])
      }
    }
  }

  return (
    <FeatureCard
      title="卸载残留检测"
      description="读取注册表已安装程序清单,扫描 AppData、ProgramData、Program Files 中找不到对应安装记录的目录,标记为疑似卸载残留。"
    >
      <div className="flex flex-wrap gap-3">
        <Touchable onClick={scan}>开始扫描</Touchable>
        <SelectionActions
          itemCount={result?.items.length ?? 0}
          onSelectAll={() => setSelectedIds(result?.items.map((item) => item.id) ?? [])}
          onClearAll={() => setSelectedIds([])}
        />
        <Touchable variant="secondary" disabled={!result}>
          预估释放 {formatBytes(selectedBytes)}
        </Touchable>
        <Touchable variant="danger" disabled={!selectedIds.length} onClick={() => setConfirmOpen(true)}>
          删除选中项 ({selectedIds.length})
        </Touchable>
      </div>

      {result && !result.supported ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">{result.message}</p>
      ) : null}

      {result && result.supported ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          共发现 {result.items.length} 个疑似残留目录。残留判定基于启发式比对,删除前请确认目录确实不再需要。
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {result?.items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleItem(item)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate">{item.name}</strong>
                <StatusBadge tone="neutral">{SOURCE_LABEL[item.source]}</StatusBadge>
                <StatusBadge tone={item.riskLevel === 'cautious' ? 'warning' : 'neutral'}>
                  {item.riskLevel === 'cautious' ? '谨慎处理' : '建议删除'}
                </StatusBadge>
                <span className="text-xs text-slate-500">{formatBytes(item.sizeBytes)}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.reason}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">建议: {item.recommendation}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{item.path}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Touchable
                  variant="secondary"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => api.app.showItemInFolder(item.path)}
                >
                  打开所在位置
                </Touchable>
                <Touchable
                  variant="ghost"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => api.description.openOnlineSearch({ name: item.name, path: item.path, kind: 'file' })}
                >
                  这是什么?能删吗
                </Touchable>
              </div>
            </div>
          </div>
        ))}
        {!result ? <p className="text-sm text-slate-600 dark:text-slate-300">点击「开始扫描」检测卸载残留。</p> : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="确认删除残留目录"
        description={`将 ${selectedIds.length} 个疑似残留目录移动到系统回收站(可恢复),释放约 ${formatBytes(selectedBytes)}。请确认这些目录不是仍在使用的程序数据。`}
        onConfirm={quarantine}
        onCancel={() => setConfirmOpen(false)}
      />
    </FeatureCard>
  )
}
