import sudoPrompt from '@vscode/sudo-prompt'

export interface ElevatedCommand {
  command: string
  name: string
}

export class PrivilegeService {
  runElevated({ command, name }: ElevatedCommand): Promise<string> {
    // 中文注释: 提权仅用于注册表、服务、winsock 等危险操作,调用前必须完成二次确认。
    return new Promise((resolve, reject) => {
      sudoPrompt.exec(command, { name }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }

        resolve(`${stdout ?? ''}${stderr ?? ''}`)
      })
    })
  }
}
