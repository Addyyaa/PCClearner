import { describe, expect, it } from 'vitest'
import {
  buildStopSocketLeakFix,
  collectSocketLeakSuspects,
  extractProcessNameFromEventMessage,
  isSocketExhaustionMessage,
  parseProcessConnectionStats,
  parseSocketErrorDetails,
  parseWinEventJson
} from './socket-event-checker'

const SAMPLE_LEAK_APP = 'LeakApp.exe'

describe('socket-event-checker', () => {
  it('识别 Socket 10055 错误消息', () => {
    const message =
      "Windows-Socket-Fehler: 由于系统缓冲区空间不足或队列已满，不能执行套接字上的操作。 (10055), auf API 'connect'"
    expect(isSocketExhaustionMessage(message)).toBe(true)
    expect(parseSocketErrorDetails(message)).toEqual({ errorCode: '10055', api: 'connect' })
  })

  it('从事件标题格式动态提取任意进程名', () => {
    const message = `事件 0, ${SAMPLE_LEAK_APP}\nWindows-Socket-Fehler: (10055), auf API connect`
    expect(extractProcessNameFromEventMessage(message)).toBe(SAMPLE_LEAK_APP)
  })

  it('从 ProviderName 提取无 .exe 后缀的应用名', () => {
    expect(extractProcessNameFromEventMessage('Socket error 10055', 'CustomNetworkAgent')).toBe('CustomNetworkAgent.exe')
  })

  it('解析 Get-WinEvent JSON 并生成 Socket 错误记录', () => {
    const stdout = JSON.stringify([
      {
        TimeCreated: '2026-07-04T10:00:00',
        ProviderName: SAMPLE_LEAK_APP,
        Id: 0,
        Message:
          "Windows-Socket-Fehler: 由于系统缓冲区空间不足或队列已满，不能执行套接字上的操作。 (10055), auf API 'connect'"
      }
    ])

    const events = parseWinEventJson(stdout)
    expect(events).toHaveLength(1)
    expect(events[0].processName).toBe(SAMPLE_LEAK_APP)
    expect(events[0].errorCode).toBe('10055')
    expect(events[0].api).toBe('connect')
  })

  it('统计高连接进程', () => {
    const netstatLines = Array.from({ length: 60 }, () => 'TCP    0.0.0.0:443    0.0.0.0:0    ESTABLISHED    1234')
    const netstat = netstatLines.join('\n')
    const tasklist = `"${SAMPLE_LEAK_APP}","1234","Services","0","12,000 K"`

    const stats = parseProcessConnectionStats(netstat, tasklist)
    expect(stats[0].processName).toBe(SAMPLE_LEAK_APP)
    expect(stats[0].connectionCount).toBe(60)
  })

  it('收集多个去重嫌疑进程', () => {
    const suspects = collectSocketLeakSuspects({
      socketEvents: [
        { processName: 'AppA.exe', errorCode: '10055', timeCreated: '', message: '' },
        { processName: 'AppB.exe', errorCode: '10055', timeCreated: '', message: '' },
        { processName: 'AppA.exe', errorCode: '10055', timeCreated: '', message: '' }
      ],
      heavyConnectors: [{ pid: 1, processName: 'AppC.exe', connectionCount: 999 }]
    })

    expect(suspects).toEqual(['AppA.exe', 'AppB.exe', 'AppC.exe'])
  })

  it('生成带动态 target 的终止进程修复动作', () => {
    const fix = buildStopSocketLeakFix(SAMPLE_LEAK_APP, 'event-log')
    expect(fix.id).toBe('stop-socket-leak-process')
    expect(fix.target).toBe(SAMPLE_LEAK_APP)
    expect(fix.title).toContain(SAMPLE_LEAK_APP)
    expect(fix.description).toContain('事件日志')
  })
})
