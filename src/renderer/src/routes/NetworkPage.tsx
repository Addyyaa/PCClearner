import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Wrench } from 'lucide-react'
import { clsx } from 'clsx'
import type { NetworkDiagnosis, NetworkFixAction } from '../../../../shared/types'
import { FeatureCard } from '../components/FeatureCard'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

export function NetworkPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [diagnosis, setDiagnosis] = useState<NetworkDiagnosis>()
  const [fixes, setFixes] = useState<NetworkFixAction[]>([])

  useEffect(() => {
    void api.network.listFixes().then(setFixes)
  }, [api])

  async function diagnose() {
    const nextDiagnosis = await withLoading('正在从多层网络模型诊断问题...', () => api.network.diagnose())
    setDiagnosis(nextDiagnosis)
  }

  async function repair(action: NetworkFixAction) {
    const confirmed = window.confirm(
      `确认执行「${action.title}」?\n\n${action.description}${action.requiresElevation ? '\n\n该操作需要管理员权限。' : ''}`
    )
    if (!confirmed) return

    const result = await withLoading(`正在执行: ${action.title}...`, () => api.network.repair(action))
    if (result) {
      showToast(result.message)
      if (result.success) await diagnose()
    }
  }

  /** 按推荐顺序依次执行全部修复动作。 */
  async function repairAll() {
    const actions = diagnosis?.recommendedFixes ?? []
    if (actions.length === 0) return

    const needsElevation = actions.some((action) => action.requiresElevation)
    const fixList = actions.map((action, index) => `${index + 1}. ${action.title}`).join('\n')
    const confirmed = window.confirm(
      `将依次执行以下 ${actions.length} 项修复:\n\n${fixList}${needsElevation ? '\n\n其中部分操作需要管理员权限。' : ''}\n\n是否继续?`
    )
    if (!confirmed) return

    let successCount = 0
    for (const action of actions) {
      const result = await withLoading(`正在修复 (${successCount + 1}/${actions.length}): ${action.title}...`, () =>
        api.network.repair(action)
      )
      if (result?.success) successCount += 1
    }

    showToast(`一键修复完成: 成功 ${successCount}/${actions.length} 项`)
    await diagnose()
  }

  const recommendedIds = useMemo(
    () => new Set(diagnosis?.recommendedFixes.map((fix) => fix.id)),
    [diagnosis?.recommendedFixes]
  )

  const sortedFixes = useMemo(
    () =>
      [...fixes].sort((a, b) => {
        const aRank = recommendedIds.has(a.id) ? 0 : 1
        const bRank = recommendedIds.has(b.id) ? 0 : 1
        return aRank - bRank
      }),
    [fixes, recommendedIds]
  )

  const hasRecommended = (diagnosis?.recommendedFixes.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <FeatureCard title="网络诊断" description="从链路层、网络层、DNS、传输层、应用层和外部因素综合排查。">
        <div className="flex flex-wrap items-center gap-3">
          <Touchable onClick={diagnose}>开始诊断</Touchable>
          <Touchable variant="danger" disabled={!hasRecommended} onClick={repairAll}>
            一键修复{hasRecommended ? ` (${diagnosis?.recommendedFixes.length})` : ''}
          </Touchable>
        </div>

        {diagnosis?.rootCauses.length ? (
          <div className="mt-4 rounded-2xl border border-red-400 bg-red-100 p-4 text-sm leading-7 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
            <strong className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              可能原因:
            </strong>
            <ul className="mt-2 list-disc pl-5">
              {diagnosis.rootCauses.map((cause) => (
                <li key={cause}>{cause}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {diagnosis?.checks.map((check) => {
            const isFailed = check.status === 'fail' || check.status === 'warning'

            return (
              <div
                key={check.id}
                className={clsx(
                  'rounded-2xl p-4',
                  isFailed
                    ? 'border-2 border-red-500 bg-red-100 dark:border-red-600 dark:bg-red-950/50'
                    : 'bg-slate-50 dark:bg-slate-800'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong className={isFailed ? 'text-red-900 dark:text-red-100' : undefined}>{check.name}</strong>
                  <StatusBadge tone={check.status === 'pass' ? 'success' : check.status === 'fail' ? 'danger' : 'warning'}>
                    {check.status}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{check.message}</p>
              </div>
            )
          })}
        </div>
      </FeatureCard>

      <FeatureCard
        title="网络修复工具箱"
        description={
          hasRecommended
            ? `已用红色高亮 ${diagnosis?.recommendedFixes.length} 项与检测到的问题对应的修复动作。`
            : '诊断出的问题会以红色高亮。你也可以随时手动执行任意修复动作。'
        }
      >
        {hasRecommended ? (
          <div className="mb-4 rounded-2xl border-2 border-red-600 bg-red-200 px-4 py-3 text-sm font-bold text-red-900 dark:border-red-500 dark:bg-red-900 dark:text-red-50">
            检测到 {diagnosis?.recommendedFixes.length} 个可修复问题,下方红色卡片为对应修复项;也可点击上方「一键修复」批量处理。
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {sortedFixes.map((fix) => {
            const recommended = recommendedIds.has(fix.id)
            return (
              <div
                key={fix.id}
                className={clsx(
                  'flex flex-col gap-3 rounded-2xl border p-4 transition',
                  recommended
                    ? 'border-2 border-red-600 bg-red-200 shadow-lg ring-2 ring-red-500 dark:border-red-500 dark:bg-red-900 dark:ring-red-600'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      'flex items-center gap-2 font-bold',
                      recommended ? 'text-red-900 dark:text-red-50' : 'text-slate-900 dark:text-white'
                    )}
                  >
                    <Wrench
                      className={clsx('h-4 w-4', recommended ? 'text-red-700 dark:text-red-200' : 'text-brand-600')}
                      aria-hidden="true"
                    />
                    {fix.title}
                  </span>
                  <div className="flex gap-2">
                    {recommended ? <StatusBadge tone="danger">检测异常</StatusBadge> : null}
                    {fix.requiresElevation ? <StatusBadge tone="neutral">需授权</StatusBadge> : null}
                  </div>
                </div>
                <p className={clsx('text-sm leading-6', recommended ? 'text-red-900 dark:text-red-100' : 'text-slate-600 dark:text-slate-300')}>
                  {fix.description}
                </p>
                <Touchable variant={recommended ? 'danger' : 'secondary'} className="self-start" onClick={() => repair(fix)}>
                  {recommended ? '立即修复' : '执行修复'}
                </Touchable>
              </div>
            )
          })}
          {fixes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">当前平台暂无可用的自动修复动作。</p>
          ) : null}
        </div>
      </FeatureCard>
    </div>
  )
}
