export interface DuplicateFileCandidate {
  id: string
  path: string
  sizeBytes: number
  partialHash?: string
  fullHash?: string
  modifiedAt?: string
}

export interface DuplicateFileGroup {
  id: string
  sizeBytes: number
  hash: string
  files: DuplicateFileCandidate[]
  recommendedKeepPath: string
  reason: string
}

export interface DuplicateScanOptions {
  roots: string[]
  minSizeBytes: number
  ignoreHiddenFiles: boolean
}
