import { useState } from 'react'
import type { DesktopAdScanResult, DesktopAdSuspect } from '../../../../shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FeatureCard } from '../components/FeatureCard'
import { SelectionActions } from '../components/SelectionActions'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

export function AdsPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [result, setResult] = useState<DesktopAdScanResult>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function scan() {
    const nextResult = await withLoading('正在检测桌面广告弹窗来源...', () => api.ads.scan())
    setResult(nextResult)
    setSelectedIds(nextResult?.suspects.map((item: DesktopAdSuspect) => item.id) ?? [])
  }

  function toggleSuspect(suspect: DesktopAdSuspect) {
    setSelectedIds((current) =>
      current.includes(suspect.id) ? current.filter((id) => id !== suspect.id) : [...current, suspect.id]
    )
  }

  async function searchProcess(suspect: DesktopAdSuspect) {
    await withLoading('正在打开在线查询...', () =>
      api.description.openOnlineSearch({
        name: suspect.processName,
        path: suspect.executablePath,
        kind: 'process'
      })
    )
  }

  async function resolveSelected() {
    setConfirmOpen(false)
    const operation = await withLoading('正在处理可疑广告来源...', () =>
      api.ads.resolve({
        suspectIds: selectedIds,
        terminateProcess: true,
        disableStartup: false,
        quarantine: true
      })
    )

    if (operation) {
      showToast(operation.message)
      if (operation.success) await scan()
    }
  }

  return (
    <FeatureCard title="桌面广告检测" description="通过窗口行为、进程路径、自启动项和签名等信号定位可疑广告来源。">
      <div className="flex flex-wrap gap-3">
        <Touchable onClick={scan}>扫描广告弹窗</Touchable>
        <SelectionActions
          itemCount={result?.suspects.length ?? 0}
          onSelectAll={() => setSelectedIds(result?.suspects.map((item) => item.id) ?? [])}
          onClearAll={() => setSelectedIds([])}
        />
        <Touchable variant="danger" disabled={!selectedIds.length} onClick={() => setConfirmOpen(true)}>
          处理选中项 ({selectedIds.length})
        </Touchable>
      </div>

      {result?.limitations.length ? (
        <ul className="mt-4 list-disc pl-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
          {result.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 space-y-3">
        {result?.suspects.map((suspect) => (
          <div key={suspect.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selectedIds.includes(suspect.id)}
              onChange={() => toggleSuspect(suspect)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <strong>{suspect.processName}</strong>
                <StatusBadge tone={suspect.confidence === 'high' ? 'danger' : 'warning'}>{suspect.confidence}</StatusBadge>
              </div>
              <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {suspect.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{suspect.suggestedAction}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {suspect.executablePath ? (
                  <Touchable
                    variant="secondary"
                    className="min-h-9 px-3 py-1 text-xs"
                    onClick={() => api.app.showItemInFolder(suspect.executablePath!)}
                  >
                    打开所在位置
                  </Touchable>
                ) : null}
                <Touchable variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => searchProcess(suspect)}>
                  这是什么程序?能删吗
                </Touchable>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="确认处理广告来源"
        description="将结束选中进程并隔离可执行文件。请确认这些进程不是正常业务软件。"
        onConfirm={resolveSelected}
        onCancel={() => setConfirmOpen(false)}
      />
    </FeatureCard>
  )
}
