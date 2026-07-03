import type { DescriptionResult } from '../../../../shared/types'

export const LOCAL_DESCRIPTION_KNOWLEDGE_BASE: Record<string, DescriptionResult> = {
  'thumbcache.db': {
    title: '缩略图缓存数据库',
    summary: 'Windows 用来保存图片和视频预览缩略图的缓存文件,删除后系统会自动重新生成。',
    source: 'localKnowledgeBase',
    confidence: 'high'
  },
  'prefetch': {
    title: 'Windows 预读取缓存',
    summary: '用于加速常用程序启动的缓存目录,清理后可能导致首次启动稍慢。',
    source: 'localKnowledgeBase',
    confidence: 'medium'
  },
  'softwaredistribution': {
    title: 'Windows 更新下载缓存',
    summary: 'Windows Update 的下载缓存,更新完成后通常可以清理以释放空间。',
    source: 'localKnowledgeBase',
    confidence: 'high'
  }
}
