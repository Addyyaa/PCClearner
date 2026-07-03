import { basename } from 'node:path'
import type {
  FileSignatureResult,
  SignatureQuarantineRequest,
  SignatureQuarantineResult,
  SignatureStatus,
  SignatureVerifyRequest,
  SignatureVerifyResult
} from '../../../../shared/types'
import { CommandRunner } from '../../platform/command-runner'
import { PlatformService } from '../../platform/platform-service'
import { createId } from '../../utils/id'
import { OperationHistory } from '../safety/operation-history'
import { TrashService } from '../safety/trash-service'

interface RawSignatureRow {
  Path?: string
  Status?: string
  Signer?: string
}

export class SignatureVerifierService {
  constructor(
    private readonly platform: PlatformService,
    private readonly commandRunner: CommandRunner,
    private readonly trashService: TrashService,
    private readonly history: OperationHistory
  ) {}

  async verify(request: SignatureVerifyRequest): Promise<SignatureVerifyResult> {
    if (request.paths.length === 0) {
      return { supported: true, files: [], message: '请先选择需要检测的文件。' }
    }

    if (this.platform.isWindows()) {
      return { supported: true, files: await this.verifyWindows(request.paths) }
    }

    if (this.platform.isMacOS()) {
      return { supported: true, files: await this.verifyMac(request.paths) }
    }

    return { supported: false, files: [], message: '当前平台暂不支持文件签名检测。' }
  }

  async quarantine(request: SignatureQuarantineRequest): Promise<SignatureQuarantineResult> {
    if (request.paths.length === 0) {
      return { success: false, message: '没有需要处理的文件。' }
    }

    const result = await this.trashService.moveToTrash(request.paths)
    const rollback = this.history.record('签名异常文件处理', '文件已移动到系统回收站,可在回收站中恢复。')

    return { ...result, rollbackId: rollback.id }
  }

  private async verifyWindows(paths: string[]): Promise<FileSignatureResult[]> {
    const arrayLiteral = paths.map((path) => `'${path.replace(/'/g, "''")}'`).join(',')
    const script =
      '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); ' +
      `$paths=@(${arrayLiteral}); ` +
      '$paths | ForEach-Object { ' +
      'if (Test-Path -LiteralPath $_) { ' +
      '$s = Get-AuthenticodeSignature -LiteralPath $_; ' +
      '[PSCustomObject]@{ Path=$_; Status=$s.Status.ToString(); Signer=$s.SignerCertificate.Subject } ' +
      '} else { [PSCustomObject]@{ Path=$_; Status="NotFound"; Signer=$null } } ' +
      '} | ConvertTo-Json -Compress'

    const result = await this.commandRunner
      .run('powershell', ['-NoProfile', '-Command', script], 60_000)
      .catch(() => ({ stdout: '', stderr: '' }))

    if (!result.stdout.trim()) {
      return paths.map((path) => this.createResult(path, 'unknown', undefined))
    }

    try {
      const parsed = JSON.parse(result.stdout) as RawSignatureRow[] | RawSignatureRow
      const rows = Array.isArray(parsed) ? parsed : [parsed]

      return rows.map((row) =>
        this.createResult(row.Path ?? '', this.mapWindowsStatus(row.Status), this.cleanSigner(row.Signer))
      )
    } catch {
      return paths.map((path) => this.createResult(path, 'unknown', undefined))
    }
  }

  private async verifyMac(paths: string[]): Promise<FileSignatureResult[]> {
    const results: FileSignatureResult[] = []

    for (const path of paths) {
      const check = await this.commandRunner.run('codesign', ['--verify', '--strict', path], 30_000).catch(() => undefined)

      if (!check) {
        results.push(this.createResult(path, 'invalid', undefined))
        continue
      }

      const detail = await this.commandRunner
        .run('codesign', ['-dv', '--verbose=2', path], 30_000)
        .catch(() => ({ stdout: '', stderr: '' }))
      const signerLine = `${detail.stdout}${detail.stderr}`.split('\n').find((line) => line.startsWith('Authority='))
      const signer = signerLine ? signerLine.replace('Authority=', '').trim() : undefined

      results.push(this.createResult(path, 'valid', signer))
    }

    return results
  }

  private mapWindowsStatus(status: string | undefined): SignatureStatus {
    switch (status) {
      case 'Valid':
        return 'valid'
      case 'NotSigned':
        return 'unsigned'
      case 'NotFound':
        return 'notFound'
      case 'HashMismatch':
      case 'NotTrusted':
      case 'UnknownError':
      case 'NotSupportedFileFormat':
        return status === 'NotSupportedFileFormat' ? 'unknown' : 'invalid'
      default:
        return 'unknown'
    }
  }

  private cleanSigner(signer: string | undefined): string | undefined {
    if (!signer) return undefined
    const match = signer.match(/CN=([^,]+)/)
    return match ? match[1].trim() : signer
  }

  private createResult(path: string, status: SignatureStatus, signer: string | undefined): FileSignatureResult {
    const isSystemPath = /^[a-z]:\\windows\\/i.test(path) || path.startsWith('/System/') || path.startsWith('/usr/')
    const { statusMessage, riskLevel, recommendation } = this.describeStatus(status, isSystemPath)

    return {
      id: createId('sig'),
      path,
      name: basename(path) || path,
      status,
      signer,
      statusMessage,
      riskLevel,
      recommendation,
      isSystemPath
    }
  }

  private describeStatus(
    status: SignatureStatus,
    isSystemPath: boolean
  ): Pick<FileSignatureResult, 'statusMessage' | 'riskLevel' | 'recommendation'> {
    if (status === 'valid') {
      return {
        statusMessage: '签名有效,来自可信发布者。',
        riskLevel: 'safe',
        recommendation: '文件完整且可信,无需处理。'
      }
    }

    if (status === 'invalid') {
      return {
        statusMessage: '签名校验未通过(哈希不匹配或证书不受信任),文件可能被篡改或伪造。',
        riskLevel: 'dangerous',
        recommendation: isSystemPath
          ? '系统目录内的签名异常文件风险很高,强烈建议删除并做系统检查。'
          : '建议删除或隔离该文件,如为重要程序请从官方渠道重新安装。'
      }
    }

    if (status === 'unsigned') {
      return {
        statusMessage: '文件未数字签名,常见于绿色软件、脚本或自编译程序。',
        riskLevel: isSystemPath ? 'cautious' : 'recommended',
        recommendation: isSystemPath
          ? '系统目录内出现未签名可执行文件需谨慎,建议结合来源确认后再决定。'
          : '请结合文件来源判断,来源不明可考虑删除。'
      }
    }

    if (status === 'notFound') {
      return {
        statusMessage: '未找到该文件,可能已被移动或删除。',
        riskLevel: 'safe',
        recommendation: '无需处理。'
      }
    }

    return {
      statusMessage: '无法判定签名状态(文件格式不支持或读取失败)。',
      riskLevel: 'cautious',
      recommendation: '建议人工核实,不要盲目删除。'
    }
  }
}
