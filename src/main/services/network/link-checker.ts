import { networkInterfaces } from 'node:os'

export interface LinkInterfaceInfo {
  name: string
  address: string
  isApipa: boolean
  isVirtual: boolean
}

export interface LinkInterfaceSummary {
  /** 是否存在有效的、非内部、非 APIPA 的 IPv4 地址(含虚拟适配器)。 */
  hasValidIp: boolean
  /** 是否存在物理网卡(WLAN/以太网)持有的有效 IPv4。 */
  hasPhysicalValidIp: boolean
  /** 有效 IP 全部来自虚拟适配器(VPN/WSL/虚拟机),物理网卡均未联网。 */
  hasVirtualOnlyIp: boolean
  /** 是否仅有 169.254.x.x 自动专用地址(APIPA),说明 DHCP 未能分配 IP。 */
  hasApipaOnly: boolean
  validInterfaces: LinkInterfaceInfo[]
  apipaInterfaces: LinkInterfaceInfo[]
  physicalValidInterfaces: LinkInterfaceInfo[]
  virtualValidInterfaces: LinkInterfaceInfo[]
}

/**
 * 虚拟适配器名称特征。
 * 关键点: VPN 隧道、WSL/Hyper-V、虚拟机、TAP/TUN 等适配器即使持有 IP,
 * 也不能证明物理链路(Wi-Fi/网线)正常,链路层判定必须排除它们。
 */
const VIRTUAL_ADAPTER_PATTERNS: RegExp[] = [
  /vethernet/i,
  /\bwsl\b/i,
  /hyper-?v/i,
  /virtual/i,
  /vmware/i,
  /virtualbox|vbox/i,
  /\btap\b|tap-windows/i,
  /\btun\b|wintun|_tun|tun\d/i,
  /wireguard/i,
  /openvpn/i,
  /\bvpn\b|proton|clash|xray|v2ray/i,
  /zerotier/i,
  /tailscale/i,
  /docker|veth|br-/i,
  /loopback/i,
  /蓝牙|bluetooth/i,
  /letstap/i
]

/** 依据适配器名称与描述判断是否为虚拟/隧道适配器。 */
export function isVirtualAdapter(name: string, description = ''): boolean {
  const combined = `${name} ${description}`.trim()
  return VIRTUAL_ADAPTER_PATTERNS.some((pattern) => pattern.test(combined))
}

/** 判断是否为应参与链路检测的物理网卡(WLAN/以太网)。 */
export function isPhysicalNetworkAdapter(name: string, description = ''): boolean {
  if (isVirtualAdapter(name, description)) return false
  const combined = `${name} ${description}`
  return /wlan|wi-?fi|wireless|无线|以太网|ethernet|en\d|eth\d|realtek|intel.*wi-?fi|broadcom|killer|2\.5gbe|gbe|gigabit/i.test(combined)
}

/**
 * 基于 Node.js os.networkInterfaces() 检测本机有效网络地址。
 *
 * 关键说明:
 * - 该 API 只返回“已启用且已分配地址”的接口,是判断“是否真的联网”的可靠依据。
 * - 169.254.x.x 属于 APIPA 自动专用地址,表示网卡已启用但未从路由器/DHCP 获取到有效 IP。
 * - internal(回环 127.0.0.1)接口一律排除,不能作为联网依据。
 * - VPN/WSL/虚拟机等虚拟适配器的 IP 单独归类,不作为“物理链路正常”的依据。
 */
export function inspectNetworkInterfaces(): LinkInterfaceSummary {
  const interfaces = networkInterfaces()
  const validInterfaces: LinkInterfaceInfo[] = []
  const apipaInterfaces: LinkInterfaceInfo[] = []

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue
    for (const addr of addresses) {
      // Node 18+ family 可能是 'IPv4' 或数字 4
      const isIpv4 = addr.family === 'IPv4' || (addr.family as unknown as number) === 4
      if (!isIpv4 || addr.internal) continue

      const isApipa = addr.address.startsWith('169.254.')
      const info: LinkInterfaceInfo = {
        name,
        address: addr.address,
        isApipa,
        isVirtual: isVirtualAdapter(name)
      }
      if (isApipa) {
        apipaInterfaces.push(info)
      } else {
        validInterfaces.push(info)
      }
    }
  }

  const physicalValidInterfaces = validInterfaces.filter((i) => isPhysicalNetworkAdapter(i.name))
  const virtualValidInterfaces = validInterfaces.filter((i) => !isPhysicalNetworkAdapter(i.name))
  const physicalApipa = apipaInterfaces.filter((i) => isPhysicalNetworkAdapter(i.name))

  return {
    hasValidIp: validInterfaces.length > 0,
    hasPhysicalValidIp: physicalValidInterfaces.length > 0,
    hasVirtualOnlyIp: physicalValidInterfaces.length === 0 && virtualValidInterfaces.length > 0,
    hasApipaOnly: physicalValidInterfaces.length === 0 && physicalApipa.length > 0,
    validInterfaces,
    apipaInterfaces,
    physicalValidInterfaces,
    virtualValidInterfaces
  }
}

export interface AdapterState {
  name: string
  enabled: boolean
  connected: boolean
  isVirtual: boolean
  interfaceDescription?: string
}

/** 解析 PowerShell Get-NetAdapter 的 JSON 输出(比 netsh 更准确,含 InterfaceDescription)。 */
export function parseWindowsNetAdapterJson(json: string): AdapterState[] {
  try {
    const parsed = JSON.parse(json.trim()) as
      | WindowsNetAdapterRecord
      | WindowsNetAdapterRecord[]
      | null

    const records = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []

    return records
      .filter((record) => record?.Name)
      .map((record) => {
        const name = String(record.Name)
        const description = String(record.InterfaceDescription ?? '')
        const adminUp = isAdminEnabled(record.AdminStatus)
        const mediaConnected = isMediaConnected(record.MediaConnectionState)
        const statusUp = isStatusUp(record.Status)

        return {
          name,
          interfaceDescription: description,
          enabled: adminUp,
          // 中文注释: MediaConnectionState 才能反映网线是否插入/Wi-Fi 是否真正连上;兼容数值 1=Connected,2=Disconnected
          connected: adminUp && mediaConnected && statusUp,
          isVirtual: !isPhysicalNetworkAdapter(name, description)
        }
      })
  } catch {
    return []
  }
}

interface WindowsNetAdapterRecord {
  Name?: string
  InterfaceDescription?: string
  Status?: string | number
  AdminStatus?: string | number
  MediaConnectionState?: string | number
}

function isAdminEnabled(value: string | number | undefined): boolean {
  return value === 'Up' || value === 1
}

function isMediaConnected(value: string | number | undefined): boolean {
  return value === 'Connected' || value === 1
}

function isStatusUp(value: string | number | undefined): boolean {
  return value === 'Up' || value === 1
}

/**
 * 解析 Windows `netsh interface show interface` 输出。
 * 关键点: 兼容中英文系统,用关键词匹配管理状态与连接状态,跳过表头与分隔线。
 */
export function parseWindowsAdapterStates(stdout: string): AdapterState[] {
  const adapters: AdapterState[] = []
  const lines = stdout.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    // 跳过表头与分隔线
    if (/Admin State|管理状态/i.test(line)) continue
    if (/^[-\s]+$/.test(line)) continue

    const columns = line.split(/\s{2,}/).filter(Boolean)
    if (columns.length < 4) continue

    const [adminState, connectState] = columns
    // 接口名可能含空格,取第 4 列及之后合并
    const name = columns.slice(3).join(' ').trim()

    const enabled = /Enabled|已启用/i.test(adminState)
    const connected = /^Connected$|已连接/i.test(connectState)

    adapters.push({
      name,
      enabled,
      connected: enabled && connected,
      isVirtual: !isPhysicalNetworkAdapter(name)
    })
  }

  return adapters
}

/**
 * 解析 macOS `ifconfig` 输出中的接口 status(active/inactive)。
 * 仅关注物理接口(en/eth 等),loopback 与虚拟接口忽略。
 */
export function parseMacAdapterStates(stdout: string): AdapterState[] {
  const adapters: AdapterState[] = []
  const blocks = stdout.split(/\n(?=\w)/)

  for (const block of blocks) {
    const nameMatch = block.match(/^(\w+):/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    if (name === 'lo0') continue

    const enabled = /flags=.*\bUP\b/i.test(block)
    const connected = /status:\s*active/i.test(block)
    // 中文注释: macOS 上 utun/bridge/awdl 等为虚拟接口,en0/en1 为物理网卡
    const isVirtualByName =
      isVirtualAdapter(name) || /^(utun|bridge|awdl|llw|ap|anpi|gif|stf)/i.test(name)
    adapters.push({
      name,
      enabled,
      connected: enabled && connected,
      isVirtual: isVirtualByName || !isPhysicalNetworkAdapter(name)
    })
  }

  return adapters
}

export interface MacWifiAssociation {
  device: string
  associated: boolean
  ssid?: string
}

/**
 * 解析 macOS `networksetup -getairportnetwork <device>` 输出。
 * 未关联热点时通常返回 "You are not associated with an AirPort network"。
 */
export function parseMacWifiAssociation(device: string, stdout: string): MacWifiAssociation {
  const text = stdout.trim()
  const associatedMatch = text.match(/Current Wi-Fi Network:\s*(.+)/i)
  if (associatedMatch) {
    return { device, associated: true, ssid: associatedMatch[1].trim() }
  }

  const notAssociated =
    /not associated|are not associated|未关联|没有关联/i.test(text) || (!text.includes('Network:') && text.length > 0 && !/error/i.test(text))

  if (notAssociated || !text) {
    return { device, associated: false }
  }

  return { device, associated: Boolean(text) && !/error/i.test(text), ssid: text }
}

/** 从适配器列表中找出 Wi-Fi 物理接口名(如 en0)。 */
export function findMacWifiDevice(adapters: AdapterState[]): string | undefined {
  const wifiAdapter = adapters.find(
    (adapter) =>
      !adapter.isVirtual && /^(en\d+|awdl0)$/i.test(adapter.name) && /wi-?fi|airport|无线/i.test(adapter.name)
  )
  if (wifiAdapter) return wifiAdapter.name

  return adapters.find((adapter) => !adapter.isVirtual && /^en\d+$/i.test(adapter.name) && adapter.enabled)?.name
}
