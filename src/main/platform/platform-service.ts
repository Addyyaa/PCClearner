import { platform } from 'node:os'
import type { PlatformName } from '../../../shared/types'

export class PlatformService {
  getPlatform(): PlatformName {
    const current = platform()

    if (current === 'win32') return 'windows'
    if (current === 'darwin') return 'macos'
    if (current === 'linux') return 'linux'

    return 'unknown'
  }

  isWindows(): boolean {
    return this.getPlatform() === 'windows'
  }

  isMacOS(): boolean {
    return this.getPlatform() === 'macos'
  }

  assertSupportedFeature(featureName: string, supported: boolean): void {
    if (!supported) {
      throw new Error(`${featureName} 当前平台暂不支持`)
    }
  }
}
