import { useState } from 'react'
import type { StartupItem } from '../../../../shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FeatureCard } from '../components/FeatureCard'
import { SelectionActions } from '../components/SelectionActions'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

export function StartupPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [items, setItems] = useState<StartupItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function loadItems() {
    const nextItems = await withLoading('正在检测开机自启动项...', () => api.startup.list())
    setItems(nextItems ?? [])
    setSelectedIds([])
  }

  function toggleItem(item: StartupItem) {
    setSelectedIds((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
    )
  }

  async function disableSelected() {
    setConfirmOpen(false)
    const operation = await withLoading('正在关闭启动项...', () =>
      api.startup.setEnabled({ itemIds: selectedIds, enabled: false, createRollback: true })
    )

    if (operation) {
      showToast(operation.message)
      if (operation.success) await loadItems()
    }
  }

  return (
    <FeatureCard title="开机启动项" description="列出注册表、启动文件夹、计划任务、服务、LaunchAgent 等来源,支持一键关闭选中项。">
      <div className="flex flex-wrap gap-3">
        <Touchable onClick={loadItems}>检测启动项</Touchable>
        <SelectionActions
          itemCount={items.length}
          onSelectAll={() => setSelectedIds(items.map((item) => item.id))}
          onClearAll={() => setSelectedIds([])}
        />
        <Touchable variant="danger" disabled={!selectedIds.length} onClick={() => setConfirmOpen(true)}>
          关闭选中项 ({selectedIds.length})
        </Touchable>
      </div>

      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleItem(item)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{item.name}</strong>
                <StatusBadge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '已启用' : '已禁用'}</StatusBadge>
                <StatusBadge tone="neutral">{item.source}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{item.command}</p>
            </div>
          </label>
        ))}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="确认关闭启动项"
        description={`将关闭 ${selectedIds.length} 个启动项,并创建回滚记录。请确认这些程序不是安全软件或系统必要组件。`}
        onConfirm={disableSelected}
        onCancel={() => setConfirmOpen(false)}
      />
    </FeatureCard>
  )
}
