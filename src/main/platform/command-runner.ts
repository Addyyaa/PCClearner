import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface CommandResult {
  stdout: string
  stderr: string
}

export class CommandRunner {
  async run(command: string, args: string[] = [], timeoutMs = 30_000): Promise<CommandResult> {
    // 中文注释: 所有系统命令必须通过参数数组传入,避免拼接字符串导致命令注入。
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10
    })

    return {
      stdout: result.stdout,
      stderr: result.stderr
    }
  }
}
