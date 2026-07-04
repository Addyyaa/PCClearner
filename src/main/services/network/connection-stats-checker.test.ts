import { describe, expect, it } from 'vitest'
import { parseMacLsofConnections, parseWindowsNetstatConnections } from './connection-stats-checker'

describe('parseMacLsofConnections', () => {
  it('按进程名聚合 ESTABLISHED 连接数', () => {
    const stdout = [
      'Google  12345 user   42u  IPv4 0xabc      0t0  TCP 192.168.1.2:50100->1.1.1.1:443 (ESTABLISHED)',
      'Google  12345 user   43u  IPv4 0xdef      0t0  TCP 192.168.1.2:50101->1.1.1.1:443 (ESTABLISHED)',
      'node    67890 user   12u  IPv4 0x123      0t0  TCP 127.0.0.1:3000->127.0.0.1:50102 (ESTABLISHED)'
    ].join('\n')

    const stats = parseMacLsofConnections(stdout)
    expect(stats[0]).toEqual({ processName: 'Google', pid: 12345, connectionCount: 2 })
    expect(stats[1]).toEqual({ processName: 'node', pid: 67890, connectionCount: 1 })
  })
})

describe('parseWindowsNetstatConnections', () => {
  it('结合 netstat 与 tasklist 聚合连接数', () => {
    const netstat = [
      'TCP    127.0.0.1:9999    127.0.0.1:50100    ESTABLISHED    4321',
      'TCP    127.0.0.1:9999    127.0.0.1:50101    ESTABLISHED    4321'
    ].join('\n')
    const tasklist = '"badapp.exe","4321","Console","1","12,345 K"'

    const stats = parseWindowsNetstatConnections(netstat, tasklist)
    expect(stats[0]).toEqual({ pid: 4321, processName: 'badapp.exe', connectionCount: 2 })
  })
})
