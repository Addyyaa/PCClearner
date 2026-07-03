import { useState } from 'react'
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

  async function diagnose() {
    const nextDiagnosis = await withLoading('正在从多层网络模型诊断问题...', () => api.network.diagnose())
    setDiagnosis(nextDiagnosis)
  }

  async function repair(action: NetworkFixAction) {
    const result = await withLoading(`正在执行: ${action.title}...`, () => api.network.repair(action))
    if (result) {
      showToast(result.message)
      if (result.success) await diagnose()
    }
  }

  return (
    <FeatureCard title="网络诊断与修复" description="从链路层、网络层、DNS、传输层、应用层和外部因素综合排查。">
      <Touchable onClick={diagnose}>开始诊断</Touchable>

      {diagnosis?.rootCauses.length ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <strong>可能原因:</strong>
          <ul className="mt-2 list-disc pl-5">
            {diagnosis.rootCauses.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {diagnosis?.recommendedFixes.length ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {diagnosis.recommendedFixes.map((fix) => (
            <Touchable key={fix.id} variant="secondary" onClick={() => repair(fix)}>
              {fix.title}
            </Touchable>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {diagnosis?.checks.map((check) => (
          <div key={check.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <div className="flex items-center justify-between gap-3">
              <strong>{check.name}</strong>
              <StatusBadge tone={check.status === 'pass' ? 'success' : check.status === 'fail' ? 'danger' : 'warning'}>
                {check.status}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{check.message}</p>
          </div>
        ))}
      </div>
    </FeatureCard>
  )
}
