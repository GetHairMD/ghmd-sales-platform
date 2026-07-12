# GHMD Sales Platform — Handoff v2.41

Date: 2026-07-11 | Prepared by: Chat (scoping) + Coder (build addendum at session close) |
Purpose: capture (1) the same-day scoping session that investigated the territory-authoring
"Coming Soon" gap, found most of it already built, and scoped the real remaining work into
`BRIEF-territory-creation-and-topbar-actions.md`; (2) the Coder session that **implemented
that brief** (see the Coder build addendum below); (3) the deferred legacy ArcGIS
sold-territory import (#141); (4) the stale-backlog correction (#142); (5) a Prospects-list
redesign shipped alongside. Supersedes v2.40.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only.

---

## Coder build addendum — brief IMPLEMENTED this session (2026-07-11)

The scoping narrative below (Chat) was written before any code ran. It has since been built.
Coder implemented `BRIEF-territory-creation-and-topbar-actions.md` in full on
`feature/territory-creation-topbar-actions`.

**What shipped (one PR):**
1. **Territory creation entry point.** New `POST /api/territories` (executive-gated, inserts a
   `status='draft'` row — schema-safe, `territories.status` has no CHECK constraint), a new
   `/territories/new` page (exec-only; non-execs redirect to `/territories`), and a
   `NewTerritoryForm` client component. A fresh draft deterministically resolves to
   `PENDING_REVIEW`, which renders the **existing, unmodified** `V3SizingPanel mode="size"`.
   The panel already sizes by `territoryId` (not ad-hoc center), so sold-boundary clipping
   (§8.4) applies for free — AC3 satisfied at the code level, not just UI. A "New Territory"
   button was added to the `/territories` list (exec-only).
2. **Location geocoding.** Per Trace's decision (address search + fallback): new server-side
   `GET /api/geocode` (Mapbox v6 forward geocoding via `MAPBOX_SERVER_TOKEN` — confirmed
   provisioned; server-side use sidesteps the browser token's referer restriction), with a
   manual lat/lng fallback in the form so a geocode miss never blocks creation.
3. **TopBar global search wired.** The former presentational dead-stub now queries prospects
   (`full_name`/`practice_name`) + territories (`name`) via `ilike`, client-side under the
   signed-in role's existing RLS (no RLS widened), with a results dropdown linking to detail
   pages. `designation` is now prop-drilled layout → AppShell → TopBar.
4. **Global quick-add** ("+ New" in the TopBar): New Prospect (all internal users) + New
   Territory (executive-only, gated on `designation`).
5. **Prospects list redesign.** Regrouped by `deal_status` (active/stalled/lost) via a new
   `groupProspectsByDealStatus` helper + the existing `HealthChip`; **excludes `archived=true`**
   (fixes the silent leak); **replaces the hard `.limit(50)`** with explicit "Show more"
   pagination (no silent 51-row cliff); fully tokenized off raw Tailwind. `prospects/new/page.tsx`
   was left untouched per the brief (still tracked separately).
6. **National map draft exclusion.** Per Trace's decision (hide drafts from map): new migration
   `20260711160000_territory_status_map_exclude_draft.sql` — `CREATE OR REPLACE` of
   `territory_status_map()` adding `status is distinct from 'draft'` to the WHERE clause,
   preserving byte-for-byte the prior `boundary_geojson` properties-stripping leak fix,
   SECURITY DEFINER + pinned search_path, and grants.

**Verification evidence (this session):**
- `npm run build` — clean; all new routes (`/api/geocode`, `/api/territories`,
  `/territories/new`) compiled and typechecked.
- `npm run lint` — clean (only pre-existing `<img>` warnings in untouched proposal files).
- `npm test` — **1096 passed** (1059 baseline + 37 new). Pure logic (geocode parse, ilike
  escaping, deal-status grouping) built test-first (TDD); UI wiring pinned with source-scan
  guardrail tests.
- **Local browser QA not run** — `.env.local` still lacks `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so
  the dev-server middleware 404s every authed route (known gap). All new UI is behind auth;
  verified via build + tests instead. Live browser QA belongs to deploy-preview.

**Review tier — ESCALATED to `ultrareview`.** The brief pinned `review` explicitly *because* it
had "no migration" and "doesn't touch the national-map surface." Trace's draft-exclusion
decision makes both false (a migration rewriting the national-map RPC, #121/#122 surface). Per
the brief's own §7 self-escalation clause, this PR now warrants `/code-review ultra`
(Trace-triggered; Coder cannot launch it).

**Decision-log — pending Chat write (Rule 18; Coder never writes `ops.decision_log`).** Entries
to append at phase close, with the squash SHA once merged:
- The build PR itself (`related_repo` = ghmd-sales-platform, `related_pr` = this PR,
  `status` = implemented, `residual_risk` = accepted — the migration must be applied to the live
  DB post-merge; "merged migration ≠ applied migration").
- The **draft-exclusion decision** (2026-07-11): drafts hidden from the national map via
  `territory_status_map()` (extends #121/#122/#132; `residual_risk` = none once applied).
- The **stale-backlog correction #142** (already scoped by Chat) is confirmed by this build:
  the "v3 authoring-flow polling UI — Unopened" line was wrong; the UI was already built and is
  now reachable via the creation entry point.

**Post-merge action (Trace/Chat):** apply
`20260711160000_territory_status_map_exclude_draft.sql` to the live Sales DB
(`cprltmwwldbxcsunsafl`) and confirm `territory_status_map()` no longer returns draft rows.

---

## State as of the scoping session (illustrative — verify live)

- Main HEAD at scoping-session start: `b4ddc5a` (PR #113). The Coder build session opened the
  build PR above; main advances on its squash-merge.
- Decision-log tip: **#142** (rows #141, #142 landed in the scoping session; the build PR's own
  entries + the draft-exclusion entry are pending Chat's write per the addendum).
- `get_advisors`: re-confirmed at scoping-session start, standing set only. The build adds one
  migration (national-map RPC) — re-run `get_advisors` after it is applied to the live DB.
- Open PRs: the territory-creation build PR (this session).

## What happened in the scoping session (Chat, before code)

### 1. Territory-authoring "Coming Soon" investigated — found mostly already built

Live-code read (not spec-reading) found the v3 sizing engine, poll route, approve route, and
**`V3SizingPanel` (+ `TerritoryBoundaryMap`) — a complete, already-wired size → poll → preview
→ approve UI** — live in `territories/[id]/page.tsx`. This contradicted the standing backlog
line "v3 authoring-flow polling UI — Unopened" (stale; see #142). The one genuine gap: **no
page/route created a brand-new `territories` row** — the small scope the brief (now built)
closed. Confirmed with Trace: overlap resolution (§8.4) clips against **sold** territories only
(reserved/pipeline deliberately not blocked). Also confirmed: Trace has **80+ already-sold
territories living only in ArcGIS Online**, not yet in the DB — so the sold-clip currently has
~nothing real to clip against. See #141.

### 2. Legacy ArcGIS sold-territory import — deferred, logged as decision #141 (OPEN)

Bulk import of the 80+ sold territories needs a Trace-side ArcGIS data-cleanup pass first
(dedupe sketches, consistent name+date, valid geometry, resolve overlaps, consistent schema)
before export/import. **Not started.** Does not block the territory-creation build — a
freshly-created draft sizing against zero real sold boundaries today is expected and will start
clipping once #141 lands, with no code change needed then.

### 3. Stale backlog claim corrected — logged as decision #142 (CONFIRMED)

The "v3 authoring-flow polling UI — Unopened" line (v2.39/v2.40) was factually wrong — the work
was done. Logged so a future session doesn't re-scope it. (Same failure class as the v2.40-era
#96 supersession-pointer gap.) **Confirmed again by the build session.**

### 4. Prospects list flagged as low-value-per-click and scoped for a redesign — now shipped

UX pass found: Dashboard is well-built and on tokens (validated). TopBar search was a
self-documented stub (now wired). No global "add" affordance existed (now added).
`prospects/page.tsx` used raw Tailwind, a hard `.limit(50)` with no pagination, and no
`archived` filter (all fixed in the build). **Trace's decision: keep the Prospects list but
restructure it to group by `deal_status` (Active/Stalled/Lost)** — a deal-health view distinct
from Pipeline (stage) and Dashboard (engagement). Shipped in the build.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| **Territory creation + TopBar search/quick-add + Prospects redesign** | Coder | **BUILT this session** — PR open, awaiting `ultrareview` + Trace merge |
| Apply `territory_status_map_exclude_draft` migration to live DB | Trace/Chat | **New — post-merge action** (see addendum) |
| Legacy ArcGIS sold-territory import (#141) | Trace | Deferred — blocked on Trace's ArcGIS data-cleanup pass, not started |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, per Trace 2026-07-11) | **Still live in production, by explicit ongoing decision** — not a lapsed cleanup item |
| Demo/test data cleanup (#128) | future Coder | Untouched, no rush |
| `docs/SALES-OS-SPEC.md` §4B / National Map amendment (#122) | Trace | Untouched, not urgent |
| Session E; Platform RBAC | Trace authorization | Unopened |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |
| `prospects/new/page.tsx` raw-Tailwind styling | future Coder | Real, tracked, explicitly out of scope for this PR (only `prospects/page.tsx`, the list, was tokenized) |

## Note on `AUTH_GATE_DISABLED`

Per Trace's explicit correction: this is **not** a lapsed residual risk to re-flag as forgotten
— it was a deliberate decision (#136/#137) to stop it blocking build momentum, made knowingly.
It remains live in production. Continue noting it in every go-live-readiness session, but do not
frame it as an oversight.

## Not This Session (escalate, don't creep)

Session E / Platform RBAC, Box Sign, the ArcGIS import, and the `docs/SALES-OS-SPEC.md` §4B
amendment all remain unopened/unauthorized.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
