export interface DescriptionQuery {
  name: string
  path?: string
  kind: 'file' | 'process' | 'registry' | 'service'
}

export interface DescriptionResult {
  title: string
  summary: string
  source: 'localKnowledgeBase' | 'onlineSearch'
  searchUrl?: string
  confidence: 'low' | 'medium' | 'high'
}
