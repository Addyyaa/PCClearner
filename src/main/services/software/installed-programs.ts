import type { CommandRunner } from '../../platform/command-runner'

export interface RawInstalledProgram {
  name: string
  publisher?: string
  installLocation?: string
  estimatedSizeBytes?: number
}

interface RawRegistryRow {
  DisplayName?: string
  Publisher?: string
  InstallLocation?: string
  EstimatedSize?: number
}

const REGISTRY_QUERY_SCRIPT =
  '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); ' +
  "$paths=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
  "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
  "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); " +
  'Get-ItemProperty $paths -ErrorAction SilentlyContinue | ' +
  'Where-Object { $_.DisplayName } | ' +
  'Select-Object DisplayName, Publisher, InstallLocation, EstimatedSize | ' +
  'ConvertTo-Json -Compress'

/**
 * 从 Windows 卸载注册表读取已安装程序清单（HKLM 64/32 位 + HKCU）。
 * 结果用于卸载残留比对和软件迁移候选列表。
 */
export async function readInstalledPrograms(commandRunner: CommandRunner): Promise<RawInstalledProgram[]> {
  const result = await commandRunner
    .run('powershell', ['-NoProfile', '-Command', REGISTRY_QUERY_SCRIPT], 60_000)
    .catch(() => ({ stdout: '', stderr: '' }))

  if (!result.stdout.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(result.stdout) as RawRegistryRow[] | RawRegistryRow
    const rows = Array.isArray(parsed) ? parsed : [parsed]

    return rows
      .filter((row) => row.DisplayName)
      .map((row) => ({
        name: (row.DisplayName ?? '').trim(),
        publisher: row.Publisher?.trim() || undefined,
        installLocation: row.InstallLocation?.trim().replace(/[\\/]+$/, '') || undefined,
        estimatedSizeBytes: typeof row.EstimatedSize === 'number' ? row.EstimatedSize * 1024 : undefined
      }))
  } catch {
    return []
  }
}

/** 归一化名称：转小写、去空格和常见版本/标点，便于模糊匹配目录名。 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\d+(\.\d+)*/g, '')
    .replace(/[^a-z\u4e00-\u9fa5]/g, '')
    .trim()
}
