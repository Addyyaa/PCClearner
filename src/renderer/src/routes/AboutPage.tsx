import { useEffect, useState } from 'react'
import { Download, RefreshCw, Rocket } from 'lucide-react'
import type { UpdateCheckResult, UpdateStatusEvent } from '../../../../shared/types/update'
import { FeatureCard } from '../components/FeatureCard'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { Touchable } from '../components/Touchable'
import { useAppApi } from '../hooks/useAppApi'
import { useAppStore } from '../store/appStore'

export function AboutPage() {
  const { api, withLoading } = useAppApi()
  const showToast = useAppStore((state) => state.showToast)
  const [version, setVersion] = useState('')
  const [updateEnabled, setUpdateEnabled] = useState(false)
  const [checkResult, setCheckResult] = useState<UpdateCheckResult>()
  const [status, setStatus] = useState<UpdateStatusEvent>({ type: 'idle', message: '' })
  const [downloadPercent, setDownloadPercent] = useState(0)

  useEffect(() => {
    void api.update.getVersion().then(setVersion)
    void api.update.isEnabled().then(setUpdateEnabled)
  }, [api])

  useEffect(() => {
    const unsubscribe = api.update.onStatus((event) => {
      setStatus(event)
      if (event.type === 'download-progress' && event.progress) {
        setDownloadPercent(Math.round(event.progress.percent))
      }
      if (event.type === 'update-available') {
        showToast(`发现新版本 ${event.version}`)
      }
      if (event.type === 'update-downloaded') {
        showToast('更新已下载,可立即安装')
      }
    })
    return unsubscribe
  }, [api, showToast])

  async function checkUpdate() {
    const result = await withLoading('正在检查更新...', () => api.update.check(true))
    if (result) setCheckResult(result)
  }

  async function downloadUpdate() {
    await withLoading('正在下载更新...', () => api.update.download())
  }

  function installUpdate() {
    const confirmed = window.confirm('安装更新将重启应用,是否继续?')
    if (confirmed) api.update.install()
  }

  const canDownload = checkResult?.updateAvailable || status.type === 'update-available'
  const canInstall = status.type === 'update-downloaded'

  return (
    <div className="space-y-6">
      <FeatureCard title="关于 PCCleaner" description="跨平台系统清理与网络诊断工具。">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">当前版本</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">v{version || '...'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">许可协议</p>
            <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
              个人开发者可免费用于非商业用途;商业使用须获得书面授权。详见项目根目录 LICENSE 文件。
            </p>
          </div>
        </div>
      </FeatureCard>

      <FeatureCard
        title="检查更新"
        description={
          updateEnabled
            ? '应用启动后会自动检查 GitHub Releases 上的新版本,也可在此手动检查。'
            : '当前为开发模式,自动更新仅在打包安装版中可用。'
        }
      >
        <div className="flex flex-wrap gap-3">
          <Touchable onClick={checkUpdate}>
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              检查更新
            </span>
          </Touchable>
          <Touchable variant="secondary" disabled={!canDownload || canInstall} onClick={downloadUpdate}>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" aria-hidden="true" />
              下载更新
            </span>
          </Touchable>
          <Touchable variant="danger" disabled={!canInstall} onClick={installUpdate}>
            <span className="inline-flex items-center gap-2">
              <Rocket className="h-4 w-4" aria-hidden="true" />
              立即安装并重启
            </span>
          </Touchable>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <StatusBadge tone={updateEnabled ? 'success' : 'neutral'}>
            {updateEnabled ? '自动更新已启用' : '开发模式'}
          </StatusBadge>
          {checkResult ? (
            <StatusBadge tone={checkResult.updateAvailable ? 'warning' : 'success'}>{checkResult.message}</StatusBadge>
          ) : null}
          {status.type !== 'idle' ? <StatusBadge tone="neutral">{status.message}</StatusBadge> : null}
        </div>

        {status.type === 'download-progress' ? (
          <div className="mt-5">
            <ProgressBar value={downloadPercent} label="下载进度" />
          </div>
        ) : null}

        {checkResult?.updateInfo?.releaseNotes ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <strong>更新说明:</strong>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{checkResult.updateInfo.releaseNotes}</pre>
          </div>
        ) : null}
      </FeatureCard>
    </div>
  )
}
