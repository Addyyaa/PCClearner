import { useMemo, useState } from 'react'
import type { FileSignatureResult, SignatureVerifyResult } from '../../../../shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FeatureCard } from '../components/FeatureCard'
import { SelectionActions } from '../components/SelectionActions'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

const STATUS_TONE: Record<FileSignatureResult['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  valid: 'success',
  unsigned: 'warning',
  invalid: 'danger',
  notFound: 'neutral',
  unknown: 'warning'
}

const STATUS_LABEL: Record<FileSignatureResult['status'], string> = {
  valid: '签名有效',
  unsigned: '未签名',
  invalid: '校验未通过',
  notFound: '文件不存在',
  unknown: '无法判定'
}

export function SignaturePage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [result, setResult] = useState<SignatureVerifyResult>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const failedFiles = useMemo(
    () => result?.files.filter((file) => file.status === 'invalid') ?? [],
    [result]
  )

  async function pickAndVerify() {
    const paths = await api.app.pickFiles()

    if (!paths || paths.length === 0) {
      return
    }

    const nextResult = await withLoading('正在校验数字签名(Get-AuthenticodeSignature)...', () =>
      api.signature.verify({ paths })
    )

    if (nextResult) {
      setResult(nextResult)
      setSelectedIds(
        nextResult.files
          .filter((file: FileSignatureResult) => file.status === 'invalid')
          .map((file: FileSignatureResult) => file.id)
      )
    }
  }

  function toggleFile(file: FileSignatureResult) {
    setSelectedIds((current) =>
      current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id]
    )
  }

  async function quarantine() {
    setConfirmOpen(false)
    const paths = (result?.files ?? []).filter((file) => selectedIds.includes(file.id)).map((file) => file.path)
    const operation = await withLoading('正在移动到回收站...', () => api.signature.quarantine({ paths }))

    if (operation) {
      showToast(operation.message)
      if (operation.success) {
        setResult((current) =>
          current ? { ...current, files: current.files.filter((file) => !selectedIds.includes(file.id)) } : current
        )
        setSelectedIds([])
      }
    }
  }

  return (
    <FeatureCard
      title="系统文件检测"
      description="使用数字签名校验(Windows: Get-AuthenticodeSignature / macOS: codesign)验证文件是否被篡改或伪造,校验不通过时建议删除。"
    >
      <div className="flex flex-wrap gap-3">
        <Touchable onClick={pickAndVerify}>选择文件检测</Touchable>
        <SelectionActions
          itemCount={result?.files.filter((file) => file.status !== 'notFound').length ?? 0}
          onSelectAll={() =>
            setSelectedIds(
              result?.files.filter((file) => file.status !== 'notFound').map((file) => file.id) ?? []
            )
          }
          onClearAll={() => setSelectedIds([])}
        />
        <Touchable variant="danger" disabled={!selectedIds.length} onClick={() => setConfirmOpen(true)}>
          删除选中项 ({selectedIds.length})
        </Touchable>
      </div>

      {result && !result.supported ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">{result.message}</p>
      ) : null}

      {result && result.supported ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          共检测 {result.files.length} 个文件,校验未通过 {failedFiles.length} 个。
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {result?.files.map((file) => (
          <div key={file.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selectedIds.includes(file.id)}
              onChange={() => toggleFile(file)}
              disabled={file.status === 'notFound'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate">{file.name}</strong>
                <StatusBadge tone={STATUS_TONE[file.status]}>{STATUS_LABEL[file.status]}</StatusBadge>
                {file.isSystemPath ? <StatusBadge tone="warning">系统目录</StatusBadge> : null}
                {file.signer ? <span className="text-xs text-slate-500">签发者: {file.signer}</span> : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{file.statusMessage}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">建议: {file.recommendation}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{file.path}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Touchable
                  variant="secondary"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => api.app.showItemInFolder(file.path)}
                >
                  打开所在位置
                </Touchable>
                <Touchable
                  variant="ghost"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => api.description.openOnlineSearch({ name: file.name, path: file.path, kind: 'file' })}
                >
                  这是什么文件?能删吗
                </Touchable>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="确认删除签名异常文件"
        description={`将 ${selectedIds.length} 个文件移动到系统回收站(可从回收站恢复)。请确认这些文件不是误判的正常程序。`}
        onConfirm={quarantine}
        onCancel={() => setConfirmOpen(false)}
      />
    </FeatureCard>
  )
}
