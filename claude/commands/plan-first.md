---
description: Draft a full plan for a task and wait for approval before changing anything
argument-hint: <task description>
---

Plan this task before touching any file or running any side-effecting command: $ARGUMENTS

Investigate read-only first (read code, search, check which tools exist). Then write the plan with these sections:

1. **Goal**: one or two sentences, including what "done" means.
2. **Tech choices**: one option per category, matching what the repo already uses. Say why. Flag any new dependency and any young or unproven tool.
3. **Files to change**: exact paths and what changes in each.
4. **Test plan and edge cases**: the tests I will write (in `__tests__/` or the stack's equivalent) and every edge case they cover.
5. **Security and a11y notes**: OWASP implications and WCAG 2.2 AA implications. Describe risk classes only; no secrets, hostnames, personal data or exploit steps.
6. **Alternatives and risks**: options considered, trade-offs, what could break.
7. **Explanations**: for non-trivial code, the source or pattern, why this approach, how hard it would be for David to write himself (easy/medium/hard), and a learning link.

Small tasks get a one or two line plan instead. Show the plan in chat and wait for approval. Do not edit anything yet.

After approval, save the plan as `.plans/YYYY-MM-DD-short-title.md` (today's date, kebab-case title) with a status header (`Status: approved`), unless this repo gitignores `.plans/`. Update the status to `done` when the work is finished.
