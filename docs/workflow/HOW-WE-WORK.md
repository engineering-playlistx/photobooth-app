# How We Work — Execution Methodology

**Scope:** Applies to all projects in `docs/workflow/projects/`. Project-specific notes live in each project's `05-execution-strategy.md`.

---

## What Makes a Task "Executable"

A task is executable in a single Claude Code session when:

1. **Single clear objective.** One feature, one fix, one endpoint. Not "build the dashboard."
2. **Input state is defined.** Which prior tasks must be complete. Which files exist.
3. **Output is verifiable.** There is a concrete acceptance check (query result, page loads, test passes).
4. **Touches ≤ 5 files.** More usually means the task is too large or poorly scoped.
5. **No mid-task decisions required.** If Claude would need to stop and ask "X or Y?", decide before starting.

If a task fails any of these, split it before starting.

---

## Session Structure

### 1. Orient (you do this before starting)
Reference the task ID from the project's task decomposition doc. State which prior tasks are complete. State anything done manually (e.g. "I already ran the SQL migration").

### 2. Read first, code second (Claude does this)
Read every file the task touches before making any change. Never modify code that hasn't been read in the session.

### 3. One change at a time (Claude does this)
Make the smallest change that moves toward the goal. Verify before the next change.

### 4. Verify before closing (you do this)
Run the acceptance check from the task definition. If it passes, mark the task done. If it fails, stay and diagnose — do not move to the next task.

---

## How to Prompt Claude for a Task

```
I want to work on TASK-X.Y from [project task decomposition doc].

Prior tasks complete: [list task IDs]
Manual steps already done: [e.g. "I ran the SQL migration in Supabase"]

Context:
- [Any relevant decision already made]
- [Any deviation from the plan]

Goal for this session: [restate the task's "What" in your own words]

Please read the relevant files first before making any changes.
```

---

## Verification Layers

Every task uses three layers before being marked done.

### Layer 1 — Lint changed files (always)

```bash
git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint
```

Do not use `pnpm lint` — it fails on pre-existing issues unrelated to your change.

### Layer 2 — Unit tests (required for new business logic)

```bash
pnpm wb test   # for apps/web changes
```

Write tests for: conditional branching, data transformation, error handling.
Skip tests for: deleted code, config wiring, UI-only rendering.

Use `vi.resetModules()` + dynamic `import()` for modules with env-var-driven constants.

### Layer 3 — Manual smoke test
Follow the exact steps in the task's **Verification** section. Run them in order.

For backend tasks, also:
- Confirm the endpoint responds correctly to a curl/Postman request
- Confirm error cases return appropriate HTTP status codes

For frontend tasks, also:
- Confirm the full guest flow still works end-to-end
- Confirm the admin `/data` route still works

---

## Definition of "Done"

- [ ] Layer 1: ESLint — no new errors in changed files
- [ ] Layer 2: Unit tests written (if business logic changed) and passing
- [ ] Layer 3: Manual steps in the task's Verification section all pass
- [ ] Task marked complete (~~strikethrough~~ + ✅) in the project's task decomposition

---

## Git Strategy

- **Commit after each completed task.** Rollback is trivial.
- **One commit per task.** Never batch tasks into one commit.
- **Never commit a broken build.** TypeScript errors, failing routes, or broken kiosk flow must be fixed first.
- **Tag before each production deploy.** `git tag v1.x-phase-N` before deploying.

Commit message convention:

| Type | When |
|------|------|
| `fix(phase-N):` | Bug fixes |
| `feat(phase-N):` | New features |
| `chore:` | Formatting, tooling, doc-only changes |
| `test:` | Test-only changes |

Separate formatting-only changes (after `pnpm lint:fix`) into their own `chore: apply prettier formatting` commit.

---

## Planning Sessions (Before Execution)

Planning sessions are separate from execution sessions. They produce or sharpen project documents — they do not touch code.

### When to run a planning session

- At the start of a new version (e.g. V4 planning before V4-1.1 starts)
- When a phase is complex enough that ambiguities would stall execution
- When the creator has new feedback that changes scope or architecture

### The planning session pattern

**Step 1 — Input gathering (Claude reads, you provide)**
Claude reads: the previous version's task decomposition, backlog, and any creator feedback. You provide: context that isn't in the docs (feedback from testing, changed priorities, new constraints).

**Step 1b — Codebase verification (Claude reads code, not just docs)**
Before writing any task spec, Claude reads the actual codebase to confirm facts the specs will depend on. Assumptions drawn from filenames or prior docs are not sufficient — verify against the source.

Minimum checks before drafting tasks:
- **Table names** — grep repository files or route loaders (e.g. `.from('events')`) rather than inferring from migration filenames
- **Data-fetch pattern** — read one or two dashboard route files to confirm whether the project uses server functions, bearer-auth API routes, or direct Supabase calls
- **Key file locations** — confirm that files named in task specs actually exist at those paths

Confirmed facts are recorded in a **Verified Facts** table at the top of `02-task-decomposition.md`. Any fact not in that table is an assumption — and assumptions are a planning hole.

**Step 2 — Draft docs (Claude writes)**
Claude produces the backlog, scope, and task decomposition in one pass. These are drafts — expect them to need sharpening.

**Step 3 — Design review (Claude self-reviews)**
After drafting, Claude re-reads the decomposition and looks for:
- **Design holes** — missing logic, wrong assumptions, undefined behavior
- **Risks** — things that could silently break, wrong dependencies, external requirements not mentioned
- **Inefficiencies** — added dependencies that aren't needed, ambiguous steps that would stall Claude mid-task

Claude produces a numbered list of issues found, grouped by type. Each issue names the task ID and states what needs to change.

**Step 4 — You decide**
Claude presents the issue list with a clear recommendation. You say yes, no, or adjust. The goal is a single decision from you — not a back-and-forth on each issue.

**Step 5 — Fix and commit**
Claude applies all approved fixes in one pass and commits the planning docs. After the commit, the decomposition is the single source of truth.

### What good planning output looks like

- Every task has a defined input (which prior tasks must be complete) and a defined output (what you can observe/check)
- No mid-task ambiguities — Claude should never need to stop and ask a design question during execution
- Tasks that touch external systems (Supabase, Electron build, GitHub Releases) name the manual steps required before the code step
- Risk ratings are honest — a task marked Low risk should be safely executable without extra caution
- `02-task-decomposition.md` opens with a Verified Facts table — every table name, file path, and data-fetch pattern referenced in the tasks is listed there with its source

### Keeping planning docs sharp

After any significant creator feedback mid-version, re-run steps 3–5 for the affected phases before starting them. Don't wait until you're in the middle of a task to discover a design hole.

---

## Anti-Patterns

**Giving too large a task**
Bad: "Implement Phase 2 — kiosk config and config endpoint."
Good: "Implement TASK-2.3 — the GET /api/config endpoint. TASK-2.1 and TASK-2.2 are done."

**Skipping the read step**
Never say "just edit X to do Y" without Claude reading the file first. Stale assumptions about file content cause subtle bugs.

**Changing scope mid-session**
If you realize a related task should also be done — finish and verify the current task first. Start a new session for the other task.

**Making manual Supabase changes without telling Claude**
If you ran a SQL migration manually, state it at the start of the next session. Claude cannot see Supabase schema unless it queries it.

**Skipping verification**
Do not move to the next task if the current one hasn't passed all three verification layers.

---

## Handling Failures

1. Do not start the next task. Fix the current one first.
2. Read the error carefully. Ask Claude to diagnose rather than immediately retry.
3. Check the dependency chain. If TASK-2.5 fails, verify TASK-2.3 and TASK-2.4 are actually working.
4. Revert if needed. Git is the safety net — commit after each working task.

---

## Session Sizing Reference

| Task type | Typical session |
|-----------|----------------|
| Hotfix / single bug fix | 5–15 min |
| Schema migration + code | 15–30 min |
| New API endpoint | 20–40 min |
| Type system refactor (many files) | 30–60 min |
| New dashboard route/page | 30–60 min |
| Context provider / complex provider | 45–90 min |

If a session exceeds 90 minutes without reaching acceptance criteria, stop, commit what works, and re-scope.
