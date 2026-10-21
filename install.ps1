<#
.SYNOPSIS
  Links this repo's config into the home directory. Safe to re-run.

.DESCRIPTION
  Windows symlinks need Developer Mode or an admin shell, so this uses
  directory junctions (hooks, templates, commands, agents) and a hard link
  (CLAUDE.md). settings.json files are copied, never linked, because the
  tools that own them rewrite them; use sync-settings.ps1 to move changes.

  Anything already in place that is not linked yet is backed up first.
  Git identity is never touched: shared settings come in via [include].

.PARAMETER VSCode
  Also copy VS Code settings (if missing) and install the core extensions.
#>
[CmdletBinding()]
param(
    [switch]$VSCode
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$repo = Join-Path $root 'claude'
$home_ = $env:USERPROFILE
$live = Join-Path $home_ '.claude'
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

<# Converts a Windows path to the /c/... form Git Bash understands. #>
function ConvertTo-PosixPath([string]$Path) {
    $p = $Path -replace '\\', '/'
    if ($p -match '^([A-Za-z]):(.*)$') { return "/$($Matches[1].ToLower())$($Matches[2])" }
    return $p
}

<# Appends a line to a file unless it is already there; creates the file and its folder if needed. #>
function Add-LineOnce([string]$File, [string]$Line) {
    New-Item -ItemType Directory -Force (Split-Path $File) | Out-Null
    if (-not (Test-Path $File)) { New-Item -ItemType File $File | Out-Null }
    if (Select-String -Path $File -SimpleMatch $Line -Quiet) {
        Write-Host "ok: $File already sources the profile"
    } else {
        Add-Content -Path $File -Value "`n$Line"
        Write-Host "added source line to $File"
    }
}

foreach ($name in 'hooks', 'templates', 'commands', 'agents') {
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

# Git: pull in the shared settings and the global ignore file. Identity stays local.
$gitInclude = (Join-Path $root 'git\gitconfig') -replace '\\', '/'
$existing = @(git config --global --get-all include.path)
if ($existing -contains $gitInclude) {
    Write-Host 'ok: git include already set'
} else {
    git config --global --add include.path $gitInclude
    Write-Host "set: git include.path -> $gitInclude"
}
if (-not (git config --global --get core.excludesfile)) {
    git config --global core.excludesfile ((Join-Path $root 'git\ignore_global') -replace '\\', '/')
    Write-Host 'set: git core.excludesfile'
}

# This repo's own secret-scanning pre-commit hook.
git -C $root config core.hooksPath .githooks
Write-Host 'set: core.hooksPath=.githooks for this repo'

# Shells: source the shared profiles from the real ones.
$bashrc = ConvertTo-PosixPath (Join-Path $root 'shell\bashrc')
Add-LineOnce (Join-Path $home_ '.bashrc') "[ -f `"$bashrc`" ] && . `"$bashrc`""
$psProfile = Join-Path $root 'shell\powershell_profile.ps1'
$psTarget = Join-Path $home_ 'Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1'
Add-LineOnce $psTarget "if (Test-Path `"$psProfile`") { . `"$psProfile`" }"

if ($VSCode) {
    $vsSettings = Join-Path $env:APPDATA 'Code\User\settings.json'
    if (Test-Path $vsSettings) {
        Write-Host 'skipped: VS Code settings.json exists; run sync-settings.ps1 -Target vscode -Direction Push to overwrite it'
    } else {
        New-Item -ItemType Directory -Force (Split-Path $vsSettings) | Out-Null
        Copy-Item (Join-Path $root 'vscode\settings.json') $vsSettings
        Write-Host 'copied: VS Code settings.json'
    }
    if (Get-Command code -ErrorAction SilentlyContinue) {
        Get-Content (Join-Path $root 'vscode\extensions.txt') | Where-Object { $_ } | ForEach-Object {
            code --install-extension $_ --force | Out-Null
            Write-Host "extension: $_"
        }
    } else {
        Write-Host "skipped: 'code' is not on PATH, so extensions were not installed"
    }
}

Write-Host 'done. Optional VS Code extensions (Prettier/ESLint) are listed in vscode\extensions-optional.txt.'
