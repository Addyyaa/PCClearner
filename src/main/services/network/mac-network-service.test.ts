import { describe, expect, it } from 'vitest'
import {
  parseMacDefaultRouteInterface,
  parseMacNetworkServiceList,
  parseMacNetworkServiceOrder,
  resolveMacPrimaryService
} from './mac-network-service'

describe('parseMacDefaultRouteInterface', () => {
  it('解析默认路由 interface', () => {
    const stdout = ['route to: default', '  interface: en0', '  gateway: 192.168.1.1'].join('\n')
    expect(parseMacDefaultRouteInterface(stdout)).toBe('en0')
  })
})

describe('parseMacNetworkServiceOrder', () => {
  it('将 device 映射到 network service 名', () => {
    const stdout = [
      '(1) Wi-Fi',
      '(Hardware Port: Wi-Fi, Device: en0)',
      '(2) Thunderbolt Bridge',
      '(Hardware Port: Thunderbolt Bridge, Device: bridge0)'
    ].join('\n')

    const mapping = parseMacNetworkServiceOrder(stdout)
    expect(mapping.get('en0')).toBe('Wi-Fi')
    expect(mapping.get('bridge0')).toBe('Thunderbolt Bridge')
  })
})

describe('resolveMacPrimaryService', () => {
  it('优先使用默认路由 interface 对应的 service', () => {
    const routeStdout = 'interface: en0'
    const orderStdout = '(1) Wi-Fi\n(Hardware Port: Wi-Fi, Device: en0)'
    const listStdout = 'An asterisk (*) denotes that a network service is disabled.\nWi-Fi\nEthernet'

    expect(resolveMacPrimaryService(routeStdout, orderStdout, listStdout)).toBe('Wi-Fi')
  })

  it('无默认路由时回退到 Wi-Fi service', () => {
    const listStdout = 'Thunderbolt Bridge\nWi-Fi'
    expect(resolveMacPrimaryService('', '', listStdout)).toBe('Wi-Fi')
  })

  it('最终回退到列表首项', () => {
    const listStdout = 'Thunderbolt Bridge\nUSB 10/100/1000 LAN'
    expect(resolveMacPrimaryService('', '', listStdout)).toBe('Thunderbolt Bridge')
  })
})

describe('parseMacNetworkServiceList', () => {
  it('过滤禁用说明与星号标记行', () => {
    const stdout = ['An asterisk (*) denotes that a network service is disabled.', '* Disabled Service', 'Wi-Fi'].join('\n')
    expect(parseMacNetworkServiceList(stdout)).toEqual(['Wi-Fi'])
  })
})
