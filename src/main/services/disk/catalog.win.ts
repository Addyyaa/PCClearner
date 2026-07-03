import type { CleanableLocation } from '../../../../shared/types'

export const WINDOWS_CLEANABLE_LOCATIONS: CleanableLocation[] = [
  {
    id: 'win-user-temp',
    name: '用户临时文件',
    path: '%TEMP%',
    platform: 'windows',
    category: 'temp',
    requiresElevation: false,
    description: '应用运行时产生的临时文件,通常可安全清理。'
  },
  {
    id: 'win-system-temp',
    name: '系统临时文件',
    path: '%SystemRoot%\\Temp',
    platform: 'windows',
    category: 'temp',
    requiresElevation: true,
    description: 'Windows 系统组件和安装程序留下的临时文件,清理前需要确认文件未被占用。'
  },
  {
    id: 'win-update-cache',
    name: 'Windows 更新缓存',
    path: '%SystemRoot%\\SoftwareDistribution\\Download',
    platform: 'windows',
    category: 'update',
    requiresElevation: true,
    description: 'Windows 更新下载缓存,更新完成后通常可以释放较大空间。'
  },
  {
    id: 'win-prefetch',
    name: '预读取缓存',
    path: '%SystemRoot%\\Prefetch',
    platform: 'windows',
    category: 'cache',
    requiresElevation: true,
    description: 'Windows 用于加速程序启动的缓存,清理后可能短期影响启动速度。'
  },
  {
    id: 'win-thumbnail-cache',
    name: '缩略图缓存',
    path: '%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer',
    platform: 'windows',
    category: 'thumbnail',
    requiresElevation: false,
    description: '图片和视频预览缩略图缓存,删除后系统会按需重新生成。'
  },
  {
    id: 'win-chrome-cache',
    name: 'Chrome 应用缓存',
    path: '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache',
    platform: 'windows',
    category: 'browser',
    requiresElevation: false,
    description: 'Chrome 浏览器缓存和网页资源缓存,删除后网页会按需重新下载。'
  },
  {
    id: 'win-edge-cache',
    name: 'Edge 应用缓存',
    path: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Cache',
    platform: 'windows',
    category: 'browser',
    requiresElevation: false,
    description: 'Microsoft Edge 浏览器缓存,清理后不影响收藏夹和登录状态。'
  },
  {
    id: 'win-teams-cache',
    name: 'Teams 应用缓存',
    path: '%APPDATA%\\Microsoft\\Teams',
    platform: 'windows',
    category: 'cache',
    requiresElevation: false,
    description: 'Teams 聊天和界面缓存,异常膨胀时可清理,再次打开会重新生成。'
  },
  {
    id: 'win-discord-cache',
    name: 'Discord 应用缓存',
    path: '%APPDATA%\\discord\\Cache',
    platform: 'windows',
    category: 'cache',
    requiresElevation: false,
    description: 'Discord 客户端缓存文件,清理后应用会重新下载必要资源。'
  },
  {
    id: 'win-npm-cache',
    name: 'npm 开发缓存',
    path: '%LOCALAPPDATA%\\npm-cache',
    platform: 'windows',
    category: 'cache',
    requiresElevation: false,
    description: 'Node.js npm 包缓存,会占用较多空间,后续安装依赖时可重新下载。'
  },
  {
    id: 'win-crash-dumps',
    name: '应用崩溃转储',
    path: '%LOCALAPPDATA%\\CrashDumps',
    platform: 'windows',
    category: 'log',
    requiresElevation: false,
    description: '应用崩溃生成的 dump 文件,仅调试问题时需要保留。'
  },
  {
    id: 'win-localappdata-junk',
    name: '第三方应用缓存(LocalAppData)',
    path: '%LOCALAPPDATA%',
    platform: 'windows',
    category: 'cache',
    requiresElevation: false,
    scanMode: 'junkHeuristic',
    description: '深度扫描已安装应用在 LocalAppData 下产生的缓存、日志和崩溃转储,只清理垃圾而不影响程序本身。'
  },
  {
    id: 'win-roamingappdata-junk',
    name: '第三方应用缓存(RoamingAppData)',
    path: '%APPDATA%',
    platform: 'windows',
    category: 'cache',
    requiresElevation: false,
    scanMode: 'junkHeuristic',
    description: '深度扫描已安装应用在 Roaming 下产生的缓存和日志垃圾,保留配置文件本身。'
  },
  {
    id: 'win-programdata-junk',
    name: '第三方应用缓存(ProgramData)',
    path: '%ProgramData%',
    platform: 'windows',
    category: 'cache',
    requiresElevation: false,
    scanMode: 'junkHeuristic',
    description: '深度扫描 ProgramData 下各应用的缓存与日志垃圾,不触碰系统关键数据。'
  }
]
