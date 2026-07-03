export interface DiskVolumeUsage {
  id: string
  name: string
  mountPoint: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  isSystemVolume: boolean
}

export interface DiskUsageNode {
  id: string
  name: string
  path: string
  sizeBytes: number
  children?: DiskUsageNode[]
}

export interface DiskUsageReport {
  volumes: DiskVolumeUsage[]
  tree: DiskUsageNode[]
}
