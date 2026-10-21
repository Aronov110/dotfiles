<#
.SYNOPSIS
  Copies settings.json between ~/.claude and this repo.

.DESCRIPTION
  Pull (default): live ~/.claude/settings.json -> repo, to commit changes.
  Push: repo -> live, after backing up the live file.
  settings.json is copied rather than linked because Claude Code rewrites it.
#>
[CmdletBinding()]
param(
    [ValidateSet('Pull', 'Push')]
    [string]$Direction = 'Pull'
)

$ErrorActionPreference = 'Stop'

$repoFile = Join-Path $PSScriptRoot 'claude\settings.json'
$liveFile = Join-Path $env:USERPROFILE '.claude\settings.json'

if ($Direction -eq 'Pull') {
    Copy-Item $liveFile $repoFile -Force
    Write-Host "pulled: $liveFile -> $repoFile"
} else {
    $backup = "$liveFile.bak-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"
    Copy-Item $liveFile $backup
    Copy-Item $repoFile $liveFile -Force
    Write-Host "pushed: $repoFile -> $liveFile (backup: $backup)"
}
