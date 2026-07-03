import type { NetworkFixAction, NetworkLayer } from '../../../../shared/types'
import { FIX_TARGET_LAYERS } from '../../../../shared/network/fix-layer-map'

/**
 * 网络修复动作统一目录。
 *
 * 关键设计:
 * - 修复动作在此集中定义,规则引擎(推荐修复)和修复服务(执行)都引用同一份数据,避免 id 与文案不一致。
 * - `targetLayers` 来自 shared/network/fix-layer-map.ts,渲染层与主进程共用同一映射。
 * - `platform` 用于过滤当前系统可执行的动作,渲染层的"修复工具箱"只展示可用项。
 */
export interface NetworkFixDefinition extends NetworkFixAction {
  targetLayers: NetworkLayer[]
}

function withLayers(definition: Omit<NetworkFixDefinition, 'targetLayers'>): NetworkFixDefinition {
  return {
    ...definition,
    targetLayers: FIX_TARGET_LAYERS[definition.id] ?? []
  }
}

export const NETWORK_FIX_DEFINITIONS: NetworkFixDefinition[] = [
  withLayers({
    id: 'enable-adapter',
    title: '启用网络适配器',
    description: '启用被禁用的有线/无线网络适配器,用于解决适配器被关闭导致的完全无网络。执行后请确认已连接 Wi-Fi 或插入网线。',
    requiresElevation: true,
    reversible: true,
    platform: 'all'
  }),
  withLayers({
    id: 'flush-dns',
    title: '刷新 DNS 缓存',
    description: '清理本机 DNS 缓存,用于解决解析污染、陈旧记录或 DNS 缓存异常。',
    requiresElevation: false,
    reversible: false,
    platform: 'all'
  }),
  withLayers({
    id: 'set-public-dns',
    title: '切换到公共 DNS',
    description: '将当前网络的 DNS 切换为公共 DNS(如 1.1.1.1 / 223.5.5.5),用于解决 DNS 劫持、污染或本地 DNS 不可用。',
    requiresElevation: true,
    reversible: true,
    platform: 'all'
  }),
  withLayers({
    id: 'renew-ip',
    title: '释放并重新获取 IP(自动获取)',
    description:
      '将网卡切换为“自动获取 IP 和 DNS(DHCP)”,并重新向路由器申请地址,用于解决静态 IP 配错、地址冲突、APIPA(169.254)或网关不可达。注意:会覆盖手动设置的静态 IP。',
    requiresElevation: true,
    reversible: false,
    platform: 'all'
  }),
  withLayers({
    id: 'reset-winsock',
    title: '重置 Socket/Winsock',
    description: '重置网络套接字目录,用于处理 socket 资源不足或 Winsock 损坏(仅 Windows)。',
    requiresElevation: true,
    reversible: false,
    platform: 'windows'
  }),
  withLayers({
    id: 'reset-dynamic-ports',
    title: '重置 TCP 动态端口范围',
    description:
      '将 IPv4/IPv6 的 TCP 临时端口池恢复为系统默认值(1024 起共 13977 个),用于解决临时端口耗尽导致无法新建连接的问题。若本机有测试脚本占用端口,请先停止后再执行。',
    requiresElevation: true,
    reversible: false,
    platform: 'windows'
  }),
  withLayers({
    id: 'reset-tcpip',
    title: '重置 TCP/IP 协议栈',
    description: '重置 TCP/IP 协议栈到初始状态,用于修复协议栈损坏导致的连通性异常,通常需要重启生效。',
    requiresElevation: true,
    reversible: false,
    platform: 'windows'
  })
]

/** 转换为对外暴露的 NetworkFixAction(去除内部字段)。 */
export function toFixAction(definition: NetworkFixDefinition): NetworkFixAction {
  const { targetLayers: _targetLayers, ...action } = definition
  return action
}

/** 按 id 查找修复动作定义。 */
export function findFixDefinition(id: string): NetworkFixDefinition | undefined {
  return NETWORK_FIX_DEFINITIONS.find((definition) => definition.id === id)
}
