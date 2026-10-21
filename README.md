# dotfiles

My [Claude Code](https://claude.com/claude-code) setup: how I want an AI pair programmer to work with me, enforced by hooks instead of hoped for.

## What's in here

| Path | Purpose |
|---|---|
| `claude/CLAUDE.md` | Global working rules: plan-first workflow, stack conventions, testing and git rules |
| `claude/hooks/guard.mjs` | `PreToolUse` guard that asks before git writes, secret reads, destructive commands and dependency installs |
| `claude/hooks/after-edit.mjs` | `PostToolUse` hook that formats with the repo's own formatter and runs only the related tests |
| `claude/hooks/__tests__/` | Tests for both hooks (`node --test`) |
| `claude/templates/project-CLAUDE.md` | Starting point for a per-repo `CLAUDE.md` |
| `claude/settings.json` | Registers the hooks (copied, not linked: Claude Code rewrites it) |

## How the workflow works

- **Plan first.** Any file write or side-effecting command gets a plan and my approval; read-only work doesn't.
- **One choice per category per repo.** Tech lists are a pool; each repo gets exactly one option per category, matching what it already uses.
- **Hooks, not promises.** The guard asks before anything risky. The after-edit hook never overrides a repo's formatter, reports tools that are configured but missing, and treats failing tests as a stop-and-fix signal.
- **Plans are portfolio pieces.** Per-repo `.plans/` files are committed so the reasoning behind a change is visible.

## Install (Windows, PowerShell)

```powershell
git clone https://github.com/<user>/dotfiles $HOME\dotfiles
cd $HOME\dotfiles
.\install.ps1
```

Symlinks need Developer Mode or admin on Windows, so `install.ps1` uses directory junctions for `hooks/` and `templates/` and a hard link for `CLAUDE.md`. Existing files are backed up first. Re-running is safe.

`settings.json` is copied, not linked. Move changes either way with:

```powershell
.\sync-settings.ps1                      # live -> repo (then commit)
.\sync-settings.ps1 -Direction Push      # repo -> live (backs up the live file)
```

`claude/settings.json` contains absolute `C:/Users/<name>/...` hook paths; edit them for a different machine.

## Tests

```powershell
node --test claude/hooks/__tests__/guard.test.mjs claude/hooks/__tests__/after-edit.test.mjs
```

## License

MIT
