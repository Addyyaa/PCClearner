import { lookup, resolve4 } from 'node:dns/promises'
import { withTimeout } from '../../utils/timeout'

/** DNS 探测用的稳定域名,覆盖国内外常见站点。 */
export const DNS_TEST_HOSTS = ['www.microsoft.com', 'example.com', 'cloudflare.com'] as const

/** 单个域名 DNS 探测超时(毫秒),断网时必须限制,否则会长时间阻塞诊断。 */
export const DNS_PROBE_TIMEOUT_MS = 4_000

export interface DnsProbeResult {
  host: string
  resolved: boolean
  addresses: string[]
  method: 'node-resolve4' | 'node-lookup'
  error?: string
}

export interface DnsCheckSummary {
  /** 系统 DNS 是否可用(至少 2 个域名解析成功视为正常)。 */
  systemDnsOk: boolean
  /** 各域名探测明细。 */
  probes: DnsProbeResult[]
  /** 成功解析的域名数量。 */
  successCount: number
}

/**
 * 使用 Node.js 内置 DNS 解析器检测系统 DNS。
 *
 * 关键说明:
 * - Node dns 与浏览器/应用使用同一套系统解析链路,比 nslookup 更贴近真实使用场景。
 * - 每个域名单独超时,并行探测,避免断网时串行等待数分钟。
 * - 至少 2 个探测域名成功才判定为 pass,避免单个域名偶发故障造成误判。
 */
export async function probeSystemDns(hosts: readonly string[] = DNS_TEST_HOSTS): Promise<DnsCheckSummary> {
  const probes = await Promise.all(hosts.map((host) => probeHost(host)))
  const successCount = probes.filter((probe) => probe.resolved).length

  return {
    systemDnsOk: successCount >= 2,
    probes,
    successCount
  }
}

async function probeHost(host: string): Promise<DnsProbeResult> {
  try {
    return await withTimeout(probeHostInner(host), DNS_PROBE_TIMEOUT_MS, 'DNS 探测超时')
  } catch (error) {
    return {
      host,
      resolved: false,
      addresses: [],
      method: 'node-resolve4',
      error: error instanceof Error ? error.message : 'DNS 探测超时'
    }
  }
}

async function probeHostInner(host: string): Promise<DnsProbeResult> {
  try {
    const addresses = await resolve4(host)
    if (addresses.length > 0) {
      return { host, resolved: true, addresses, method: 'node-resolve4' }
    }
  } catch {
    try {
      const result = await lookup(host, { family: 4 })
      return { host, resolved: true, addresses: [result.address], method: 'node-lookup' }
    } catch (lookupError) {
      return {
        host,
        resolved: false,
        addresses: [],
        method: 'node-resolve4',
        error: lookupError instanceof Error ? lookupError.message : String(lookupError)
      }
    }
  }

  return { host, resolved: false, addresses: [], method: 'node-resolve4', error: '未返回地址' }
}

/** 将探测结果格式化为诊断证据文本。 */
export function formatDnsEvidence(summary: DnsCheckSummary): string[] {
  return summary.probes.map((probe) =>
    probe.resolved
      ? `${probe.host}: 成功 (${probe.addresses.slice(0, 2).join(', ')})`
      : `${probe.host}: 失败${probe.error ? ` (${probe.error})` : ''}`
  )
}
