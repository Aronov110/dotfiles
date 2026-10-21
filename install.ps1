<#
.SYNOPSIS
  Links this repo's Claude Code config into ~/.claude. Safe to re-run.

.DESCRIPTION
  Windows symlinks need Developer Mode or an admin shell, so this uses
  directory junctions (hooks, templates) and a hard link (CLAUDE.md).
  settings.json is copied, never linked, because Claude Code rewrites it;
  use sync-settings.ps1 to move changes in either direction.

  Anything already in ~/.claude that is not linked yet is backed up first.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repo = Join-Path $PSScriptRoot 'claude'
$live = Join-Path $env:USERPROFILE '.claude'
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'

New-Item -ItemType Directory -Force $live | Out-Null

<# Moves an existing, unlinked item aside so a link can take its place. #>
function Backup-Existing([string]$Path) {
    if (Test-Path $Path) {
        $backup = "$Path.bak-$stamp"
        Move-Item $Path $backup
        Write-Host "  backed up existing item to $backup"
    }
}

foreach ($name in 'hooks', 'templates') {
    $target = Join-Path $repo $name
    $link = Join-Path $live $name
    $item = Get-Item $link -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq 'Junction' -and ($item.Target -contains $target)) {
        Write-Host "ok: $name already linked"
        continue
    }
    Backup-Existing $link
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    Write-Host "linked: $name -> $target"
}

$mdTarget = Join-Path $repo 'CLAUDE.md'
$mdLink = Join-Path $live 'CLAUDE.md'
$mdItem = Get-Item $mdLink -ErrorAction SilentlyContinue
if ($mdItem -and $mdItem.LinkType -eq 'HardLink' -and
    (Get-FileHash $mdLink).Hash -eq (Get-FileHash $mdTarget).Hash) {
    Write-Host 'ok: CLAUDE.md already linked'
} else {
    Backup-Existing $mdLink
    New-Item -ItemType HardLink -Path $mdLink -Target $mdTarget | Out-Null
    Write-Host "linked: CLAUDE.md -> $mdTarget"
}

$settings = Join-Path $live 'settings.json'
if (-not (Test-Path $settings)) {
    Copy-Item (Join-Path $repo 'settings.json') $settings
    Write-Host 'copied: settings.json (review the absolute paths inside for this machine)'
} else {
    Write-Host 'skipped: settings.json exists; run sync-settings.ps1 -Direction Push to overwrite it'
}

git config --global core.autocrlf input
Write-Host 'set: git core.autocrlf=input'
