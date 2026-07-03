import { describe, expect, it } from 'vitest'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { DiskUsageService } from './disk-usage-service'

describe('DiskUsageService', () => {
  it('累加选中文件的预计可释放空间', () => {
    const service = new DiskUsageService(new PlatformService(), new CommandRunner())

    expect(service.estimateReclaimableBytes([1, 2, 3])).toBe(6)
  })
})
