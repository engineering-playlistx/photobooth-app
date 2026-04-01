# scale-up-v2 — Backlog

**Purpose:** Tracks all work inherited from `scale-up-v1` plus new V2 architecture tasks. Items are categorized by origin and priority. Full task decomposition (with per-task acceptance criteria) will be written once the architecture decisions in `01-scope.md` are answered.

---

## Part A — V1 Carryover (Tech Debt)

These are unfinished items from `scale-up-v1/06-backlogs.md`. Resolve before or during the early V2 phases — they affect production stability.

### P0 — Production Blockers

| ID | Issue | Origin | File(s) |
|----|-------|--------|---------|
| RISK-02 | Supabase upload failure leaves an irrecoverable partial save. If the network drops between the local SQLite write and Supabase upload, and the inactivity timer fires before the retry succeeds, the guest's record is permanently lost from the cloud. | `06-backlogs.md` | `apps/frontend/src/routes/result.tsx` |

**Note:** RISK-02 was labeled "Phase 6 existing" in V1 planning. It is now the first P0 item in V2. A background sync queue or session-state recovery mechanism is needed.

---

### P1 — Security

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| SEC-02 | Dashboard login shows raw Supabase error strings ("Email not confirmed"), confirming account existence | Map Supabase error codes to generic "Incorrect email or password" message | `dashboard/login.tsx` |
| SEC-03 | Name sanitization strips only `<>` — no max length, no control character filtering | Add max 100 chars + strip control chars | `api.photo.ts` |

---

### P2 — Data Integrity

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| DATA-02 | `hasSaved.current` is a `useRef` — resets on component remount, causing double-saves if user navigates back to `/result` | Replace with `sessionStorage` flag keyed on photo filename | `routes/result.tsx` |
| DATA-03 | No unique constraint on `(email, event_id)` in Supabase `users` table — duplicates possible | Add unique index; change repository to upsert | `user.repository.ts` + Supabase SQL |
| DATA-04 | Temp photo in `photobooth-bucket/temp/` not cleaned up if Replicate prediction creation fails (only cleaned on status poll) | Add cleanup in the catch block of `api.ai-generate.ts` | `api.ai-generate.ts` |

---

### P2 — UX

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| UX-01 | No visual feedback during Supabase save on result page | Show "Saving…" / "Ready" indicator near QR code area | `routes/result.tsx` |
| UX-02 | Inactivity timeout fires mid-generation if config timeout < AI generation time | Move suppression to a context-level `suppressInactivity` flag instead of per-route logic | `useInactivityTimeout.ts` |
| CODE-08 | `"DS-RX1"` fallback still hardcoded in print handler after Phase 3 supposedly removed it | Throw error if `printerName` is empty instead of silently falling back | `apps/frontend/src/main.ts` |

---

### P2 — Code Quality

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| TASK-B.08 / CODE-01 | `getKioskConfig()` typed as synchronous but called with `await` | Change type to `Promise<KioskConfig>` | `global.d.ts` |
| TASK-B.09 | Dashboard guest list and photo gallery load the full dataset — no pagination | Server-side pagination with page param | `guests.tsx`, `photos.tsx` |
| TASK-B.10 | Bulk ZIP downloads all photos into browser memory — crashes on 300+ photos | Move ZIP generation server-side (streaming response) | `photos.tsx` + new API route |
| TASK-B.11 | Print fires in parallel with Supabase upload — photo path may not be confirmed yet | Move `handlePrint()` to after upload + `/api/photo` both succeed | `routes/result.tsx` |
| TASK-B.12 / PERF-02 | `/api/config` returns no caching headers — every session triggers a fresh Supabase read | Add `Cache-Control: max-age=60, stale-while-revalidate=300` | `api.config.ts` |
| TASK-B.13 / DATA-03 | Duplicate entries possible (same as DATA-03 above — see that item) | — | — |
| TASK-B.14 | Email sending is disabled; success message says "email sent" | Re-enable email; fix attachment logic | `submit-photo.usecase.ts`, `email.service.tsx` |
| TASK-B.16 / CODE-04 | SQLite `JSON.parse` calls have no error handling — corrupt row crashes the renderer | Wrap in try/catch; return sentinel value on failure | `sqlite.ts` |
| TASK-B.17 / CODE-02 | `useEffect` in `index.tsx` missing dependency array — runs on every render | Add `[]` | `routes/index.tsx` |
| TASK-B.18 | No "last retake" warning on camera page | Show "This is your last retake" when at limit | `routes/camera.tsx` |
| TASK-B.19 / CODE-03 | `'photobooth-bucket'` string hardcoded in 3+ files | Extract to `utils/constants.ts` | Multiple files |
| PERF-01 | Dashboard auth check hits Supabase on every page navigation | Cache session in a short-lived store (Cloudflare KV or encrypted cookie) | `dashboard/_layout.tsx` |
| CODE-06 | `RacingTheme` type reference in `database.ts` may be stale after Phase 3 removed the type | Verify and remove any lingering references | `utils/database.ts` |

---

## Part B — V2 Architecture Tasks (New Work)

These are the core deliverables of this project. Full task decomposition will follow once the architecture decisions in `01-scope.md` (sections A–D) are answered.

### Module System Foundation

| Task | What | Depends on |
|------|------|-----------|
| V2-1.1 | Define `ModuleConfig` union type in both `apps/frontend` and `apps/web` — replace `moduleFlow: Array<string>` stub | Architecture decision D answered |
| V2-1.2 | Seed `event_configs` with typed `moduleFlow` array (current Shell 5-step flow) | V2-1.1 |
| V2-1.3 | Define module registry in frontend: map of `moduleId → React component` | V2-1.1 |

### Session Model

| Task | What | Depends on |
|------|------|-----------|
| V2-2.1 | Add `module_outputs JSONB` column to `sessions` table | — |
| V2-2.2 | Add `POST /api/session/start` endpoint — creates session row at the start of the guest flow | V2-2.1 |
| V2-2.3 | Update kiosk to call session/start on "Welcome" tap; propagate `sessionId` through flow | V2-2.2 |

### Dynamic Pipeline Renderer

| Task | What | Depends on |
|------|------|-----------|
| V2-3.1 | Migrate `PhotoboothContext` to generic session context (`moduleOutputs: Record<string, unknown>`) | Architecture decision C answered |
| V2-3.2 | Build module pipeline renderer — reads `moduleFlow`, renders each module component in sequence | V2-1.3, V2-3.1 |
| V2-3.3 | Migrate each existing module to the V2 interface (Welcome, Camera, ThemeSelection, AI, Result) | V2-3.2 |
| V2-3.4 | Remove hardcoded React Router routes for flow steps | V2-3.3 |

### Flow Builder (Dashboard)

| Task | What | Depends on |
|------|------|-----------|
| V2-4.1 | Flow builder UI — ordered list of modules with add/remove; per-module config panels inline | V2-1.1 |
| V2-4.2 | Save `moduleFlow` array changes via config editor | V2-4.1, TASK-4.3 in V1 |

### First New Module

| Task | What | Depends on |
|------|------|-----------|
| V2-5.1 | Mini Quiz module — 2–3 questions configured per event; writes `quizAnswer` to session context | V2-3.2 |

### V1 Carryover Closure

| Task | What |
|------|------|
| V2-6.x | Complete all remaining V1 carryover items from Part A above |

---

### Deferred V2 Items (Not Blocking V2 Completion)

The following are in scope for V2 but not required for the V2 definition of done. Plan them when Part B above is stable.

- AI provider fallback chain (TASK-6.1 from V1) — Replicate → Google → error. Requires resolving where to store retry params (Supabase `ai_jobs` or API contract change). See [V1 analysis](../scale-up-v1/04-task-decomposition.md).
- Config version history + rollback (UX-05 from V1 — "discard changes" is done, snapshots are not)
