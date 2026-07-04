import { describe, expect, it } from 'vitest'
import {
  isPhysicalNetworkAdapter,
  isVirtualAdapter,
  parseMacAdapterStates,
  parseMacWifiAssociation,
  parseWindowsAdapterStates,
  parseWindowsNetAdapterJson
} from './link-checker'

describe('isVirtualAdapter', () => {
  it('识别常见虚拟/隧道适配器', () => {
    const virtualNames = [
      'vEthernet (WSL (Hyper-V firewall))',
      'ProtonVPN WireGuard Tunnel',
      'LetsTAP',
      'TAP-Windows Adapter V9',
      'xray_tun',
      'Wintun Userspace Tunnel',
      '本地连接 2 Wintun Userspace Tunnel #2',
      '蓝牙网络连接',
      'Bluetooth Device (Personal Area Network)',
      'VMware Network Adapter VMnet8',
      'VirtualBox Host-Only Network',
      'Tailscale',
      'ZeroTier One',
      'utun3'
    ]
    for (const name of virtualNames) {
      expect(isVirtualAdapter(name), name).toBe(true)
    }
  })

  it('物理网卡不会被误判为虚拟', () => {
    const physicalNames = ['以太网', 'WLAN', 'Wi-Fi', 'Ethernet', 'en0']
    for (const name of physicalNames) {
      expect(isVirtualAdapter(name), name).toBe(false)
      expect(isPhysicalNetworkAdapter(name, 'Intel(R) Wi-Fi 6E AX210 160MHz'), name).toBe(true)
    }
  })

  it('Wintun/本地连接 等隧道适配器识别为虚拟', () => {
    expect(isPhysicalNetworkAdapter('本地连接', 'Wintun Userspace Tunnel')).toBe(false)
    expect(isVirtualAdapter('本地连接', 'Wintun Userspace Tunnel')).toBe(true)
  })
})

describe('parseWindowsAdapterStates', () => {
  it('解析英文系统的接口状态并标记虚拟适配器', () => {
    const stdout = [
      'Admin State    State          Type             Interface Name',
      '-------------------------------------------------------------------------',
      'Enabled        Connected      Dedicated        以太网',
      'Disabled       Disconnected   Dedicated        WLAN',
      'Enabled        Connected      Dedicated        vEthernet (WSL)'
    ].join('\n')

    const adapters = parseWindowsAdapterStates(stdout)

    expect(adapters).toHaveLength(3)
    expect(adapters[0]).toEqual({ name: '以太网', enabled: true, connected: true, isVirtual: false })
    expect(adapters[1]).toEqual({ name: 'WLAN', enabled: false, connected: false, isVirtual: false })
    expect(adapters[2].isVirtual).toBe(true)
  })

  it('解析中文系统的接口状态', () => {
    const stdout = [
      '管理状态       状态           类型             接口名称',
      '-------------------------------------------------------------------------',
      '已禁用         已断开连接     专用             无线网络连接'
    ].join('\n')

    const adapters = parseWindowsAdapterStates(stdout)

    expect(adapters).toHaveLength(1)
    expect(adapters[0].enabled).toBe(false)
    expect(adapters[0].connected).toBe(false)
    expect(adapters[0].name).toBe('无线网络连接')
    expect(adapters[0].isVirtual).toBe(false)
  })

  it('已断开连接 不会被误判为 已连接', () => {
    const stdout = [
      '管理状态       状态           类型             接口名称',
      '-------------------------------------------------------------------------',
      '已启用         已断开连接     专用             以太网'
    ].join('\n')

    const adapters = parseWindowsAdapterStates(stdout)
    expect(adapters[0].enabled).toBe(true)
    expect(adapters[0].connected).toBe(false)
  })
})

describe('parseWindowsNetAdapterJson', () => {
  it('解析数值型 MediaConnectionState,并区分物理/虚拟适配器', () => {
    const json = JSON.stringify([
      {
        Name: 'WLAN',
        InterfaceDescription: 'Intel(R) Wi-Fi 6E AX210 160MHz',
        Status: 'Up',
        AdminStatus: 2,
        MediaConnectionState: 2
      },
      {
        Name: '以太网',
        InterfaceDescription: 'Realtek Gaming 2.5GbE Family Controller',
        Status: 'Disconnected',
        AdminStatus: 1,
        MediaConnectionState: 2
      },
      {
        Name: 'ProtonVPN',
        InterfaceDescription: 'WireGuard Tunnel',
        Status: 'Up',
        AdminStatus: 1,
        MediaConnectionState: 1
      },
      {
        Name: 'xray_tun',
        InterfaceDescription: 'Xray Tunnel',
        Status: 'Up',
        AdminStatus: 1,
        MediaConnectionState: 1
      }
    ])

    const adapters = parseWindowsNetAdapterJson(json)
    const wlan = adapters.find((a) => a.name === 'WLAN')
    const ethernet = adapters.find((a) => a.name === '以太网')
    const proton = adapters.find((a) => a.name === 'ProtonVPN')

    expect(wlan?.isVirtual).toBe(false)
    expect(wlan?.enabled).toBe(false)
    expect(wlan?.connected).toBe(false)

    expect(ethernet?.isVirtual).toBe(false)
    expect(ethernet?.enabled).toBe(true)
    expect(ethernet?.connected).toBe(false)

    expect(proton?.isVirtual).toBe(true)

    const connectedPhysical = adapters.filter((a) => !a.isVirtual && a.enabled && a.connected)
    expect(connectedPhysical).toHaveLength(0)
  })
})

describe('parseMacAdapterStates', () => {
  it('识别 active 与 inactive 接口并标记虚拟接口', () => {
    const stdout = [
      'lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384',
      'en0: flags=8863<UP,BROADCAST,SMART,RUNNING,MULTICAST> mtu 1500',
      '\tstatus: active',
      'en1: flags=8863<BROADCAST,SMART,MULTICAST> mtu 1500',
      '\tstatus: inactive',
      'utun3: flags=8051<UP,POINTOPOINT,RUNNING,MULTICAST> mtu 1400'
    ].join('\n')

    const adapters = parseMacAdapterStates(stdout)
    const en0 = adapters.find((a) => a.name === 'en0')
    const en1 = adapters.find((a) => a.name === 'en1')
    const utun3 = adapters.find((a) => a.name === 'utun3')

    expect(adapters.some((a) => a.name === 'lo0')).toBe(false)
    expect(en0?.connected).toBe(true)
    expect(en0?.isVirtual).toBe(false)
    expect(en1?.connected).toBe(false)
    expect(en1?.enabled).toBe(false)
    expect(utun3?.isVirtual).toBe(true)
  })
})

describe('parseMacWifiAssociation', () => {
  it('识别已关联的 Wi-Fi 热点', () => {
    const stdout = 'Current Wi-Fi Network: MyHomeWiFi'
    expect(parseMacWifiAssociation('en0', stdout)).toEqual({
      device: 'en0',
      associated: true,
      ssid: 'MyHomeWiFi'
    })
  })

  it('识别未关联 Wi-Fi 的状态', () => {
    const stdout = 'You are not associated with an AirPort network.'
    expect(parseMacWifiAssociation('en0', stdout)).toEqual({
      device: 'en0',
      associated: false
    })
  })
})
