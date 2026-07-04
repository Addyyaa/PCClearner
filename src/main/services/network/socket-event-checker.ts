import type { NetworkFixAction } from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'

/** Windows Socket 错误 10055 (WSAENOBUFS): 系统缓冲区不足或队列已满。 */
export const WSA_ENOBUFS_CODE = '10055'

/** 事件日志中识别 Socket 资源耗尽相关错误的关键词。 */
export const SOCKET_EXHAUSTION_PATTERNS = [
  WSA_ENOBUFS_CODE,
  'WSAENOBUFS',
  '缓冲区空间不足',
  '队列已满',
  'queue was full',
  'No buffer space available',
  'lack sufficient buffer space'
] as const

export interface SocketErrorEvent {
  /** 事件来源进程名(运行时从日志动态解析) */
  processName: string
  /** Socket 错误码,通常为 10055 */
  errorCode: string
  /** 失败的 Winsock API,如 connect */
  api?: string
  /** 事件时间 ISO 字符串 */
  timeCreated: string
  /** 原始事件摘要 */
  message: string
  /** 事件提供程序名称 */
  providerName?: string
}

export interface ProcessConnectionStat {
  pid: number
  processName: string
  connectionCount: number
}

export interface SocketLeakAnalysis {
  /** 事件日志中检测到的 Socket 错误 */
  socketEvents: SocketErrorEvent[]
  /** 连接数异常偏高的进程 */
  heavyConnectors: ProcessConnectionStat[]
  /** 主要嫌疑进程(优先事件日志,其次高连接数) */
  primarySuspect?: string
}

interface RawWinEventRecord {
  TimeCreated?: string
  ProviderName?: string
  Id?: number
  Message?: string
}

/**
 * 从事件消息中提取进程名。
 * 兼容「事件 N, SomeApp.exe」标题格式、消息正文中的 .exe,以及 ProviderName。
 */
export function extractProcessNameFromEventMessage(message: string, providerName?: string): string | undefined {
  const text = `${message}\n${providerName ?? ''}`

  // 优先匹配「事件 N, ProcessName.exe」格式(常见于 Windows 事件查看器标题/正文)
  const titleMatch = text.match(/事件\s*\d+\s*,\s*([A-Za-z0-9_.-]+\.exe)/i)
  if (titleMatch?.[1]) return normalizeProcessName(titleMatch[1])

  // 匹配消息中的独立 .exe 引用
  const exeMatches = [...text.matchAll(/\b([A-Za-z0-9_.-]+\.exe)\b/gi)].map((match) => match[1])
  const filtered = exeMatches.filter((name) => !isSystemProcess(name))
  if (filtered.length > 0) return normalizeProcessName(filtered[0])

  // ProviderName 可能是进程名(带或不带 .exe)
  if (providerName && isLikelyApplicationProvider(providerName)) {
    return normalizeProcessName(providerName)
  }

  return undefined
}

/** 从事件消息中提取 Socket 错误码与 API 名称。 */
export function parseSocketErrorDetails(message: string): { errorCode?: string; api?: string } {
  const errorMatch = message.match(/\((\d{4,5})\)|\b(WSAENOBUFS|10055)\b/i)
  const apiMatch = message.match(/API\s+'([^']+)'|auf\s+API\s+'([^']+)'/i)

  return {
    errorCode: errorMatch?.[1] ?? (errorMatch?.[2]?.toUpperCase() === 'WSAENOBUFS' ? WSA_ENOBUFS_CODE : errorMatch?.[2]),
    api: apiMatch?.[1] ?? apiMatch?.[2]
  }
}

/** 判断消息是否包含 Socket 资源耗尽相关错误。 */
export function isSocketExhaustionMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return SOCKET_EXHAUSTION_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))
}

/** 解析 PowerShell Get-WinEvent 输出的 JSON。 */
export function parseWinEventJson(stdout: string): SocketErrorEvent[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed) as RawWinEventRecord | RawWinEventRecord[]
    const records = Array.isArray(parsed) ? parsed : [parsed]

    return records.flatMap((record) => {
      if (!record.Message || !isSocketExhaustionMessage(record.Message)) return []

      const message = record.Message
      const { errorCode, api } = parseSocketErrorDetails(message)
      const processName = extractProcessNameFromEventMessage(message, record.ProviderName)
      if (!processName) return []

      const event: SocketErrorEvent = {
        processName,
        errorCode: errorCode ?? WSA_ENOBUFS_CODE,
        timeCreated: record.TimeCreated ?? '',
        message: message.slice(0, 500),
        providerName: record.ProviderName
      }
      if (api) event.api = api

      return [event]
    })
  } catch {
    return []
  }
}

/** 解析 netstat -ano 与 tasklist 输出,统计各进程连接数。 */
export function parseProcessConnectionStats(netstatOutput: string, tasklistOutput: string): ProcessConnectionStat[] {
  const pidToName = new Map<number, string>()

  for (const line of tasklistOutput.split('\n')) {
    const csvMatch = line.match(/^"([^"]+)","(\d+)"/)
    if (csvMatch) {
      pidToName.set(Number(csvMatch[2]), csvMatch[1])
      continue
    }

    const match = line.match(/^"([^"]+)",(\d+),/)
    if (match) {
      pidToName.set(Number(match[2]), match[1])
    } else {
      const plainMatch = line.match(/^(\S+)\s+(\d+)\s/)
      if (plainMatch) {
        pidToName.set(Number(plainMatch[2]), plainMatch[1])
      }
    }
  }

  const pidCounts = new Map<number, number>()
  for (const line of netstatOutput.split('\n')) {
    const match = line.match(/\s+(\d+)\s*$/)
    if (!match) continue
    const pid = Number(match[1])
    if (pid <= 0) continue
    pidCounts.set(pid, (pidCounts.get(pid) ?? 0) + 1)
  }

  return [...pidCounts.entries()]
    .map(([pid, connectionCount]) => ({
      pid,
      processName: pidToName.get(pid) ?? `PID:${pid}`,
      connectionCount
    }))
    .filter((stat) => stat.connectionCount >= 50 && !isSystemProcess(stat.processName))
    .sort((a, b) => b.connectionCount - a.connectionCount)
}

/** 根据事件日志与高连接进程收集去重后的嫌疑进程列表(事件日志优先)。 */
export function collectSocketLeakSuspects(
  analysis: Pick<SocketLeakAnalysis, 'socketEvents' | 'heavyConnectors'>
): string[] {
  const suspects: string[] = []
  const seen = new Set<string>()

  for (const event of analysis.socketEvents) {
    const key = event.processName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    suspects.push(event.processName)
  }

  for (const connector of analysis.heavyConnectors) {
    const key = connector.processName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    suspects.push(connector.processName)
  }

  return suspects
}

/** @deprecated 使用 collectSocketLeakSuspects;保留兼容单嫌疑场景 */
export function inferPrimarySuspect(analysis: Pick<SocketLeakAnalysis, 'socketEvents' | 'heavyConnectors'>): string | undefined {
  return collectSocketLeakSuspects(analysis)[0]
}

export type SocketLeakDetectionSource = 'event-log' | 'connection-stats'

/** 为检测到的嫌疑进程生成参数化修复动作(进程名运行时填入,非写死)。 */
export function buildStopSocketLeakFix(
  processName: string,
  source: SocketLeakDetectionSource = 'event-log',
  platform: NetworkFixAction['platform'] = 'windows'
): NetworkFixAction {
  const reason =
    source === 'event-log'
      ? '该进程在系统事件日志中报告了 Socket 错误 10055(缓冲区/队列已满)'
      : `该进程当前持有异常偏高的网络连接数`

  const macDescription =
    `终止 ${processName}。${reason},可能导致本机无法新建连接。` +
    '将先发送 SIGTERM,必要时再强制结束进程。'

  const windowsDescription =
    `停止或终止 ${processName}。${reason},` +
    '可能导致本机无法新建连接。将优先尝试停止同名 Windows 服务,再终止进程。'

  return {
    id: 'stop-socket-leak-process',
    title: `终止占用 Socket 的进程/服务 (${processName})`,
    description: platform === 'macos' ? macDescription : windowsDescription,
    requiresElevation: true,
    reversible: true,
    platform,
    target: processName
  }
}

export class SocketEventChecker {
  constructor(private readonly commandRunner: CommandRunner) {}

  /** 扫描 Windows 事件日志与连接统计,定位 Socket 资源泄漏来源。 */
  async analyze(): Promise<SocketLeakAnalysis> {
    const [socketEvents, heavyConnectors] = await Promise.all([
      this.scanEventLog(),
      this.scanHeavyConnectors()
    ])

    const primarySuspect = collectSocketLeakSuspects({ socketEvents, heavyConnectors })[0]

    return { socketEvents, heavyConnectors, primarySuspect }
  }

  private async scanEventLog(): Promise<SocketErrorEvent[]> {
    const pattern = SOCKET_EXHAUSTION_PATTERNS.join('|').replace(/'/g, "''")
    const script =
      `$patterns = '${pattern}'; ` +
      `$start = (Get-Date).AddHours(-72); ` +
      `$events = @(); ` +
      `foreach ($log in @('Application','System')) { ` +
      `  try { $events += Get-WinEvent -FilterHashtable @{LogName=$log; StartTime=$start} -MaxEvents 800 -ErrorAction Stop } catch {} ` +
      `}; ` +
      `$matched = $events | Where-Object { $_.Message -match $patterns } | Select-Object -First 30 TimeCreated, ProviderName, Id, Message; ` +
      `if ($matched) { $matched | ConvertTo-Json -Compress }`

    const result = await this.commandRunner
      .run('powershell', ['-NoProfile', '-Command', script], 20_000)
      .catch(() => ({ stdout: '', stderr: '' }))

    return parseWinEventJson(result.stdout)
  }

  private async scanHeavyConnectors(): Promise<ProcessConnectionStat[]> {
    const [netstat, tasklist] = await Promise.all([
      this.commandRunner.run('netstat', ['-ano'], 10_000).catch(() => ({ stdout: '', stderr: '' })),
      this.commandRunner.run('tasklist', ['/FO', 'CSV', '/NH'], 10_000).catch(() => ({ stdout: '', stderr: '' }))
    ])

    return parseProcessConnectionStats(netstat.stdout, tasklist.stdout)
  }
}

function normalizeProcessName(name: string): string {
  return name.endsWith('.exe') ? name : `${name}.exe`
}

function isLikelyApplicationProvider(providerName: string): boolean {
  if (isSystemProcess(providerName)) return false
  // 排除 Windows 系统 Provider,保留第三方/应用自身 Provider
  return !/^Microsoft-/i.test(providerName) && !/^Windows/i.test(providerName) && !/^Application Error$/i.test(providerName)
}

function isSystemProcess(name: string): boolean {
  const lower = name.toLowerCase()
  return [
    'system',
    'system idle process',
    'svchost.exe',
    'lsass.exe',
    'services.exe',
    'csrss.exe',
    'smss.exe',
    'wininit.exe',
    'winlogon.exe',
    'dwm.exe',
    'explorer.exe',
    'pcleaner.exe',
    'electron.exe'
  ].includes(lower)
}
