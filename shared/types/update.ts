export type UpdateStatusType =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateCheckResult {
  currentVersion: string
  updateAvailable: boolean
  updateInfo?: UpdateInfo
  message: string
}

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateStatusEvent {
  type: UpdateStatusType
  message: string
  version?: string
  progress?: UpdateProgress
  updateInfo?: UpdateInfo
}
