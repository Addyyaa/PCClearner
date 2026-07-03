import { CommandRunner } from '../platform/command-runner'
import { OsPaths } from '../platform/os-paths'
import { PlatformService } from '../platform/platform-service'
import { PrivilegeService } from '../platform/privilege-service'
import { DesktopAdDetectorService } from './ads/desktop-ad-detector-service'
import { DescriptionService } from './description/description-service'
import { DiskCleaner } from './disk/cleaner'
import { DiskCleanerService } from './disk/disk-cleaner-service'
import { CleanupRuleEngine } from './disk/rules'
import { DiskScanner } from './disk/scanner'
import { DiskUsageService } from './disk-usage/disk-usage-service'
import { DuplicateFileService } from './duplicates/duplicate-file-service'
import { NetworkDiagnosticsService } from './network/network-diagnostics-service'
import { NetworkRepairService } from './network/network-repair-service'
import { NetworkRuleEngine } from './network/network-rules'
import { RegistryCleanerService } from './registry/registry-cleaner-service'
import { BackupManager } from './safety/backup-manager'
import { ConfirmationPolicy } from './safety/confirmation-policy'
import { OperationHistory } from './safety/operation-history'
import { TrashService } from './safety/trash-service'
import { SignatureVerifierService } from './signature/signature-verifier-service'
import { ResidualScannerService } from './software/residual-scanner-service'
import { SoftwareMigrationService } from './software/software-migration-service'
import { StartupManagerService } from './startup/startup-manager-service'

export function createServiceContainer() {
  const platform = new PlatformService()
  const commandRunner = new CommandRunner()
  const privilegeService = new PrivilegeService()
  const osPaths = new OsPaths(platform)
  const backupManager = new BackupManager(osPaths)
  const operationHistory = new OperationHistory()
  const trashService = new TrashService(platform, privilegeService)
  const confirmationPolicy = new ConfirmationPolicy()
  const ruleEngine = new CleanupRuleEngine()
  const diskScanner = new DiskScanner(ruleEngine)
  const diskCleaner = new DiskCleaner(trashService, backupManager, operationHistory)
  const networkRuleEngine = new NetworkRuleEngine()

  return {
    platform,
    confirmationPolicy,
    operationHistory,
    diskCleaner: new DiskCleanerService(platform, diskScanner, diskCleaner),
    description: new DescriptionService(),
    duplicates: new DuplicateFileService(),
    diskUsage: new DiskUsageService(platform, commandRunner),
    registry: new RegistryCleanerService(platform, commandRunner, backupManager, operationHistory),
    startup: new StartupManagerService(platform, commandRunner, osPaths, operationHistory),
    networkDiagnostics: new NetworkDiagnosticsService(platform, commandRunner, networkRuleEngine),
    networkRepair: new NetworkRepairService(platform, commandRunner, privilegeService),
    ads: new DesktopAdDetectorService(platform, commandRunner, operationHistory, backupManager),
    signature: new SignatureVerifierService(platform, commandRunner, trashService, operationHistory),
    residual: new ResidualScannerService(platform, commandRunner, trashService, operationHistory),
    migration: new SoftwareMigrationService(platform, commandRunner, privilegeService, operationHistory)
  }
}

export type ServiceContainer = ReturnType<typeof createServiceContainer>
