import type { RegistryIssue } from '../../../../shared/types'

/** 禁止清理的系统关键注册表路径前缀 */
const PROTECTED_KEY_PREFIXES = [
  'SYSTEM\\',
  'SAM\\',
  'SECURITY\\',
  'SOFTWARE\\Microsoft\\Windows NT\\',
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\',
  'SOFTWARE\\Classes\\CLSID\\{00021401-0000-0000-C000-000000000046}\\'
]

const PROTECTED_VALUE_NAMES = new Set(['Windows Defender', 'SecurityHealth', 'OneDrive', 'ctfmon'])

/**
 * 判断注册表项是否位于白名单保护范围内。
 */
export function isProtectedRegistryPath(keyPath: string, valueName?: string): boolean {
  const normalized = keyPath.replace(/\//g, '\\').toUpperCase()

  if (PROTECTED_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix.toUpperCase()))) {
    return true
  }

  if (valueName && PROTECTED_VALUE_NAMES.has(valueName)) {
    return true
  }

  return false
}

/**
 * 从注册表命令字符串中提取可执行文件路径。
 */
export function extractExecutablePath(command: string): string | undefined {
  const trimmed = command.trim()
  const quoted = trimmed.match(/^"([^"]+)"/)

  if (quoted) {
    return quoted[1]
  }

  const unquoted = trimmed.split(/\s+/)[0]
  return unquoted.includes('\\') || unquoted.includes('/') ? unquoted : undefined
}

/**
 * 过滤掉受保护或无效的注册表问题项。
 */
export function filterSafeRegistryIssues(issues: RegistryIssue[]): RegistryIssue[] {
  return issues.filter((issue) => !isProtectedRegistryPath(issue.keyPath, issue.valueName))
}
