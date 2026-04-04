# scale-up-v3 — Backlog

**Purpose:** Issues and improvement opportunities found during V2 Phase 6 execution, plus known remaining gaps not in scope for V2. Use this as the starting input for V3 planning.

**Status:** 🔜 Accumulated during Phase 6 (2026-04-02). Not yet triaged.

---

## How to use this document

Each entry has:
- **ID** — reference for task decomposition
- **Category** — Security / Data / UX / Perf / Code / Scale
- **Issue** — what the problem is
- **Context** — where it was found and why it matters
- **Suggested fix** — a directional recommendation (not a spec)

---

## Part A — Found During Phase 6 Execution

### CODE-01 — `no-control-regex` ESLint rule blocks inline control-character regex

**Category:** Code / DX
**Issue:** The ESLint rule `no-control-regex` fires on any regex using `\x00-\x1F` or `\x7F`, requiring a `// eslint-disable-line` comment on the exact line. Prettier then reformats chained `.replace()` calls across multiple lines, so a `// eslint-disable-next-line` comment placed before the chain misses the target line.
**Context:** Hit during V2-6.2 (`api.photo.ts` `sanitizeName`). Required two attempts to land the suppress comment correctly — an inline `// eslint-disable-line` on the specific `.replace()` line was the only reliable form.
**Suggested fix:** Either configure the ESLint rule to allow explicitly documented exceptions, or define a shared `CONTROL_CHAR_REGEX` constant in `constants.ts` that is constructed via `new RegExp(...)` to sidestep the rule entirely.

---

### CODE-02 — `@typescript-eslint/no-unnecessary-condition` blocks defensive null guards on Supabase Storage responses

**Category:** Code / DX
**Issue:** The Supabase Storage `.list()` and `.download()` APIs return discriminated unions (`{ data: T; error: null } | { data: null; error: Error }`). After a truthy `error` check, TypeScript narrows the `data` type to non-null, making any subsequent `data ?? []` or `!data` guard a lint error.
**Context:** Hit multiple times during V2-6.8 and V2-6.9. Required removing the null-fallback guards that were added defensively. This is correct behavior — but it can surprise developers who copy-paste patterns from the Supabase DB client, which uses non-discriminated unions and often needs `data ?? []`.
**Suggested fix:** Add a comment in `constants.ts` or a shared Supabase utility note explaining that Storage API responses are discriminated unions and don't need null fallbacks after error checks.

---

### SCALE-01 — Photo ZIP server-side cap is 25 photos (~50MB) — no graceful fallback UX

**Category:** Scale / UX
**Issue:** The `downloadPhotosZip` server function returns `{ tooLarge: true }` when the event has more than 25 photos. The current UI shows a `window.alert()` message directing operators to the CLI script. This is functional but jarring.
**Context:** Implemented as part of V2-6.9. The 128MB Cloudflare Workers memory limit is the hard constraint. The CLI `download-photos` script is the correct tool for bulk downloads, but the UX could be better.
**Suggested fix:** 
1. Replace `window.alert()` with a proper in-page error/info banner.
2. Consider implementing chunked ZIP: zip 25 photos at a time and download multiple files, or stream the ZIP (requires Cloudflare Workers streaming response support — check Wrangler/Workers docs first).
3. Alternatively, generate a list of signed download URLs and let the browser download them individually via a queued fetch.

---

### SCALE-02 — Photos page Storage `.list()` fetches all file metadata on every page navigation

**Category:** Scale / Perf
**Issue:** The paginated `getPhotos` server function calls `.list(folder)` without a limit to get the total count, then slices the result server-side. For events with 500+ photos, this fetches all file metadata on every page navigation — even though only 48 are rendered.
**Context:** Implemented during V2-6.8. This was a deliberate trade-off: Storage `.list()` has no built-in count endpoint, so fetching all metadata (names only, no image data) was the simplest approach.
**Suggested fix:** 
1. Cache the total count in a Supabase DB column on the `event_configs` table, incremented by the `submit-photo` use case. Then only fetch `limit + offset` metadata per page.
2. Or: create a `photo_count` materialized value in the `sessions` table that can be queried cheaply.
3. Or: accept the current approach — 500 filenames is ~50KB, well within Workers limits.

---

### DATA-02 — Upsert on (email, event_id) discards repeat-visit history

**Category:** Data / UX
**Issue:** V2-6.3 switched user creation to `.upsert()` on `(email, event_id)` to prevent duplicate rows. This is correct for deduplication, but it silently discards any value in knowing how many times the same guest visited a booth — which is useful for event engagement reporting.
**Context:** Raised after Phase 6 completion. The previous duplicate-row behavior was a bug, but the visit count insight it incidentally provided had value.
**Suggested fix:** Add a `visit_count` integer column to the `users` table (default `1`). In `user.repository.ts`, change the upsert to increment on conflict:
```sql
INSERT INTO users (...) VALUES (...)
ON CONFLICT (email, event_id) DO UPDATE SET
  visit_count = users.visit_count + 1,
  updated_at = now()
```
Supabase JS does not support `DO UPDATE SET ... + 1` directly via the client — use a raw SQL RPC or a Postgres function. Alternatively, query for an existing row first; if found, increment `visit_count` and update; if not, insert with `visit_count = 1`. Surface `visit_count` in the guests dashboard table.

---

### DATA-01 — `downloadCSV` on guests page exports only the current page, not all guests

**Category:** Data / UX
**Issue:** After V2-6.8 added pagination to the guests page, the "Export CSV" button calls `downloadCSV(guests, eventId)` where `guests` is only the current page's 50 records — not all guests for the event.
**Context:** The export bug was introduced by V2-6.8. Before pagination, `guests` contained all records. Now it only contains the current page.
**Suggested fix:** Create a separate `getAllGuestsForExport({ eventId })` server function that fetches all records without pagination, used only when the Export CSV button is clicked. Alternatively, add a "Export All" button alongside the paginated view.

---

### UX-01 — "Print & Download" button is disabled while `isSaving` but no tooltip explains why

**Category:** UX
**Issue:** After V2-6.5, the "Print & Download" button is disabled while `isSaving` is true. A guest who taps the button immediately after the result page loads gets no feedback explaining why the button is unresponsive — the "Saving your photo…" text is subtle and may not be noticed.
**Context:** Added during V2-6.5 in `ResultModule.tsx`. The saving indicator is in muted text below the button.
**Suggested fix:** When the button is tapped while `isSaving`, show a brief toast: "Still saving — please wait a moment." Or make the saving indicator more prominent (animated spinner, bolder text).

---

### PERF-01 — `getSession()` JWT validation still has a 1-hour revocation window

**Category:** Perf / Security
**Issue:** After V2-6.16, dashboard auth uses `getSession()` which validates the JWT locally without a network call. The trade-off is that a revoked Supabase session (e.g., operator account disabled) still grants dashboard access until the JWT expires (~1 hour).
**Context:** Documented as acceptable in the V2-6.16 task spec. Worth revisiting if operator account management becomes more active.
**Suggested fix:** Add an optional background `getUser()` call on a 5-minute interval inside the dashboard layout (using `setInterval` + a React ref to avoid memory leaks). This would catch revoked sessions within 5 minutes without adding latency to every navigation.

---

### SEC-01 — `sanitizeName` truncates at 100 chars but email and phone have no max-length guards

**Category:** Security
**Issue:** V2-6.2 added a 100-char max to `sanitizeName`, but `validateEmail` and `validatePhone` in `api.photo.ts` have no explicit max-length check. An attacker could send a 10,000-character string that passes regex validation (if the regex matches a prefix) and reaches the DB insert.
**Context:** Found during V2-6.2 review.
**Suggested fix:** Add `if (body.email.length > 254 || body.phone.length > 20) return json({ error: 'Invalid input' }, { status: 400 })` before the regex validators. 254 is the RFC 5321 max email length; 20 covers any E.164 phone number.

---

### CODE-03 — CSV export does not escape all special characters (formula injection risk)

**Category:** Security / Code
**Issue:** `downloadCSV` in `guests.tsx` wraps each cell in double-quotes and escapes internal double-quotes. However, it does not strip or escape leading `=`, `+`, `-`, `@` characters that spreadsheet applications (Excel, Google Sheets) interpret as formula prefixes. A guest name like `=HYPERLINK("http://evil.com","click")` would execute as a formula when opened.
**Context:** Found during V2-6.8 review of the CSV export function.
**Suggested fix:** Add a CSV formula injection guard: if a cell value starts with `=`, `+`, `-`, or `@`, prefix it with a single quote (`'`) or strip the leading character. This is a well-known CSV injection vector.

---

## Part B — Deferred from V2 (Explicit Carryover)

These items were explicitly marked "deferred to V3" in `scale-up-v2/02-backlog.md`. They are concrete work items, not new discoveries.

### CARRY-01 — AI provider fallback chain

**Category:** Resilience / Scale
**Issue:** When Replicate fails, the app errors out. There is no fallback to Google or any other provider — a single provider outage takes down AI generation for the entire event.
**Context:** Deferred from V2 scope. V2-6.21 added a user-friendly 503 message, but that is a UX patch, not a structural fix. A real fallback requires an `ai_jobs` table or an API contract change to support retrying with a different provider.
**Suggested fix:** Introduce an `ai_jobs` table that tracks provider, status, and retry count per generation attempt. `AiGenerationService` tries Replicate first; on 5xx, retries with Google. Result is written back to the job row. This decouples provider selection from the HTTP request lifecycle.

---

### CARRY-02 — Config version history and rollback snapshots

**Category:** Ops / Data
**Issue:** The flow builder (V2-Phase 4) lets operators edit and save `moduleFlow`. A "Discard changes" UX was built, but there is no snapshot history — if an operator saves a bad config, there is no way to roll back to a previous known-good state without manually editing Supabase.
**Context:** Deferred from V2 scope. Snapshots were out of scope for V2 but become important once real clients have live configs.
**Suggested fix:** On every `PATCH /api/config` save, write the previous `config_json` to a `config_snapshots` table with a timestamp and author. Dashboard shows a "Version history" panel with restore buttons. Keep the last N snapshots (e.g. 10) per event.

---

### CARRY-03 — Shared `packages/types` workspace

**Category:** Code / DX
**Issue:** `apps/web/src/types/module-config.ts` and `apps/frontend/src/types/module-config.ts` are manual mirrors. Any type change requires editing both files. A missed sync causes silent type drift between backend and frontend.
**Context:** Deferred from V2 scope (`01-scope.md`). Acceptable while the type surface is small, but will become a maintenance burden as V3 adds more module types and data models.
**Suggested fix:** Create `packages/types` as a pnpm workspace package. Move `module-config.ts` and `event-config.ts` there. Both apps import from `@photobooth/types`. Remove the `// MIRRORED` comment pattern entirely.

---

## Part C — Known Gaps Not Addressed in V2

These are items that were deferred from earlier scope and should be considered for V3 planning:

| ID | Category | Issue | Notes |
|----|----------|-------|-------|
| GAP-01 | Resilience | Session state is not persisted to SQLite mid-flow — a crash between `/camera` and `/result` loses all captured photos | Was deferred in CLAUDE.md constraints (Phase 0–2 not required) |
| GAP-02 | Ops | Electron auto-update is not implemented — kiosk updates require manual USB install | Tracked in MASTER-PLAN.md |
| GAP-03 | Ops | No operator-facing error dashboard — print failures, save failures, and email failures are only visible in Electron DevTools logs | Operators at events have no visibility into failures |
| GAP-04 | Scale | `event_id` defaults to `'evt_shell_001'` hardcoded in `submit-photo.usecase.ts` line 66 when no sessionId is provided — this is a fallback that should be removed or made explicit | Low risk while only one event runs at a time |
| GAP-05 | Data | SQLite `photo_results` offline backup has no sync-back mechanism — if Supabase is unavailable during an event and guests complete flows, those sessions are in SQLite but never uploaded | Partial saves are detectable but recovery is manual |
| GAP-06 | UX | Result page "Retry Result" and "Back to Home" both call `reset()` — no confirmation dialog, so a guest can accidentally lose their result before printing/downloading | Quick tap on wrong button loses session |
| GAP-07 | Perf | Config is cached for 60s via `Cache-Control` (V2-6.11), but the kiosk fetches config on every session start — there is no in-memory or SQLite config cache in the frontend, so every session triggers a network call | Low-latency network assumed; add frontend caching if flaky WiFi is a concern |
