<#
.SYNOPSIS
Collects local Windows evidence for an OpenPet smoke validation session.

.DESCRIPTION
This helper records environment, Authenticode, process, and installation snapshots.
It does not mark any Windows smoke check as passed and does not prove release readiness by itself.
Generated: 2026-06-23T22:22:32.848Z
#>
param(
  [string]$ReportPath = (Join-Path $PSScriptRoot 'windows-smoke-report.json'),
  [string]$EvidenceDir = (Join-Path $PSScriptRoot 'windows-smoke-evidence'),
  [string]$InstallerPath = '',
  [string]$AppProcessName = 'OpenPet'
)

$ErrorActionPreference = 'Stop'

function Write-EvidenceFile {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $path = Join-Path $EvidenceDir $Name
  Set-Content -LiteralPath $path -Value $Content.TrimEnd() -Encoding UTF8
  return $path
}

New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$collectedAt = (Get-Date).ToString('o')
$osInfo = $null
try {
  $osInfo = Get-CimInstance Win32_OperatingSystem
} catch {
  Write-Warning "Unable to query Win32_OperatingSystem: $($_.Exception.Message)"
}

$environmentLines = @(
  "CollectedAt: $collectedAt"
  "ComputerName: $env:COMPUTERNAME"
  "UserName: $env:USERNAME"
  "PowerShell: $($PSVersionTable.PSVersion)"
  "ReportPath: $ReportPath"
  "EvidenceDir: $EvidenceDir"
)
if ($osInfo) {
  $environmentLines += "WindowsCaption: $($osInfo.Caption)"
  $environmentLines += "WindowsVersion: $($osInfo.Version)"
  $environmentLines += "WindowsBuild: $($osInfo.BuildNumber)"
  $environmentLines += "OSArchitecture: $($osInfo.OSArchitecture)"
}
Write-EvidenceFile -Name 'environment.txt' -Content ($environmentLines -join [Environment]::NewLine) | Out-Null

$report = $null
if (Test-Path -LiteralPath $ReportPath) {
  try {
    $report = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
  } catch {
    Write-Warning "Unable to read smoke report JSON: $($_.Exception.Message)"
  }
} else {
  Write-Warning "Smoke report not found: $ReportPath"
}

if (-not $InstallerPath -and $report -and $report.artifact -and $report.artifact.installer) {
  $candidate = Join-Path (Split-Path -Parent $ReportPath) $report.artifact.installer
  if (Test-Path -LiteralPath $candidate) {
    $InstallerPath = $candidate
  }
}

if ($InstallerPath -and (Test-Path -LiteralPath $InstallerPath)) {
  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath | Format-List * | Out-String -Width 240
    Write-EvidenceFile -Name 'authenticode.txt' -Content $signature | Out-Null
  } catch {
    Write-EvidenceFile -Name 'authenticode.txt' -Content "Get-AuthenticodeSignature failed: $($_.Exception.Message)" | Out-Null
  }
} else {
  Write-EvidenceFile -Name 'authenticode.txt' -Content "Installer not found. Pass -InstallerPath or place the installer next to $ReportPath." | Out-Null
}

try {
  $processSnapshot = Get-Process -Name $AppProcessName -ErrorAction SilentlyContinue | Select-Object Name, Id, Path, StartTime, MainWindowTitle | Format-List | Out-String -Width 240
  if (-not $processSnapshot.Trim()) { $processSnapshot = "No process named $AppProcessName was running at collection time." }
  Write-EvidenceFile -Name 'process.txt' -Content $processSnapshot | Out-Null
} catch {
  Write-EvidenceFile -Name 'process.txt' -Content "Process snapshot failed: $($_.Exception.Message)" | Out-Null
}

$uninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
)
$installMatches = foreach ($root in $uninstallRoots) {
  if (Test-Path -LiteralPath $root) {
    Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        Get-ItemProperty -LiteralPath $_.PSPath
      } catch {
        Write-Warning "Unable to read uninstall entry under ${root}: $($_.Exception.Message)"
      }
    } | Where-Object { $_.DisplayName -like '*OpenPet*' } | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString
  }
}
$installSnapshot = $installMatches | Format-List | Out-String -Width 240
if (-not $installSnapshot.Trim()) { $installSnapshot = 'No OpenPet uninstall entry was found at collection time.' }
Write-EvidenceFile -Name 'install-registry.txt' -Content $installSnapshot | Out-Null

$manualChecklist = @'
# OpenPet Windows Smoke Manual Checklist

This checklist is generated from the same required check matrix used by the JSON validator. Attach concrete evidence before marking any check as pass.

| Check ID | What To Prove | Evidence Guidance |
|----------|---------------|-------------------|
| `install` | Install NSIS package on a clean Windows machine | Record the installer filename, install mode, target path, and whether Start Menu/Desktop shortcuts were created. |
| `launch` | Launch installed app and keep it running | Record the launch method, app version shown in About, and a short observation that the app stayed running. |
| `transparent-window` | Transparent pet window renders with alpha | Attach a screenshot or screen recording showing the pet window alpha background on the Windows desktop. |
| `drag-bounds` | Drag, bounds, always-on-top, and taskbar behavior | Record drag behavior, monitor bounds, always-on-top behavior, focus behavior, and taskbar visibility. |
| `control-center-tabs` | Control Center opens all tabs | Record that Pet, Actions, AI, Plugins, Catalog, Service, and About tabs open without renderer errors. |
| `pet-actions` | Built-in sprites and imported frame folders work | Record built-in action playback and one imported frame-folder action regenerated from Windows paths. |
| `pet-pack-import` | Pet pack import, enable, and delete works on Windows paths | Record inspect/import/activate/delete of a pet pack under the Windows userData directory. |
| `plugin-runner` | Plugin runner works on Windows paths with restricted permissions | Record an official plugin command and a local plugin command running with restricted permissions. |
| `local-http-default-off` | Local HTTP and MCP remain disabled by default | Record a fresh profile showing Local HTTP and MCP disabled before the user enables them. |
| `local-http-token-gated` | Local HTTP and MCP are loopback-only and token-gated | Record loopback binding, rejected unauthenticated mutation, accepted token-authenticated mutation, and MCP token/session behavior. |
| `api-key-isolation` | API keys are unavailable to renderer and ordinary plugins | Record that AI config can save a key while renderer/plugin-visible config never exposes plaintext secret values. |
| `about-update-assets` | About update check shows only Windows install assets | Record About update results showing Windows installers and hiding macOS assets/feed metadata. |
| `uninstall` | Uninstall preserves user data unless explicitly removed | Record uninstall result, relaunch absence, and preserved user data when uninstall is not asked to delete app data. |
'@
Write-EvidenceFile -Name 'manual-checks.md' -Content $manualChecklist | Out-Null

$commandNotes = @'
# OpenPet Windows Smoke Report Update Commands

Run these from the repository root after collecting evidence on Windows. Replace placeholders with paths or excerpts from the files generated by windows-smoke-collector.ps1.

```powershell
npm run update-windows-smoke-report -- windows-smoke-report.json --set-env windowsVersion="<copy from windows-smoke-evidence/environment.txt>" --set-env machine="<clean Windows machine name>" --set-env runner="manual Windows smoke validation" --set-env evidence="<evidence directory or transcript link>"
npm run update-windows-smoke-report -- windows-smoke-report.json --set-artifact authenticodeEvidence="<copy from windows-smoke-evidence/authenticode.txt>"
npm run validate-windows-smoke-report -- windows-smoke-report.json --allow-pending
```

Do not use these commands to mark checks as pass until the matching manual validation evidence exists.
'@
Write-EvidenceFile -Name 'update-report-commands.md' -Content $commandNotes | Out-Null

Write-Host "OpenPet Windows smoke evidence collected in: $EvidenceDir"
Write-Host "Review manual-checks.md and attach concrete evidence before marking any check as pass."
