# GHMD Sales Platform — Handoff v2.44

Date: 2026-07-13 | Prepared by: Chat, relayed via Coder brief | Purpose: close out PR #118
(`prospects/new` tokenization) and update the queue. Supersedes v2.43.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only — the values below are as-of-session.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `b31c13e`** (`b31c13e663085370c48756d696e716dea0837642`) — PR #118 squash-merged,
  parent `e5f028c`. This handoff PR (`chore/handoff-v2.44`) is the only thing after it.
- **Decision-log tip: unchanged at #147.** No new entry for PR #118 — standard-tier pure UI
  tokenization, explicitly assessed (by Coder in the brief, confirmed independently by Chat) as
  not requiring one. No consequential decision was made, only executed.
- **`get_advisors` (security): unchanged, standing set only.** PR #118 touched no schema, no
  RLS, no migrations — pure component/markup swap on one route. Not re-run this cycle since
  nothing could have moved it; confirm fresh at next session start regardless.
- **Open PRs: none** (this handoff excepted).

## What shipped this cycle

### PR #118 — MERGED (`b31c13e`)

`src/app/(app)/prospects/new/page.tsx` rewritten onto the design system: `full_name`/`email`/
`phone` → `Input`, submit → `Button` (`block`, `primary`, `loading` prop replacing the old manual
ternary), form wrapped in `Card`. Page shell brought in line with the tokenized prospects list
page (`mx-auto max-w-lg p-6 sm:p-8`). `source_channel` `<select>` styled inline with `Input`'s
exact token classes — no `Select` primitive exists yet in `src/components/ui/`, and one was
deliberately **not** built for this change (flagged as a one-line observation in the PR for a
future third-consumer trigger, not actioned).

Zero behavior change — `buildProspectInsert`, `handleSubmit`, all four field names, and all
five `source_channel` option values are byte-identical to before. This was the last untokenized
surface on `/prospects/new`; PR #114 tokenized only the list page and explicitly deferred this
form.

New comment-stripped guardrail test (`prospects-new-tokenize.test.ts`) mirrors the existing
list-page pattern: pins the primitive imports, the absence of raw `<input>`/`<button>` markup,
and the absence of raw `gray-`/`red-`/`blue-` utilities.

**Verification sequence.** Chat independently re-verified the diff twice — once against the
initial push (confirming zero logic change, correct primitive usage, exact token-class match to
the brief) and again after Coder added live deploy-preview QA to the PR body (confirming the
second edit was description-only, no new commit, head SHA unchanged, CI still green,
`mergeable_state: clean`). Deploy-preview QA (AC6/AC7) was run against `deploy-preview-118` at
390×844 — full form render, all 5 `source_channel` options present in order, typed-input
interaction confirmed via accessibility tree (a full-page screenshot capture hung on
renderer-side browser-pane infra, **not** a page defect — zero console errors, DOM and interaction
both clean). Submit was deliberately never fired against the preview, to avoid writing a test
row to the live backend — the submit contract's byte-identical-to-before status already made
this unnecessary to prove functionally. `npm test`: 1120/1120 (was 1110; +10 new, 0 regressions).
`npm run build`: `/prospects/new` compiles clean at 3.03 kB. `npm run lint`: clean (only
pre-existing unrelated `<img>` warnings elsewhere).

**Tier: standard, correctly** — no auth/RLS/data/money path touched, diff well under 300 lines,
no self-escalation trigger fired.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| Territory creation + TopBar search/quick-add + Prospects redesign | — | **SHIPPED** (PR #114, `5435b60`) |
| Deal Territories draft-visibility fix | — | **SHIPPED** (PR #116, `a9e2adc`) |
| `prospects/new/page.tsx` raw-Tailwind tokenization | — | **SHIPPED this cycle** (PR #118, `b31c13e`) |
| Territory Scouting full build | future Coder | **AUTHORIZED, brief sent, not yet built** (decision #146, **ultrareview** tier). New `territory_scouting_reports` table + executive-only RLS + new exec-gated routes (reuse the v3 engine's library fns, not `/api/territories/size`) + new page + nav wiring (`nav-items.ts` `Territory Scouting` entry is `comingSoon:true`, needs `href:'/territory-scouting'`) + `docs/SALES-OS-SPEC.md` §4B rewrite (add the missing **National Map** entry — live via #121/#122/#132 but never written into the spec — and correct the Territory Scouting item, whose current description actually describes what became the PR #114 New Territory flow). **This is the sole remaining outstanding brief.** |
| Session E / Platform RBAC | Trace authorization | **Still not yet authorized** — sequencing intent only ("then we move to Session E"), needs its own scoping pass before any build starts |
| TopBar global search — parallel nullable-status exposure | future Coder | **Flagged, not yet decided.** Same `IS DISTINCT FROM` trap as #116 if a draft filter is ever added there. Deliberately out of scope |
| Legacy ArcGIS sold-territory import (#141) | Trace | Deferred — blocked on Trace's ArcGIS data-cleanup pass, not started |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, per #136/#137) | **Still live in production, by explicit ongoing decision** — not a lapsed cleanup item (see note below) |
| Demo/test data cleanup (#128) | future Coder | Untouched. Includes concrete row `f0404c01` — delete at go-live |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |

## Note on `AUTH_GATE_DISABLED`

Unchanged from v2.43: this is a **deliberate, ongoing decision** (#136/#137), not a lapsed
oversight. Still live in production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
