import { readdir, stat } from 'node:fs/promises'

import { basename, join, parse } from 'node:path'

import type { DiskUsageNode, DiskUsageReport, DiskVolumeUsage } from '../../../../shared/types'

import { CommandRunner } from '../../platform/command-runner'

import { PlatformService } from '../../platform/platform-service'

import { createId } from '../../utils/id'



export class DiskUsageService {

  constructor(

    private readonly platform: PlatformService,

    private readonly commandRunner: CommandRunner

  ) {}



  async getUsageReport(rootPath: string): Promise<DiskUsageReport> {

    return {

      volumes: await this.listVolumes(),

      tree: [await this.scanUsageTree(rootPath, 2)]

    }

  }



  async getVolumes(): Promise<DiskVolumeUsage[]> {

    return this.listVolumes()

  }



  estimateReclaimableBytes(selectedSizes: number[]): number {

    return selectedSizes.reduce((sum, size) => sum + size, 0)

  }



  private async listVolumes(): Promise<DiskVolumeUsage[]> {

    if (this.platform.isWindows()) {

      return this.listWindowsVolumes()

    }



    return this.listMacVolumes()

  }



  private async listWindowsVolumes(): Promise<DiskVolumeUsage[]> {

    const script =

      "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-Volume | Select-Object DriveLetter, FileSystemLabel, Size, SizeRemaining, DriveType | ConvertTo-Json -Compress"

    const result = await this.commandRunner

      .run('powershell', ['-NoProfile', '-Command', script])

      .catch(() => ({ stdout: '', stderr: '' }))



    if (!result.stdout.trim()) {

      return this.fallbackWindowsVolume()

    }



    try {

      const parsed = JSON.parse(result.stdout) as

        | Array<{

            DriveLetter?: string

            FileSystemLabel?: string

            Size?: number

            SizeRemaining?: number

            DriveType?: string

          }>

        | {

            DriveLetter?: string

            FileSystemLabel?: string

            Size?: number

            SizeRemaining?: number

            DriveType?: string

          }



      const rows = Array.isArray(parsed) ? parsed : [parsed]

      const systemDrive = process.env.SystemDrive ?? 'C:'



      return rows

        .filter((row) => row.DriveLetter)

        .map((row) => {

          const mountPoint = `${row.DriveLetter}:\\`

          const totalBytes = row.Size ?? 0

          const freeBytes = row.SizeRemaining ?? 0



          return {

            id: `volume-${row.DriveLetter}`,

            name: this.createWindowsVolumeName(row.DriveLetter, row.FileSystemLabel),

            mountPoint,

            totalBytes,

            usedBytes: Math.max(totalBytes - freeBytes, 0),

            freeBytes,

            isSystemVolume: mountPoint.toUpperCase().startsWith(systemDrive.toUpperCase())

          }

        })

    } catch {

      return this.fallbackWindowsVolume()

    }

  }



  private fallbackWindowsVolume(): DiskVolumeUsage[] {

    const systemDrive = process.env.SystemDrive ?? 'C:'

    return [

      {

        id: 'system-volume',

        name: `${systemDrive} 系统盘`,

        mountPoint: `${systemDrive}\\`,

        totalBytes: 0,

        usedBytes: 0,

        freeBytes: 0,

        isSystemVolume: true

      }

    ]

  }



  private createWindowsVolumeName(driveLetter: string | undefined, label: string | undefined): string {

    const letter = driveLetter ?? '?'

    const safeLabel = label && !/[�\u0000-\u001f]/.test(label) ? label.trim() : ''

    return safeLabel ? `${letter}: ${safeLabel}` : `${letter}: 本地磁盘`

  }



  private async listMacVolumes(): Promise<DiskVolumeUsage[]> {

    const result = await this.commandRunner.run('df', ['-k']).catch(() => ({ stdout: '', stderr: '' }))

    const lines = result.stdout.split('\n').slice(1)



    return lines

      .map((line) => line.trim().split(/\s+/))

      .filter((parts) => parts.length >= 6 && parts[0].startsWith('/'))

      .map((parts) => {

        const mountPoint = parts[parts.length - 1]

        const totalBytes = Number(parts[1]) * 1024

        const usedBytes = Number(parts[2]) * 1024

        const freeBytes = Number(parts[3]) * 1024



        return {

          id: createId('volume'),

          name: mountPoint === '/' ? 'Macintosh HD' : mountPoint,

          mountPoint,

          totalBytes,

          usedBytes,

          freeBytes,

          isSystemVolume: mountPoint === '/'

        }

      })

  }



  private async scanUsageTree(path: string, depth: number): Promise<DiskUsageNode> {

    const stats = await stat(path)

    const node: DiskUsageNode = {

      id: createId('usage'),

      name: basename(path) || parse(path).root || path,

      path,

      sizeBytes: stats.size,

      children: []

    }



    if (!stats.isDirectory() || depth <= 0) {

      delete node.children

      return node

    }



    try {

      const entries = await readdir(path)

      const children = await Promise.all(entries.slice(0, 100).map((entry) => this.scanUsageTree(join(path, entry), depth - 1)))

      node.children = children.sort((a, b) => b.sizeBytes - a.sizeBytes)

      node.sizeBytes = node.children.reduce((sum, child) => sum + child.sizeBytes, 0)

    } catch {

      delete node.children

    }



    return node

  }

}


