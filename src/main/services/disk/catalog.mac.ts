import { homedir, tmpdir } from 'node:os'
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
    description: 'macOS 临时文件区域,清理时需管理员授权,必须避开正在使用的系统项目。'
  },
  {
    id: 'mac-user-tmp',
    name: '用户临时目录',
    path: tmpdir(),
    platform: 'macos',
    category: 'temp',
    requiresElevation: false,
    description: '当前用户会话的临时文件,通常可安全清理。'
  },
  {
    id: 'mac-chrome-cache',
    name: 'Chrome 缓存',
    path: join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cache'),
    platform: 'macos',
    category: 'browser',
    requiresElevation: false,
    description: 'Chrome 浏览器缓存,请先关闭 Chrome 再清理,网页会按需重新下载。'
  },
  {
    id: 'mac-safari-cache',
    name: 'Safari 缓存',
    path: join(homedir(), 'Library', 'Caches', 'com.apple.Safari'),
    platform: 'macos',
    category: 'browser',
    requiresElevation: false,
    description: 'Safari 浏览器缓存,请先关闭 Safari 再清理,不影响收藏夹和登录状态。'
  },
  {
    id: 'mac-edge-cache',
    name: 'Edge 缓存',
    path: join(homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Cache'),
    platform: 'macos',
    category: 'browser',
    requiresElevation: false,
    description: 'Microsoft Edge 浏览器缓存,请先关闭 Edge 再清理,不影响收藏夹和登录状态。'
  },
  {
    id: 'mac-npm-cache',
    name: 'npm 缓存',
    path: join(homedir(), '.npm'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    description: 'Node.js npm 包缓存,会占用较多空间,后续安装依赖时可重新下载。'
  },
  {
    id: 'mac-homebrew-cache',
    name: 'Homebrew 缓存',
    path: join(homedir(), 'Library', 'Caches', 'Homebrew'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    description: 'Homebrew 下载缓存,清理后再次 brew install 会重新下载。'
  },
  {
    id: 'mac-xcode-derived',
    name: 'Xcode DerivedData',
    path: join(homedir(), 'Library', 'Developer', 'Xcode', 'DerivedData'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    description: 'Xcode 编译中间产物,清理后下次编译会变慢,但可释放大量空间。'
  },
  {
    id: 'mac-appsupport-junk',
    name: '第三方应用缓存(Application Support)',
    path: join(homedir(), 'Library', 'Application Support'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    scanMode: 'junkHeuristic',
    description: '深度扫描 Application Support 下各应用的缓存、日志和临时垃圾,保留配置文件本身。'
  },
  {
    id: 'mac-containers-junk',
    name: '沙盒应用缓存(Containers)',
    path: join(homedir(), 'Library', 'Containers'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    scanMode: 'junkHeuristic',
    heuristicMaxDepth: 5,
    description: '深度扫描沙盒应用 Containers 内的 Caches 等垃圾目录,不触碰用户数据。'
  },
  {
    id: 'mac-coresimulator-cache',
    name: 'iOS 模拟器缓存',
    path: join(homedir(), 'Library', 'Developer', 'CoreSimulator', 'Caches'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    description: 'Xcode iOS 模拟器缓存,清理后模拟器会按需重建。'
  },
  {
    id: 'mac-pip-cache',
    name: 'pip 缓存',
    path: join(homedir(), 'Library', 'Caches', 'pip'),
    platform: 'macos',
    category: 'cache',
    requiresElevation: false,
    description: 'Python pip 包缓存,清理后再次 pip install 会重新下载。'
  },
  {
    id: 'mac-trash',
    name: '废纸篓',
    path: join(homedir(), '.Trash'),
    platform: 'macos',
    category: 'recycleBin',
    requiresElevation: false,
    description: '用户废纸篓中的已删除文件,清空后无法从回收站恢复。'
  }
]
