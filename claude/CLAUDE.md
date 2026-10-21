# David's working rules

## Workflow
- Plan before any file write or side-effecting command. Read-only work (questions, debugging, investigation) needs no plan.
- Small task = 1-2 line plan and a quick confirm. Big task = full plan: files to change, test plan + edge cases, security and a11y notes, alternatives + risks.
- Wait for approval. Trivial fixes (typos, dead imports) in files I'm already editing go in the plan; everything else unrelated is flagged in a separate list, never fixed.
- Scratch folders (PycharmProjects, sandboxes): a quick confirm is enough.
- Be detailed: reasoning and alternatives. For non-trivial code explain: source/pattern credit, why this approach, difficulty rating for David to write it himself, and learning links. Brief in the plan, detailed in the summary.
- Committed plans go in `.plans/YYYY-MM-DD-short-title.md` with a status header (draft/approved/done). No secrets, hostnames, personal data or exploit steps. Per-repo opt-out: gitignore `.plans/` for client/employer repos.

## Choosing tech
- Preference lists are a POOL across repos. Per repo use ONE option per category, matching what the repo already uses; state it in the plan; never mix. No precedent: propose one and ask.
- Only well-tested, well-respected tools. Flag young ones (e.g. ty, pyrefly) instead of adopting them.
- Detect the repo's package manager from its lockfile (bun/npm); never create a second lockfile.
- New projects target current LTS/stable runtimes. Check a tool exists before relying on it.

## Code
- TypeScript strict, no `any`. Functional style. Biome (JS/TS) and Ruff (Python) for new repos; otherwise follow the repo's formatter.
- Public APIs get JSDoc/docstrings; never comment what the code already says. English everywhere.
- Frontend: Atomic Design (ions/tokens, atoms, molecules, organisms, templates, pages, extra tiers if useful); PascalCase components, camelCase otherwise; types/styles and Storybook stories beside components; tests in `__tests__/`; non-UI code in `shared/` or `lib/`; no barrel files.
- Errors: custom error classes + a global handler; never swallow errors. API errors use RFC 9457 Problem Details; cursor pagination; OpenAPI-first (docs via Scalar).
- DB: migration files always, snake_case, UUIDv7, UTC timestamptz, soft deletes only if needed.
- Auth: access token in memory + refresh token in an httpOnly/Secure/SameSite cookie, CSRF protection, argon2id, never tokens in localStorage. Check OWASP Top 10 on every change; headers, CORS allowlist, rate limits, dependency audits.
- WCAG 2.2 AA always. Lighthouse 90+, Core Web Vitals "good", bundle budget. Browsers: evergreen + older Safari/mobile.
- Docker: multi-stage, non-root, pinned versions, healthchecks, .dockerignore.
- Typed validated env config; never commit secrets.

## Testing
- Write as many tests as possible, cover every edge case. Related tests after edits; full suite before a PR.
- On failure: stop and fix before more edits. If it looks unrelated, ask. Never edit a test just to make it pass.
- Frontend suite: Vitest/Jest, React Testing Library, Playwright/Cypress, Storybook, Lighthouse, axe. Python: pytest.

## Git
- Never commit, push, reset or open a PR without approval. For commits show message + file list first.
- Feature branches `type/short-description`, PRs, never commit to main.
- Plain imperative messages. Last line of every commit: `Used model: <model name>`. No Co-Authored-By.
- Before proposing a commit, self-review the diff: correctness, security, simplification.
- Every repo gets `.gitattributes` (`* text=auto eol=lf`) and a standard `.gitignore`. Public repos: MIT.

## Environment
- Windows, Git Bash and Docker dev containers. Check that tools exist (biome, ruff, uv, gh) before relying on them; offer to install in the plan.
- Hooks live in `~/.claude/hooks/` (guard, after-edit). They ask before git writes, secret reads, destructive commands and installs.
