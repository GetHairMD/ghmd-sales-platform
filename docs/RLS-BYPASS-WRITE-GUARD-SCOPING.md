# RLS-Bypass Write Pattern — Governed-Row Protection Scoping

**Status:** Scoping / investigation only. **No code, no migration, no trigger, no
constraint is written or applied by this document.** It turns the architectural gap
exposed by the 2026-07-10 Nashville incident (and its sibling) into an implementable
plan for a *future*, separately-authorized build session — same shape as
[`docs/V3-DRIVE-TIME-SCOPING.md`](V3-DRIVE-TIME-SCOPING.md).

**Authorization:** `ops.decision_log #123` (design-queue scoping). Opened by Chat.
**Prior context:** the two remediation PRs that closed the *known* instances of the
pattern — **PR #100** (`territories/[id]` render write) and **PR #101**
(`approve` route). Neither touched the pattern itself; this document is that follow-up.

**What this is not:** not a fix, not a migration sketch that gets applied, not related
to the #120/#117 v3 sizing work. Every option below is a *proposal* for Trace to choose
among; nothing here is a Coder decision.

> **RESOLVED — 2026-07-10.** All six flags in §5 were decided by Trace and built in
> PR #104, authorized by decisions **#124** (flags 1–4), **#125** (addendum — hardened
> flag 3 / piece 3 to value-scoped after an ultrareview adversarial finding), and
> **#126** (addendum — added the qa_locked DELETE guard). See `ops.decision_log`
> #124/#125/#126 and PR #104 for the as-built design; it differs in some particulars
> from the options sketched below (notably: piece 3 shipped **value-scoped**, not
> status-scoped as recommended in §4.2, and a symmetric **DELETE** guard was added
> beyond the UPDATE-only sketch in §4.C). This document is retained as the historical
> scoping record; it is **no longer a statement of current system behavior** — the
> "Status" line above describes the doc as written under PR #102, not the system today.
> Current behavior lives in `supabase/migrations/20260710140000_governed_row_write_guards.sql`.

---

## 0. Current-state findings (verified this session)

Everything below is read from the live repo and `cprltmwwldbxcsunsafl` this session.

| Fact | Evidence | Consequence |
|------|----------|-------------|
| The incident pattern is: a render/route computes data and **persists to `territories` via a service-role/admin client that bypasses RLS**, with protection left to a per-call-site conditional. | `page.tsx` used `createAdminClient(URL, SERVICE_ROLE_KEY)` (pre-#100); `approve/route.ts` uses `createServiceClient()`. | RLS — the database's own row-level defense — is not in the loop for these writes. |
| **`qa_locked` is the only governed-row flag in the schema**, and it exists **only on `territories`**. | `information_schema.columns` scan for `lock/frozen/protect/immutab/qa_/readonly`: sole hit is `territories.qa_locked boolean default false`. `prospects`, `deals`, `proposals` have no such flag. | The protected-row problem today is **`territories`-scoped**. `status` (`territories`, `territory_sizing_jobs`) is a lifecycle field, not a lock. |
| **`territories` RLS is a single coarse policy: `internal_users_all`, `cmd ALL`, unconditional for any internal user.** | `pg_policies`: one policy, `qual`/`with_check` = `EXISTS (SELECT 1 FROM internal_users WHERE user_id = auth.uid())`. | RLS encodes **no** `qa_locked` (or `sold`) protection. An *authenticated* internal user could overwrite a locked anchor just as easily as the service-role client. **"Just use RLS instead of bypassing it" does not solve this** — see §3. |
| A database **trigger fires regardless of client role**, including `service_role`. | Postgres semantics: `service_role` bypasses **RLS**, not **triggers**. Only `session_replication_role = 'replica'` (superuser-only) skips triggers. | A `BEFORE UPDATE` trigger is the **only** mechanism that catches every path — service-role, authenticated, and future call sites nobody has written yet. Foundation for Option C (§4). |
| `territories` has **no triggers today**. | `pg_trigger` on `public.territories` (not internal) = empty. | Explains the incident's un-bumped `updated_at` (no moddatetime trigger; the app `.update()` didn't set it). Also means adding a guard trigger is greenfield, no interaction with existing trigger logic. |

---

## 1. The pattern, precisely

A write is exposed to the incident class when **all three** hold:

1. it targets a table with a **governed row** (a row the business has frozen: a `qa_locked`
   QA anchor, or a `sold`/`reserved` territory with commercial-exclusivity semantics);
2. it goes through a **service-role/admin client** (or any client RLS doesn't constrain
   for governed rows — which, given the coarse `internal_users_all` policy, is *every*
   internal client); and
3. the only thing standing between the write and a governed row is an **application-layer
   conditional** the author had to remember to add.

The Nashville incident was a clean instance: a stale-cache page render (1: `territories`,
`qa_locked`) via the admin client (2) with no guard at all (3, absent).

---

## 2. Full inventory — every service-role/admin write in the app

Method: grep for `createServiceClient` / `createAdminClient` / `SUPABASE_SERVICE_ROLE_KEY`
across the repo, intersected with `.insert(` / `.update(` / `.upsert(` / `.delete(` call
sites and their `.from('…')` target (`*.ts`/`*.tsx`/`*.mts`). Crypto `.update()` calls
(`createHmac().update`) in `proposal/calendly.ts`, `proposal/gate.ts` are **not** DB writes
and are excluded.

### 2.1 Runtime service-role writes

| # | Site | Table | What triggers it | Governed table? | Row-level guard today |
|---|------|-------|------------------|-----------------|-----------------------|
| 1 | `src/app/(app)/territories/[id]/page.tsx:206` | `territories` | page render, V2_LEGACY path, stale census cache | **YES** (`qa_locked`) | ✅ `shouldRefreshV2Census` qa_locked guard (**PR #100**) |
| 2 | `src/app/api/territories/[id]/approve/route.ts:118` | `territories` | executive approve POST | **YES** | ✅ `qa_locked` 409 (**PR #101**) + pre-existing sold/reserved 409 |
| 3 | `src/lib/territory-sizing-jobs.ts:79,173,213,229` | `territory_sizing_jobs` | enqueue route + background compute | no (service-role-only table; `status` lifecycle, no locked rows) | n/a |
| 4 | `src/lib/census-bg-cache.ts:127` (via `census-tiger.ts:424`) | `census_block_group_cache` | background sizing compute | no (GEOID cache, upsert-by-key) | n/a |
| 5 | `src/lib/proposal/generate.ts:160,175` | `proposals` | rep "generate proposal" action | no locked flag, but **Trace-content-adjacent** | none (no governed flag to guard) |
| 6 | `src/lib/proposal/data.ts:64,78,95` | `proposal_sessions`, `proposal_events`, `activities` | **public** buyer proposal page (no auth session) | no (append-only telemetry) | n/a |

### 2.2 Authenticated-client writes (RLS-mediated — NOT in the incident class)

`ActivityLog.tsx:33` (`activities`), `DealStatusSelector.tsx:27` /
`FundingPrequalToggle.tsx:29` / `pipeline/actions.ts:99` / `prospects/new/page.tsx:18`
(`prospects`), `prospects/[id]/qualification-actions.ts:45,84,133`
(`qualification_reviews` / `qualification_review_notes` / `rep_call_grades`) — all use the
**authenticated** `createClient()` and touch no governed row. Out of scope, listed for
completeness so the inventory is exhaustive, not selective.

### 2.3 Scripts (manual, not runtime request paths)

`scripts/seed-demo.ts` writes `territories` (INSERT-once, `qa_locked=true`, **never
updates or deletes an anchor** — already the correct pattern), plus demo churn on
`prospects`/`deals`/`activities`/`qualification_*`/`proposals`. `scripts/verify-territory-sizing.ts`
writes `territory_sizing_jobs`. Scripts run under a human's explicit invocation; they are a
lower concern than unattended request paths, but a DB-level guard (Option C) would cover
them too, for free.

### 2.4 The bottom line of the inventory

- **Runtime service-role writes to a governed table = exactly two** (rows 1 and 2), and
  **both are now guarded** (PR #100/#101).
- **Every other** service-role write targets a cache, a telemetry/append table, the
  service-role-only jobs table, or `proposals` (no governed flag). None can overwrite a
  frozen business row today.
- So the count of **additional guard sites Option A would require *right now* is zero.**
  The exposure is entirely **forward-looking**: the territory **authoring / creation**
  and **resize** flows are still unbuilt (deferred in the handoff), and each is a likely
  future service-role write to `territories`. The pattern's risk is "the next write site,"
  not a currently-missing guard.

---

## 3. Why RLS is bypassed — necessity vs. convenience

Split by whether the service-role client is *structurally required* or merely convenient:

- **Structurally required (no authenticated user in context):**
  - the **background sizing function** (`size-territory-background.mts` → `runSizingJob`)
    runs from an internal POST with no user session → row 3 and row 4 (cache) must be
    service-role;
  - the **public buyer proposal page** has no auth session at all → row 6 telemetry must
    be service-role.
- **Convenience (an authenticated internal/exec user *is* in context):**
  - the **census render** (row 1) and the **approve route** (row 2) both execute inside an
    authenticated internal session; they *could* have used the authenticated client.
  - `proposals` generation (row 5) similarly runs in a rep session.

**But here is the finding that reframes the whole options question:** switching the
convenience sites to the authenticated client would **not** have prevented the incident.
`territories` RLS is `internal_users_all` — **unconditional ALL for any internal user**
(§0). An authenticated internal user is *permitted by RLS* to update any `territories`
row, `qa_locked` or not. RLS today draws the boundary at "is this an internal user," never
at "is this row frozen." So:

> The bypass is not what created the exposure. The exposure is that **no layer — not RLS,
> not a constraint, not a trigger — encodes the `qa_locked` invariant.** The service-role
> client merely made it easy to reach; an authenticated client reaches it too.

This is why "use RLS properly" is only a *partial* option (§4, Option B-variant) and why a
DB-level invariant (Option C) is the only durable answer.

---

## 4. Options for a durable fix

### 4.A — Per-call-site guards (status quo, now applied twice)
Add a `qa_locked` (and, where relevant, `status`) check at each service-role write to a
governed table, exactly as PR #100/#101 did.

- **Pros:** zero new infrastructure; already in place for both current sites; trivially
  reviewable per site.
- **Cons:** relies on **every future author remembering** to add the check — the precise
  failure mode that produced the incident. Coverage is invisible: nothing fails loudly
  when a new write site forgets. Additional sites required today: **0**; sites that must
  *remember* going forward: **every future `territories` writer** (authoring, resize, any
  new admin tool).

### 4.B — Shared mandatory guard helper
A single `assertTerritoryWritable(territory)` / `assertNotLocked(row)` utility that every
governed-table service-role write must call before `.update()`, raising on
`qa_locked` (and optionally `sold`/`reserved`).

- **Pros:** removes per-site boilerplate; one place to evolve the rule; a guardrail test
  (repo idiom) could assert "every service-role `.update('territories')` is preceded by
  `assertTerritoryWritable`" to make omissions catchable in CI.
- **Cons:** still an **application-layer convention** — a future write site (or a new admin
  script, or a direct MCP/SQL write) can simply not call it. Same fundamental risk class as
  A; better ergonomics and better *testability*, but not defense-in-depth. Does not cover
  writes that don't go through app code at all.

### 4.C — Database-level enforcement (recommended)
A `BEFORE UPDATE` **trigger** on `territories` that rejects any mutation of a `qa_locked = true`
row, regardless of which client or code path performs it — **including service-role and
including future call sites nobody has written yet.** A `CHECK` constraint is *not*
sufficient: a check constraint validates only the new row and cannot see the `OLD → NEW`
transition, so it cannot express "a locked row may not be changed." A trigger can.

```sql
-- SKETCH ONLY — not written, not applied this session. Illustrates shape/direction only.
create or replace function public.reject_qa_locked_territory_write()
returns trigger language plpgsql as $$
begin
  -- service_role bypasses RLS but NOT triggers, so this fires on every client.
  -- Strictest form: a locked row is immutable. The un-lock transition (and any
  -- legitimately-needed edit) is the open design question — see Flag 2.
  raise exception 'territory % is qa_locked and cannot be modified', old.id
    using errcode = 'check_violation';
end $$;

create trigger territories_qa_lock_guard
  before update on public.territories
  for each row
  when (old.qa_locked)          -- only fires for currently-locked rows
  execute function public.reject_qa_locked_territory_write();
```

- **Pros:** **defense-in-depth** — the invariant lives where the data lives; no application
  code has to remember anything, now or ever. Catches the service-role bg paths, the
  convenience paths, scripts, *and* ad-hoc MCP/SQL writes uniformly. Directly closes the
  "the next write site forgets" risk that A and B leave open.
- **Cons:** needs a migration (a future, separately-authorized build PR — this doc does not
  write one). Requires an explicit, deliberate **escape hatch** for the rare legitimate
  mutation of a locked row (un-locking; a corrected re-lock), which is itself a design
  decision (Flag 2). A too-strict trigger could block a legitimate future operation and
  surprise an operator; the escape-hatch semantics must be settled *before* build.

### 4.2 Recommendation
**Option C, optionally with B as a complementary application-layer nicety.** The §3 finding
is decisive: because neither RLS nor any constraint encodes `qa_locked` today, A and B both
leave the invariant enforced only by human memory across an open-ended set of future write
sites. Only C makes the database itself refuse to corrupt a frozen anchor — the same
defense-in-depth posture Hard Rule 3 already takes for RLS-on-every-table. B is worth adding
*on top* of C for clean app-layer error messages (a 409 with a friendly message beats a
raw trigger exception surfacing to a user), but B is not a substitute for C. **This is a
recommendation, not something Coder is authorized to build here.**

---

## 5. Flags requiring a Trace decision

Ordered roughly by how early a build session needs each answered.

1. **RLS coarseness is the root, not the bypass (§3).** `territories.internal_users_all`
   grants unconditional ALL to every internal user, so the governed-row invariant is
   enforced by *nothing* at the data layer. Decide the target posture: (a) DB trigger only
   (Option C), (b) tighten RLS to exclude `qa_locked` rows from UPDATE **and** add the
   trigger for the service-role paths RLS can't reach, or (c) accept app-layer guards
   (A/B) as sufficient. Recommendation: at least (a).
2. **Escape-hatch semantics for a locked row (§4.C).** The strict sketch makes a
   `qa_locked` row fully immutable. Real operations may need to *un-lock* an anchor
   (retire it), or fix a genuinely-wrong locked value. Options: allow an update **iff** it
   only flips `qa_locked → false`; or gate legitimate edits behind a session GUC / a
   dedicated admin RPC; or require a superuser `session_replication_role='replica'` window.
   This must be settled before the trigger is written — it defines what "locked" means.
3. **Should `sold`/`reserved` territories get the same DB-level protection?** They carry
   commercial-exclusivity + frozen-boundary semantics (§4.2 of the methodology; the approve
   route already refuses them at the app layer, and `sold_boundary_geom` is frozen by
   convention). Decide whether Option C extends to `status IN ('sold','reserved')` (whole-
   or partial-row), or whether the boundary-freeze is a *different* invariant better
   expressed as a column-scoped rule. These are not the same shape as `qa_locked` and
   shouldn't be conflated without a decision.
4. **Compatibility with decision #102's "human persist-review gate is the interim sanity
   check."** A `qa_locked` trigger does not conflict — QA anchors are reference fixtures,
   not real persist targets, and #102's review gate governs *approving real boundaries*,
   which a trigger would leave untouched for non-locked rows. Confirm this reading before
   build so the trigger isn't seen as overlapping the #102 gate.
5. **Scope beyond `territories`.** `qa_locked` exists only on `territories` today (§0), so
   Option C is single-table now. If future governed tables appear (e.g., a locked
   `proposals` snapshot, a frozen `deals` record), decide whether to repeat the per-table
   trigger or introduce a generic governed-row convention. Not needed now; flagged so it's
   a deliberate choice when it arises.
6. **`proposals` service-role write (row 5) posture.** `proposals` has no governed flag and
   is not in the incident class, but it is Trace-content-adjacent (proposal snapshots).
   Lower priority; flag only whether any protection is wanted there at all, or whether it
   stays an ordinary service-role write.

**None of these are Coder decisions.** They are surfaced for Trace/Chat before any build
session is authorized. Per the standing rules, the `ops.decision_log` entry for whichever
option is chosen is Chat's to write, not Coder's.
