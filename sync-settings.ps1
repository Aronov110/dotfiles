<#
.SYNOPSIS
  Copies a settings.json between its live location and this repo.

.DESCRIPTION
  Pull (default): live file -> repo, to commit changes.
  Push: repo -> live, after backing up the live file.
  Targets: claude (~/.claude/settings.json) and vscode (the VS Code user settings).
  These files are copied rather than linked because the apps rewrite them.
#>
[CmdletBinding()]
param(
    [ValidateSet('claude', 'vscode')]
    [string]$Target = 'claude',

    [ValidateSet('Pull', 'Push')]
    [string]$Direction = 'Pull'
)

$ErrorActionPreference = 'Stop'

if ($Target -eq 'claude') {
    $repoFile = Join-Path $PSScriptRoot 'claude\settings.json'
    $liveFile = Join-Path $env:USERPROFILE '.claude\settings.json'
} else {
    $repoFile = Join-Path $PSScriptRoot 'vscode\settings.json'
    $liveFile = Join-Path $env:APPDATA 'Code\User\settings.json'
}

if ($Direction -eq 'Pull') {
    Copy-Item $liveFile $repoFile -Force
    Write-Host "pulled: $liveFile -> $repoFile"
    if ($Target -eq 'vscode') {
        Write-Host 'review before committing: remove machine-specific paths (for example java.jdt.ls.java.home) and telemetry opt-ins'
    }
} else {
    $backup = "$liveFile.bak-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"
    Copy-Item $liveFile $backup
    Copy-Item $repoFile $liveFile -Force
    Write-Host "pushed: $repoFile -> $liveFile (backup: $backup)"
}
