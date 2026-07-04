import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import type { ProcessConnectionStat } from './socket-event-checker'

export interface ConnectionStatsAnalysis {
  heavyConnectors: ProcessConnectionStat[]
}

/** 从 macOS `lsof -i -P -n` 输出按进程名聚合 ESTABLISHED 连接数。 */
export function parseMacLsofConnections(stdout: string): ProcessConnectionStat[] {
  const counts = new Map<string, { pid: number; count: number }>()

  for (const line of stdout.split('\n')) {
    if (!/\bESTABLISHED\b/i.test(line)) continue

    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue

    const processName = parts[0]
    const pid = Number(parts[1])
    if (!processName || Number.isNaN(pid)) continue

    const existing = counts.get(processName) ?? { pid, count: 0 }
    existing.count += 1
    counts.set(processName, existing)
  }

  return [...counts.entries()]
    .map(([processName, stat]) => ({
      processName,
      pid: stat.pid,
      connectionCount: stat.count
    }))
    .sort((left, right) => right.connectionCount - left.connectionCount)
}

/** 从 Windows `netstat -ano` + `tasklist` 输出聚合连接数(复用 socket-event-checker 逻辑)。 */
export function parseWindowsNetstatConnections(netstatStdout: string, tasklistStdout: string): ProcessConnectionStat[] {
  const pidToName = new Map<number, string>()

  for (const line of tasklistStdout.split('\n')) {
    const columns = line.match(/"([^"]*)"/g)
    if (!columns || columns.length < 2) continue
    const processName = columns[0].replace(/"/g, '')
    const pid = Number(columns[1].replace(/"/g, ''))
    if (processName && !Number.isNaN(pid)) {
      pidToName.set(pid, processName)
    }
  }

  const counts = new Map<number, number>()

  for (const line of netstatStdout.split('\n')) {
    if (!/\bESTABLISHED\b/i.test(line)) continue
    const parts = line.trim().split(/\s+/)
    const pid = Number(parts[parts.length - 1])
    if (Number.isNaN(pid)) continue
    counts.set(pid, (counts.get(pid) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([pid, connectionCount]) => ({
      pid,
      processName: pidToName.get(pid) ?? `PID ${pid}`,
      connectionCount
    }))
    .sort((left, right) => right.connectionCount - left.connectionCount)
}

export class ConnectionStatsChecker {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner
  ) {}

  /** 扫描当前连接数异常偏高的进程。 */
  async analyze(): Promise<ConnectionStatsAnalysis> {
    if (this.platform.isMacOS()) {
      const result = await this.commandRunner.run('lsof', ['-i', '-P', '-n'], 10_000).catch(() => ({ stdout: '', stderr: '' }))
      return { heavyConnectors: parseMacLsofConnections(result.stdout) }
    }

    if (this.platform.isWindows()) {
      const [netstat, tasklist] = await Promise.all([
        this.commandRunner.run('netstat', ['-ano'], 10_000).catch(() => ({ stdout: '', stderr: '' })),
        this.commandRunner.run('tasklist', ['/FO', 'CSV', '/NH'], 10_000).catch(() => ({ stdout: '', stderr: '' }))
      ])
      return { heavyConnectors: parseWindowsNetstatConnections(netstat.stdout, tasklist.stdout) }
    }

    return { heavyConnectors: [] }
  }
}
