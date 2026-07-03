/**
 * 将 Windows 环境变量占位符（如 %TEMP%）解析为实际路径。
 */
export function resolveEnvironmentPath(input: string): string {
  return input.replace(/%([^%]+)%/g, (_, key: string) => process.env[key] ?? `%${key}%`)
}
