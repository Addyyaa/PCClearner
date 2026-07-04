/**
 * 解析 macOS 默认路由对应的网络服务名称。
 * 三级回退: 默认路由 interface → networkserviceorder 映射 → Wi-Fi 或列表首项。
 */

/** 从 `route -n get default` 输出中提取 interface 名(如 en0)。 */
export function parseMacDefaultRouteInterface(routeStdout: string): string | undefined {
  const match = routeStdout.match(/interface:\s*(\S+)/i)
  return match?.[1]
}

/** 从 `networksetup -listnetworkserviceorder` 输出中,将 hardware port/device 映射到 service 名。 */
export function parseMacNetworkServiceOrder(orderStdout: string): Map<string, string> {
  const mapping = new Map<string, string>()
  const lines = orderStdout.split('\n')
  let currentService: string | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const serviceLine = line.match(/^\(\d+\)\s*(.+)$/)
    if (serviceLine) {
      currentService = serviceLine[1].trim()
      continue
    }

    const deviceMatch = line.match(/Device:\s*([^,\s)]+)/i)
    if (deviceMatch && currentService) {
      mapping.set(deviceMatch[1], currentService)
    }
  }

  return mapping
}

/** 从 `networksetup -listallnetworkservices` 输出中提取可用服务名列表。 */
export function parseMacNetworkServiceList(listStdout: string): string[] {
  return listStdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*') && !/An asterisk/i.test(line))
}

/**
 * 根据 route/order/list 三段命令输出,解析当前主用网络服务名。
 */
export function resolveMacPrimaryService(
  routeStdout: string,
  orderStdout: string,
  listStdout: string
): string {
  const services = parseMacNetworkServiceList(listStdout)
  const defaultInterface = parseMacDefaultRouteInterface(routeStdout)

  if (defaultInterface) {
    const orderMap = parseMacNetworkServiceOrder(orderStdout)
    const fromOrder = orderMap.get(defaultInterface)
    if (fromOrder) return fromOrder

    const fromDevice = [...orderMap.entries()].find(([key]) => key.toLowerCase() === defaultInterface.toLowerCase())
    if (fromDevice) return fromDevice[1]
  }

  const wifiService = services.find((name) => /wi-?fi|airport|无线/i.test(name))
  if (wifiService) return wifiService

  return services[0] ?? 'Wi-Fi'
}
