# Execution Strategy — scale-up-v1

**Project status: COMPLETE ✅ — 2026-04-01**

This document captures project-specific notes for `scale-up-v1`. The general execution methodology (session structure, verification layers, git strategy, anti-patterns) has been extracted to the global reference:

→ **[docs/workflow/HOW-WE-WORK.md](../../HOW-WE-WORK.md)**

---

**Original purpose:** Define how we work together to implement the migration. This covers what makes a task executable, how to prompt Claude effectively, what context to provide, and how to avoid common failure modes.

---

## What Makes a Task "Executable"

A task is executable in a single Claude Code session when:

1. **It has a single clear objective.** One feature, one fix, one endpoint. Not "build the dashboard."
2. **The input state is defined.** Which prior tasks must be complete. Which files exist.
3. **The output is verifiable.** There is a concrete acceptance check (query result, page loads, test passes, no TypeScript error).
4. **It touches ≤ 5 files.** More than that usually means the task is too large or poorly scoped.
5. **It does not require decisions mid-task.** If Claude would need to stop and ask "should I use X or Y?", that decision should be made before the session starts.

If a task fails any of these, split it further before starting.

---

## The Session Structure

Each coding session follows this pattern:

### 1. Orient (you do this before starting)
Point Claude to the right task from `04-task-decomposition.md`. State which prior tasks are complete. State what you've already done manually (e.g. "I already ran the SQL migration for TASK-1.1").

### 2. Read first, code second (Claude does this)
Claude reads the relevant files before touching anything. Never modify code that hasn't been read in the session. This prevents stale-context bugs.

### 3. One change at a time (Claude does this)
Make the smallest change that moves toward the goal. Verify it works before the next change. For backend changes, this means testing the endpoint. For frontend changes, this means checking the UI renders.

### 4. Verify before closing (you do this)
Run the acceptance check from the task definition. If it passes, mark the task complete in `04-task-decomposition.md`. If it fails, stay in the session and diagnose.

---

## How to Prompt Claude for a Task

### Template

```
I want to work on TASK-X.Y from docs/scale-up/04-task-decomposition.md.

Prior tasks complete: [list task IDs]
Manual steps already done: [e.g. "I ran the SQL migration in Supabase"]

Context:
- [Any relevant decision already made from the constraints interview]
- [Any deviation from the plan]

Goal for this session: [restate the task's "What" in your own words]

Please read the relevant files first before making any changes.
```

### Example

```
I want to work on TASK-0.1 — fix the SQLite DROP TABLE bug.

Prior tasks complete: none
Manual steps already done: none

Context:
- This is a standalone fix, no dependencies
- Do not add any migration framework, just fix the immediate bug

Goal: Remove the DROP TABLE line from sqlite.ts and make sure the table
creation is safe for existing records.

Please read apps/frontend/src/database/sqlite.ts first.
```

---

## Verification Workflow

Every task uses a three-layer verification process before being marked done. Each task definition in `04-task-decomposition.md` includes a **Verification** section that maps to these layers.

### Layer 1 — Lint changed files (always)

Run ESLint only on the files modified in this task:

```bash
git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint
```

Do not use `pnpm lint` as the gate — it fails on pre-existing Prettier issues unrelated to your change. If ESLint reports **new** errors in files you touched, fix them before closing the task.

### Layer 2 — Unit tests (required for new business logic)

For changes in `apps/web`:
```bash
pnpm wb test
```

For changes in `apps/frontend`: no test runner is configured yet. Add vitest to the frontend when the first frontend business logic test is needed.

Write tests for: conditional branching, data transformation, error handling.
Skip tests for: deleted code, config wiring, UI-only rendering.

Use `vi.resetModules()` + dynamic `import()` when testing modules with env-var-driven constants (see `ai-generation.service.test.ts` as the reference pattern).

### Layer 3 — Manual smoke test

Follow the exact steps in the task's **Verification** section. Run them in order. If any step fails, do not move to the next task.

---

## Context Claude Needs in Each Session

Claude's context resets between conversations. For each session, provide:

| Context | How to provide |
|---------|---------------|
| Which task | Reference `04-task-decomposition.md` by task ID |
| What's already built | List completed task IDs |
| Architecture decisions | Reference the relevant section of `03-migration-strategy.md` or `02-constraints-interview.md` |
| Any constraints to respect | State them explicitly ("do not change the Supabase bucket name") |
| The TypeScript types already defined | Reference the file if types were defined in a prior session |

You do not need to paste file contents — Claude will read them with tools. But you do need to tell Claude which files are relevant if they're not obvious from the task.

---

## Anti-Patterns to Avoid

### Giving too large a task
**Bad:** "Implement Phase 2 — the kiosk config and remote config endpoint."
**Good:** "Implement TASK-2.3 — the GET /api/config endpoint. TASK-2.1 and TASK-2.2 are already done."

### Skipping the read step
Never say "just edit X to do Y" without Claude reading the file first. Stale assumptions about file content cause subtle bugs.

### Changing scope mid-session
If Claude is implementing TASK-3.1 and you realize TASK-3.2 should also be done, finish and verify TASK-3.1 first. Start a new session for TASK-3.2.

### Making manual Supabase changes mid-session without telling Claude
If you ran a SQL migration manually, state it at the start of the next session. Claude cannot see Supabase schema unless it queries it.

### Skipping verification
Do not move to the next task if you haven't verified the current one. The dependency graph in `04-task-decomposition.md` assumes each task is fully working before the next begins.

---

## Definition of "Done" for a Task

A task is done when all three verification layers pass:

- [ ] **Layer 1:** `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no new errors in changed files
- [ ] **Layer 2:** Unit tests written (if business logic changed) and `pnpm wb test` passes
- [ ] **Layer 3:** Manual steps in the task's **Verification** section all pass
- [ ] Task is marked complete (~~strikethrough~~ + ✅) in `04-task-decomposition.md`

For backend tasks, Layer 3 also includes:
- [ ] The endpoint responds correctly to a `curl` or Postman request
- [ ] Error cases return appropriate HTTP status codes

For frontend tasks, Layer 3 also includes:
- [ ] The full guest flow (/ → select → camera → form → loading → result) still works
- [ ] The admin `/data` route still works

---

## Handling Failures

If a session produces code that doesn't work:

1. **Do not start the next task.** Fix the current one first.
2. **Read the error carefully.** Ask Claude to diagnose rather than immediately retry.
3. **Check the dependency chain.** If TASK-2.5 fails, verify TASK-2.3 and TASK-2.4 are actually working.
4. **Revert if needed.** If the change makes things worse, revert and approach differently. Git is your safety net — commit after each working task.

---

## Git Strategy

- **Commit after each completed task.** This makes rollback trivial.
- **Branch per phase.** `phase-0-hotfixes`, `phase-1-eventid`, `phase-2-config`, etc.
- **Never commit a broken build.** TypeScript errors, failing routes, or broken kiosk flow must be fixed before committing.
- **Tag before each production deploy.** `git tag v1.1-phase0` before deploying Phase 0 to production.

---

## Session Sizing

| Task type | Typical session length | Notes |
|-----------|----------------------|-------|
| Hotfix (TASK-0.x) | 5–15 min | Simple, focused |
| Schema + migration (TASK-1.x) | 15–30 min | Manual Supabase steps + code |
| New endpoint (TASK-2.3, TASK-5.2) | 20–40 min | Read → implement → test |
| Type system refactor (TASK-3.1) | 30–60 min | Many files, careful verification needed |
| New route/page (TASK-4.x, TASK-5.3) | 30–60 min | UI + data fetching |
| Context provider (TASK-2.5) | 45–90 min | Complex, many dependents |

If a session is going over 90 minutes without reaching the acceptance criteria, stop, commit what works, and re-scope.

---

## Maintaining This Document Set

As the migration progresses, keep these documents current:

| Document | Update when |
|----------|-------------|
| `02-constraints-interview.md` | Answers are added; revisit if constraints change |
| `03-migration-strategy.md` | A phase is completed; a risk materializes; a phase is re-ordered |
| `04-task-decomposition.md` | A task is completed (check it off); a task is split; a new task is discovered |
| `05-execution-strategy.md` | A new anti-pattern is found; the prompting template improves |

Add a `## Completed Tasks` section to `04-task-decomposition.md` as tasks are finished, with notes on what was discovered during implementation.
