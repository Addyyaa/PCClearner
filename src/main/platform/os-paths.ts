import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformService } from './platform-service'

export class OsPaths {
  constructor(private readonly platform: PlatformService) {}

  getHomeDirectory(): string {
    return homedir()
  }

  getTempDirectory(): string {
    return tmpdir()
  }

  getSystemDiskHint(): string {
    if (this.platform.isWindows()) {
      return process.env.SystemDrive ?? 'C:'
    }

    return '/'
  }

  getAppDataDirectory(): string {
    if (this.platform.isWindows()) {
      return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    }

    return join(homedir(), 'Library', 'Application Support')
  }
}
