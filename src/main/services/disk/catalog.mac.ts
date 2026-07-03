import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CleanableLocation } from '../../../../shared/types'

export const MAC_CLEANABLE_LOCATIONS: CleanableLocation[] = [
  {
    id: 'mac-user-cache',
    name: '用户缓存',
    path: join(homedir(), 'Library', 'Caches'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    description: 'Mac 应用缓存目录,通常可以清理,应用会在需要时重建。'
  },
  {
    id: 'mac-user-logs',
    name: '用户日志',
    path: join(homedir(), 'Library', 'Logs'),
    platform: 'macos',
    category: 'log',
    requiresElevation: false,
    description: '应用运行日志,排障结束后可清理较旧日志。'
  },
  {
    id: 'mac-var-folders',
    name: '系统临时缓存',
    path: '/private/var/folders',
    platform: 'macos',
    category: 'temp',
    requiresElevation: true,
    description: 'macOS 临时文件区域,必须避开正在使用的系统项目。'
  }
]
