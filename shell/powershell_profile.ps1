# Dot-sourced from $PROFILE by install.ps1. Keep it small and safe: no shortcuts
# for destructive commands (commit, push, reset, Remove-Item).

# Tools installed outside the Windows PATH of an already-running shell.
foreach ($dir in "$HOME\.bun\bin", "$HOME\.local\bin", 'C:\Program Files\GitHub CLI') {
    if ((Test-Path $dir) -and ($env:Path -notlike "*$dir*")) {
        $env:Path = "$dir;$env:Path"
    }
}

# Read-only shortcuts. Names avoid built-in aliases (gl is Get-Location), which would win over functions.
function gst { git status -sb }
function glg { git log --oneline --graph --decorate -15 }
function gdf { git diff @args }
function ll { Get-ChildItem -Force @args }
