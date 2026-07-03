import { useState } from 'react'

import type { RegistryIssue, RegistryScanResult } from '../../../../shared/types'

import { ConfirmDialog } from '../components/ConfirmDialog'

import { FeatureCard } from '../components/FeatureCard'

import { SelectionActions } from '../components/SelectionActions'

import { StatusBadge } from '../components/StatusBadge'

import { Touchable } from '../components/Touchable'

import { useAppApi } from '../hooks/useAppApi'

import { useAppStore } from '../store/appStore'



export function RegistryPage() {

  const { api, withLoading } = useAppApi()

  const showToast = useAppStore((state) => state.showToast)

  const [result, setResult] = useState<RegistryScanResult>()

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [confirmOpen, setConfirmOpen] = useState(false)



  async function scan() {

    const nextResult = await withLoading('正在扫描无效注册表项...', () => api.registry.scan())



    if (nextResult) {

      setResult(nextResult)

      setSelectedIds(
        nextResult.issues.filter((issue: RegistryIssue) => issue.selectedByDefault).map((issue: RegistryIssue) => issue.id)
      )

    }

  }



  function toggleIssue(issue: RegistryIssue) {

    setSelectedIds((current) =>

      current.includes(issue.id) ? current.filter((id) => id !== issue.id) : [...current, issue.id]

    )

  }



  async function clean() {

    setConfirmOpen(false)

    const operation = await withLoading('正在备份并清理注册表...', () =>

      api.registry.clean({ issueIds: selectedIds, exportBackup: true })

    )



    if (operation) {

      showToast(operation.message)

      if (operation.success) await scan()

    }

  }



  return (

    <FeatureCard title="注册表清理" description="仅 Windows 可用,清理前自动导出备份,并支持还原记录。">

      <div className="flex gap-3">

        <Touchable onClick={scan}>扫描注册表</Touchable>

        <SelectionActions
          itemCount={result?.issues.length ?? 0}
          onSelectAll={() => setSelectedIds(result?.issues.map((issue) => issue.id) ?? [])}
          onClearAll={() => setSelectedIds([])}
        />

        <Touchable variant="danger" disabled={!selectedIds.length} onClick={() => setConfirmOpen(true)}>

          备份并清理 ({selectedIds.length})

        </Touchable>

      </div>



      <div className="mt-6">

        <StatusBadge tone={result?.supported === false ? 'warning' : 'neutral'}>

          {result?.message ?? `发现 ${result?.issues.length ?? 0} 个问题`}

        </StatusBadge>

      </div>



      <div className="mt-4 space-y-3">

        {result?.issues.map((issue) => (

          <label key={issue.id} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">

            <input

              type="checkbox"

              className="mt-1 h-4 w-4"

              checked={selectedIds.includes(issue.id)}

              onChange={() => toggleIssue(issue)}

            />

            <div>

              <strong>{issue.issueType}</strong>

              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{issue.description}</p>

              <p className="mt-1 text-xs text-slate-500">

                {issue.hive}\{issue.keyPath}

                {issue.valueName ? ` (${issue.valueName})` : ''}

              </p>

            </div>

          </label>

        ))}

      </div>



      <ConfirmDialog

        open={confirmOpen}

        title="确认注册表清理"

        description={`将清理 ${selectedIds.length} 个注册表问题,并自动导出 HKCU 备份。此操作不可轻易撤销,请确认已阅读每项说明。`}

        onConfirm={clean}

        onCancel={() => setConfirmOpen(false)}

      />

    </FeatureCard>

  )

}


