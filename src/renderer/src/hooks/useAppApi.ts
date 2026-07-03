import { useAppStore } from '../store/appStore'

function getApi() {
  if (!window.api) {
    throw new Error('Electron IPC 未就绪，请通过 npm run dev 启动桌面应用后再试。')
  }

  return window.api
}

export function useAppApi() {
  const setLoading = useAppStore((state) => state.setLoading)
  const showToast = useAppStore((state) => state.showToast)

  async function withLoading<T>(message: string, task: () => Promise<T>): Promise<T | undefined> {
    try {
      setLoading(true, message)
      return await task()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败,请稍后重试。')
      return undefined
    } finally {
      setLoading(false)
    }
  }

  return {
    api: getApi(),
    withLoading
  }
}
