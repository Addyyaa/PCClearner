export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class Logger {
  constructor(private readonly scope: string) {}

  info(message: string, meta?: unknown): void {
    this.write('info', message, meta)
  }

  warn(message: string, meta?: unknown): void {
    this.write('warn', message, meta)
  }

  error(message: string, meta?: unknown): void {
    this.write('error', message, meta)
  }

  debug(message: string, meta?: unknown): void {
    this.write('debug', message, meta)
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    // 中文注释: 后续接入文件日志/系统日志时,这里统一做脱敏和生产环境降噪。
    const payload = meta === undefined ? '' : ` ${JSON.stringify(meta)}`
    console[level](`[${this.scope}] ${message}${payload}`)
  }
}
