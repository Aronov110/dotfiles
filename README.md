# dotfiles

My [Claude Code](https://claude.com/claude-code) setup and the rest of my dev-machine config: how I want an AI pair programmer to work with me, enforced by hooks instead of hoped for, plus the shell, git and editor config around it.

## What's in here

| Path | Purpose |
|---|---|
| `claude/CLAUDE.md` | Global working rules: plan-first workflow, stack conventions, testing and git rules |
| `claude/hooks/guard.mjs` | `PreToolUse` guard that asks before git writes, secret reads, destructive commands and dependency installs |
| `claude/hooks/after-edit.mjs` | `PostToolUse` hook that formats with the repo's own formatter and runs only the related tests |
| `claude/commands/` | Slash commands: `/plan-first` (full plan, wait for approval, save to `.plans/`) and `/commit-review` (self-review, propose a commit, wait) |
| `claude/agents/` | `security-reviewer` (read-only, OWASP and auth rules) and `test-writer` (edge-case tests, never touches the code under test) |
| `claude/templates/project-CLAUDE.md` | Starting point for a per-repo `CLAUDE.md` |
| `claude/settings.json` | Registers the hooks (copied, not linked: Claude Code rewrites it) |
| `git/gitconfig`, `git/ignore_global` | Shared git settings and a global ignore file. Identity is never stored here |
| `shell/bashrc`, `shell/powershell_profile.ps1` | Small, safe profiles: PATH, read-only aliases, a branch prompt |
| `vscode/` | Sanitized `settings.json` plus core and optional extension lists |
| `docker/daemon.json` | Docker Desktop daemon settings (no credentials; `config.json` is deliberately excluded) |
| `templates/repo/` | Starter kit for new repos: `.gitattributes`, `.gitignore`, `.editorconfig`, `biome.json`, `ruff.toml` (strip the `.template` suffix when copying) |
| `.githooks/pre-commit` | Secret scan on every commit to this repo (gitleaks, with a pattern fallback) |
| `tests/` | Tests for the installer, the pre-commit hook and every config file |

## How the workflow works

- **Plan first.** Any file write or side-effecting command gets a plan and my approval; read-only work doesn't.
- **One choice per category per repo.** Tech lists are a pool; each repo gets exactly one option per category, matching what it already uses.
- **Hooks, not promises.** The guard asks before anything risky. The after-edit hook never overrides a repo's formatter, reports tools that are configured but missing, and treats failing tests as a stop-and-fix signal.
- **Plans are portfolio pieces.** Per-repo `.plans/` files are committed so the reasoning behind a change is visible.

## Install (Windows, PowerShell)

```powershell
git clone https://github.com/Aronov110/dotfiles $HOME\dotfiles
cd $HOME\dotfiles
.\install.ps1            # add -VSCode to also copy VS Code settings and install the core extensions
```

What it does, safely and repeatably:

- Links `hooks/`, `templates/`, `commands/` and `agents/` into `~/.claude` as directory junctions and `CLAUDE.md` as a hard link (symlinks need Developer Mode or admin on Windows). Anything already there is backed up first.
- Copies `settings.json` only if none exists.
- Adds an `[include]` for `git/gitconfig` and sets `core.excludesfile`. Your git name and email are never touched.
- Appends one source line to `~/.bashrc` and the PowerShell profile if it isn't there already.
- Turns on this repo's pre-commit hook (`core.hooksPath=.githooks`). **A fresh clone is only protected after the installer has run.**

`settings.json` files are copied, not linked, because the apps rewrite them. Move changes either way with:

```powershell
.\sync-settings.ps1                              # Claude: live -> repo (then commit)
.\sync-settings.ps1 -Direction Push              # Claude: repo -> live (backs up the live file)
.\sync-settings.ps1 -Target vscode               # VS Code: live -> repo (remove machine-specific paths first)
```

`claude/settings.json` contains absolute `C:/Users/<name>/...` hook paths; edit them for a different machine. Prettier and ESLint extensions are in `vscode/extensions-optional.txt` because Biome is the default formatter and repos pick their own.

## Tests

```powershell
node --test tests/install.test.mjs tests/pre-commit.test.mjs tests/config-files.test.mjs
node --test claude/hooks/__tests__/guard.test.mjs claude/hooks/__tests__/after-edit.test.mjs
```

The installer tests run against a throwaway home directory, so they never touch real config.

## License

MIT
