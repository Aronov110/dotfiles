---
description: Self-review the pending changes, then propose a commit message and wait for approval
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*)
---

Prepare a commit for the current changes. Do not commit anything yet.

1. Run `git branch --show-current`, `git status --short` and `git diff HEAD`. If on `main`, stop and propose a feature branch named `type/short-description` first.
2. Self-review the diff:
   - **Correctness**: bugs, missing edge cases, missing or weakened tests.
   - **Security**: OWASP Top 10 on the changed code, secrets or personal data in the diff, new dependencies.
   - **Simplification**: over-engineering, duplication, unrequested scope.
   Fix nothing silently. List findings and ask whether to address them first.
3. Propose the commit:
   - Plain imperative subject, no Conventional Commits prefix (for example `Add login form`).
   - Optional short body explaining why.
   - Last line: `Used model: <model name>`. No Co-Authored-By trailer.
   - The exact list of files to be committed.
4. Wait for my approval. Only after approval stage those files and commit. Never push without a separate approval.
