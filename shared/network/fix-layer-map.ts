import type { NetworkFixAction, NetworkLayer } from '../types'

/**
 * 修复动作与网络层的对应关系(单一数据源)。
 * 主进程规则引擎与渲染层“检测项旁修复按钮”均引用此映射,避免不一致。
 */
export const FIX_TARGET_LAYERS: Record<string, NetworkLayer[]> = {
  'enable-adapter': ['link'],
  'flush-dns': ['dns'],
  'set-public-dns': ['dns', 'external'],
  'renew-ip': ['network', 'link'],
  'reset-winsock': ['transport'],
  'reset-dynamic-ports': ['transport'],
  'reset-tcpip': ['network', 'transport', 'application']
}

/** 获取某一网络层可用的修复动作 id 列表。 */
export function getFixIdsForLayer(layer: NetworkLayer): string[] {
  return Object.entries(FIX_TARGET_LAYERS)
    .filter(([, layers]) => layers.includes(layer))
    .map(([id]) => id)
}

/** 从可用修复列表中筛选出适用于指定网络层的动作。 */
export function pickFixesForLayer(layer: NetworkLayer, fixes: NetworkFixAction[]): NetworkFixAction[] {
  const ids = new Set(getFixIdsForLayer(layer))
  return fixes.filter((fix) => ids.has(fix.id))
}

/** 判断修复动作是否适用于指定网络层。 */
export function isFixForLayer(fixId: string, layer: NetworkLayer): boolean {
  return FIX_TARGET_LAYERS[fixId]?.includes(layer) ?? false
}
