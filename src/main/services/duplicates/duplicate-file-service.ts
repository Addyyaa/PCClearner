import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { DuplicateFileCandidate, DuplicateFileGroup, DuplicateScanOptions } from '../../../../shared/types'
import { createId } from '../../utils/id'

/** 头部采样字节数，用于快速排除明显不同的文件。 */
const PARTIAL_HASH_BYTES = 64 * 1024

export class DuplicateFileService {
  /**
   * 深层递归扫描所有根目录，跨目录比对重复文件。
   * 分三级：文件大小 -> 头部 MD5 采样 -> 完整 SHA-256，兼顾速度与准确性。
   */
  async scan(options: DuplicateScanOptions): Promise<DuplicateFileGroup[]> {
    const candidates = await this.collectCandidates(options)
    const bySize = this.groupBySize(candidates)
    const groups: DuplicateFileGroup[] = []

    for (const sizeGroup of bySize.values()) {
      if (sizeGroup.length < 2) continue

      const withPartial = await Promise.all(sizeGroup.map((file) => this.withPartialHash(file)))
      const byPartial = this.groupByPartialHash(withPartial)

      for (const partialGroup of byPartial.values()) {
        if (partialGroup.length < 2) continue

        const withFull = await Promise.all(partialGroup.map((file) => this.withFullHash(file)))
        const byHash = this.groupByHash(withFull)

        for (const [hash, files] of byHash.entries()) {
          if (files.length < 2) continue

          const uniqueDirectories = new Set(files.map((file) => file.path.replace(/[\\/][^\\/]*$/, ''))).size
          groups.push({
            id: createId('dupGroup'),
            sizeBytes: files[0].sizeBytes,
            hash,
            files,
            recommendedKeepPath: this.pickKeepPath(files),
            reason:
              `文件大小、头部采样和完整 SHA-256 全部一致，可判定为重复文件` +
              `（跨 ${uniqueDirectories} 个目录）。默认建议保留修改时间最新的一份。`
          })
        }
      }
    }

    return groups.sort((left, right) => right.sizeBytes * right.files.length - left.sizeBytes * left.files.length)
  }

  private async collectCandidates(options: DuplicateScanOptions): Promise<DuplicateFileCandidate[]> {
    const files: DuplicateFileCandidate[] = []

    for (const root of options.roots) {
      files.push(...(await this.walk(root, options)))
    }

    return files
  }

  private async walk(directory: string, options: DuplicateScanOptions): Promise<DuplicateFileCandidate[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true })
      const files: DuplicateFileCandidate[] = []

      for (const entry of entries) {
        if (options.ignoreHiddenFiles && entry.name.startsWith('.')) continue

        const entryPath = join(directory, entry.name)

        if (entry.isSymbolicLink()) continue

        if (entry.isDirectory()) {
          files.push(...(await this.walk(entryPath, options)))
          continue
        }

        if (!entry.isFile()) continue

        try {
          const stats = await stat(entryPath)

          if (stats.size >= options.minSizeBytes) {
            files.push({
              id: createId('dup'),
              path: entryPath,
              sizeBytes: stats.size,
              modifiedAt: stats.mtime.toISOString()
            })
          }
        } catch {
          // 中文注释: 单个文件读取失败（占用/权限）不应中断整体扫描。
        }
      }

      return files
    } catch {
      return []
    }
  }

  /** 选择重复组中修改时间最新的文件作为建议保留项。 */
  private pickKeepPath(files: DuplicateFileCandidate[]): string {
    return files
      .slice()
      .sort((left, right) => new Date(right.modifiedAt ?? 0).getTime() - new Date(left.modifiedAt ?? 0).getTime())[0]
      .path
  }

  private groupBySize(files: DuplicateFileCandidate[]): Map<number, DuplicateFileCandidate[]> {
    return this.groupBy(files, (file) => file.sizeBytes)
  }

  private groupByPartialHash(files: DuplicateFileCandidate[]): Map<string, DuplicateFileCandidate[]> {
    return this.groupBy(files, (file) => file.partialHash ?? '')
  }

  private groupByHash(files: DuplicateFileCandidate[]): Map<string, DuplicateFileCandidate[]> {
    return this.groupBy(files, (file) => file.fullHash ?? '')
  }

  private async withPartialHash(file: DuplicateFileCandidate): Promise<DuplicateFileCandidate> {
    return {
      ...file,
      partialHash: await this.hashPartial(file.path)
    }
  }

  private async withFullHash(file: DuplicateFileCandidate): Promise<DuplicateFileCandidate> {
    return {
      ...file,
      fullHash: await this.hashFile(file.path)
    }
  }

  /** 读取文件头部若干字节做 MD5 采样，快速排除大部分非重复文件。 */
  private async hashPartial(filePath: string): Promise<string> {
    let handle: Awaited<ReturnType<typeof open>> | undefined

    try {
      handle = await open(filePath, 'r')
      const buffer = Buffer.alloc(PARTIAL_HASH_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, PARTIAL_HASH_BYTES, 0)
      return createHash('md5').update(buffer.subarray(0, bytesRead)).digest('hex')
    } catch {
      return `unreadable-${filePath}`
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  private hashFile(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)

      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('error', () => resolve(`unreadable-${filePath}`))
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }

  private groupBy<T, K>(items: T[], keyGetter: (item: T) => K): Map<K, T[]> {
    const result = new Map<K, T[]>()

    for (const item of items) {
      const key = keyGetter(item)
      result.set(key, [...(result.get(key) ?? []), item])
    }

    return result
  }
}
