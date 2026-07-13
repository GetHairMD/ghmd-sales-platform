# GHMD Sales Platform — CLAUDE.md

> Read this file at the start of every session. No exceptions.

## Project Identity

**GetHairMD Sales Platform** — a standalone Next.js / Supabase / Netlify application
purpose-built for prospect-to-close sales operations.

This is **entirely separate** from the GHMD Network Intelligence Platform (NIP).

| Item | Value |
|------|-------|
| Repo | `ghmd-sales-platform` |
| Deploy | `ghmdsalesplatform.netlify.app` (main branch auto-deploys) |
| Supabase project | `ghmd-sales-platform` · ID: `cprltmwwldbxcsunsafl` |
| NIP Supabase ID | `kjweckggegifjmmqccul` — **NEVER TOUCH** |
| NIP Netlify | `ghmdnetwork.netlify.app` — **NEVER TOUCH** |
| Monday.com board | `18419216445` |

## Stack

- **Frontend**: Next.js (App Router)
- **Database**: Supabase (PostgreSQL + RLS)
- **Serverless compute**: Netlify Functions (`netlify/functions/`) — NOT Supabase Edge Functions (none exist in this repo)
- **Deploy**: Netlify — `ghmdsalesplatform.netlify.app`
- **Maps**: Mapbox GL JS + Isochrone API (drive-time, not radius)
- **Demographics**: Census ACS API (B01001, B19001, B25105)
- **Phase 2**: Whisper + Claude API call scoring
- **Signing**: Box Sign (replaces DocuSign entirely — no DocuSign integration at any phase)
- **CRM stopgap**: AesthetiX / GHL (pipeline tracking only during build)

## Commands

```bash
npm run dev            # Next.js dev server (localhost:3000)
npm run build          # production build
npm run lint           # next lint
npm test               # vitest run (tests in src/lib/__tests__)
npm run log:export     # FROZEN — mirror is historical-only per decisions/DECISION_LOG.md notice; running this is a rule violation
npm run seed:demo      # seed demo data
npm run storybook      # Storybook on :6006
```

## Repo Layout

- `src/app/**` — Next.js App Router (`api`, `dashboard`, `territories`, `proposals`, `pipeline`, `prospects`, `p/`)
- `src/lib/**` — business logic (`territory-sizing*`, `addressable`, `census*`, `isochrone`, `proposals`)
- `lib/` — formula constants + census/npi helpers, **top-level, NOT `src/lib`** (see Formula Constants Location)
- `netlify/functions/` — serverless background compute (e.g. `size-territory-background.mts`)
- `supabase/migrations/` — timestamped SQL migrations (`YYYYMMDDHHMMSS_description.sql`)

## NIP Separation — Hard Boundary

The NIP Supabase project (`kjweckggegifjmmqccul`) is a completely separate production system
serving franchisee operators. **Zero shared DB, auth, or codebase.** Before any schema or data
operation, confirm you are connected to `cprltmwwldbxcsunsafl` (ghmd-sales-platform).

Never:
- Query across projects
- Share environment variables between projects
- Reference NIP table names or IDs in this codebase

## Standing Rules for Every Session

0. **Rule 0 — Confirm git remote before writing any files.**
   Run `git remote -v` at the start of every session. Remote must be `GetHairMD/ghmd-sales-platform`. If remote shows `GetHairMD/gethairmd-network` (the NIP) or any other unexpected repo: STOP immediately. Do not write any files. Do not open any sprint. Flag to Trace and wait for instruction. Run git fetch --prune immediately after remote verification. This removes stale remote-tracking refs for branches deleted on GitHub after squash-merge.
0-B. **Rule 0-B — CLAUDE.md first-line check.**
   Before any other action, run: `cat CLAUDE.md | head -1`
   Must return: `# GHMD Sales Platform — CLAUDE.md`
   If it returns anything else — STOP immediately and flag. Do not proceed.
0-C. **Rule 0-C — One repo per session.**
   Never open the NIP repo (`GetHairMD/gethairmd-network`) and the Sales Platform repo in the same Claude Code cloud session. If both are open, close one before proceeding.
0-D. **Rule 0-D — git status after cloud session.**
   After any Claude Code cloud session, run `git status` before assuming the working tree is clean. Cloud sessions can write files to disk without staging.
0-E. **Rule 0-E — NIP contamination scan (when in doubt).**
   Run: `git grep -r "kjweckggegifjmmqccul"` and `git grep -r "gethairmd-network"` in the Sales Platform repo. Both must return empty (or hits only in `docs/` or `CLAUDE.md` as boundary markers — never in `.ts` or `.tsx` files).
1. **Confirm Supabase project isolation** before any schema or data operation
2. All migrations go in `/supabase/migrations/` with timestamp prefix (`YYYYMMDDHHMMSS_description.sql`)
3. **RLS enabled on every table from creation** — never disabled
4. No secrets in code or git history — all env vars via Netlify + Supabase secrets
5. Census API responses cached in `territories.census_raw_data` — never re-fetched if < 90 days old
6. **Formula constants live in `/lib/addressable-market-constants.ts`** (top-level `lib/`, not `src/lib`) — never hardcoded inline
7. Every serverless function (Netlify) has error logging — no silent failures
8. Sprint acceptance criteria must pass before closing the sprint
9. Report blockers immediately — do not work around schema issues silently
10. All commits — including handoff files — must go through a PR. 
No direct pushes to main ever. Use feature/[name] for code branches 
and chore/handoff-vX.XX for handoff branches. Pilot merges after 
CI and deploy-preview pass.
11. **Coder reads the current handoff from `/handoffs/LATEST.md` at session start** — repo-hosted, never pulled from Drive (consistent with the no-Drive-fetch rule in Decision Logging)
12. **Rule changes are specified by quoting the rule's current text and its replacement** — never by rule number, since numbering differs across CLAUDE.md, the handoff, and docs/ files.
13. Do not arm self-check-in wakeups (ScheduleWakeup / cron self-poll) on draft PRs that are awaiting Trace's manual merge. Trace reports the merge; re-polling a soon-closed PR only creates orphaned timers that must be manually disarmed.
14. Every `ops.decision_log` entry must set `residual_risk` explicitly (`none` | `accepted` | `unresolved`) — never leave it at the column default without deliberately confirming `none` is correct. This field is read literally by the Second-Opinion Gate comparison logic and must never be inferred from the `reasoning` text field.
15. All PRs are merged via squash-merge only. Regular merge and rebase-merge are disabled at the repo level. Rationale: every ops.decision_log entry and handoff doc references a single commit SHA per PR — squash-merge preserves that 1:1 mapping; regular merge buries the referenced SHA under intermediate commits.
16. At the end of every session, before closing: run git checkout main && git merge --ff-only origin/main to fast-forward local main to match remote. If --ff-only refuses, stop and report — do not force. This ensures local never falls behind cloud sessions.
17. No task marked complete without citing a tool result from this session.
18. Subagents and Coder never write to ops.decision_log — Chat only, at phase close. Coder reports entry content and squash SHA to Chat for the write.

## Branch / Git Hygiene

**Branch deletion procedure (added 2026-07-03 — supersedes case-by-case `-D` confirmation for the merged case).**

Before deleting any local branch, check its PR state via `gh pr list --state all --head <branch>` (or equivalent). Then act on the PR state:

- **PR is MERGED** → content is confirmed in main *regardless* of what `git branch -d` / `git branch --merged` reports. Squash-merge (Rule 15) breaks git's ancestry detection, so `-d` will refuse a genuinely-merged branch and `--merged` will not list it — this is **expected, not a red flag**. Auto-proceed with `git branch -D` — **no case-by-case confirmation needed**. Still report what was deleted and why (PR # + MERGED state) in the session summary.
- **PR is CLOSED without merging, OR there is no PR / the branch is unpushed** → this is genuinely unmerged work. **Stop and get explicit confirmation before any `-D`** — exactly as with `feature/claude-code-review-hardening` (PR #47, retired per decision #33). That manual-confirmation pattern stays fully manual.
- **PR is OPEN** → **do not delete under any circumstance.** Flag to Trace.

Rationale: MERGED-but-squash-orphaned branches are routine auto-cleanup; unmerged / closed-unmerged / open-PR branches keep the full manual-confirmation gate. This is a scoped exception to the general `-d`-before-`-D` caution — it applies **only** to the confirmed-MERGED case, never to unmerged work.

## Session Safety Rules (added June 25, 2026)

These are enforced via Standing Rules 0-B (CLAUDE.md first-line check), 0-C (one repo per session),
0-D (`git status` after cloud session), and 0-E (NIP contamination scan). See those rules above for the
authoritative text — do not duplicate them here.

## Decision Logging (system of record)

- System of record for all consequential decisions is the Supabase table `ops.decision_log`
  (project cprltmwwldbxcsunsafl), NOT Google Docs. One sanctioned write path: Trace-directed
  Claude Chat sessions via the Supabase MCP connector, at phase close. Neither Coder nor any
  subagent writes to ops.decision_log under any circumstance. Coder reports entry content
  (status, residual_risk, related_pr, related_repo) and the relevant squash SHA to Chat, which
  appends the row. No Pilot, no manual Doc editing for routine logging. RLS unchanged
  (service_role only). Append-only, supersede-never-delete in force.
- The git mirror `/decisions/DECISION_LOG.md` is the durable backup, regenerated via
  `npm run log:export`. Never hand-edit it. Git history = supersede history.
- Google Drive is EXPORT-ONLY. The legacy Decision Log Doc
  (1SEZcEVzTw_DKHUjaij6jdK7BEMYDFWm0iB5BMTcdcOY) is a FROZEN pre-2026-06-27 archive —
  read-only, never appended.
- Supersede-never-delete: superseded entries set `superseded_by`; nothing is deleted.
  The field is binary — partial supersessions are explained in the entry prose, not the link.
- `ops.decision_log` holds legal-sensitive operator-selection criteria. It lives in the
  `ops` schema with service-role-only RLS, inside existing infra. Do NOT move decision
  logging to any third-party SaaS logger or outside the current security boundary.
- Coder does NOT fetch historical/source content from Google Drive directly. Trace pastes
  it into the session. Rationale: Drive Docs are rich-text and parse unreliably, and
  legal-flagged content requires a human-verified source, not an auto-pull.
- Session handoffs are repo-hosted at `/handoffs/` (markdown), NOT Google Docs. The latest
  handoff is always at `/handoffs/LATEST.md` — Coder reads it at session start (see standing
  rule #11). Versioned copies live alongside it (e.g. `/handoffs/GHMD_Sales_Platform_Handoff_vX.YZ.md`).
- Google Drive is reference + human-read only. System-of-record artifacts — the decision log
  and session handoffs — live in the repo or Supabase, never Drive.

## Formula Constants Location

All addressable market formula constants are in `/lib/addressable-market-constants.ts`.
Never hardcode prevalence rates, propensity rates, income band base rates, or the housing
cost adjustment formula inline in serverless functions or components. Always import from this file.

## Sprint Discipline

- Confirm current sprint with Trace at session start
- Do not begin Sprint N+1 work during a Sprint N session
- All acceptance criteria must pass before sprint is closed
- Current sprint status and open blockers live in `handoffs/LATEST.md`, read fresh each session (standing rule #11). The former `docs/SPRINT-STATE.md` tracker is retired.
- See `docs/QA-SPRINT-1.md` for Sprint 1 acceptance criteria

## Agent Roles

See `docs/AGENTS.md` for full role definitions.

- **Claude Chat**: PM + MCP ops (planning, Drive, Supabase console, Monday.com)
- **Claude Code**: All code, migrations, git operations, serverless (Netlify) functions
- **Claude Chrome**: GitHub UI fallback only (PR review, branch ops if CLI unavailable)

## Agent Names (locked June 25, 2026)

- Claude Chat = **Chat**
- Claude Code = **Coder**
- Claude Chrome = **Pilot**
- Use these names exclusively. "Claude Code" and "Claude Chrome" are retired to prevent mis-attribution.

## Environment Variables

All secrets via Netlify environment variables and Supabase project secrets.
Never committed to git.

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Sales project only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never expose to client |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Client | Restricted to proposals.gethairmd.com domain |
| `CENSUS_API_KEY` | Server only | Netlify function only |
| `GOOGLE_PLACES_API_KEY` | Server only | Netlify function only; restricted to server IP |
| `BOX_CLIENT_ID` | Server only | Box Sign (signing integration). **Not yet set in Netlify** — pending provisioning |
| `BOX_CLIENT_SECRET` | Server only | Box Sign. **Not yet set in Netlify** — pending provisioning |
| `BOX_WEBHOOK_SECRET` | Server only | Verify Box Sign webhook signatures. **Not yet set in Netlify** — pending |
| `GHL_WEBHOOK_SECRET` | Server only | Verify AesthetiX webhook signatures |
| `ANTHROPIC_API_KEY` | Server only | Phase 2: call scoring engine |
| `QA_EXEC_EMAIL` | Local (QA only) | QA-exec sign-in for deploy-preview QA. Read by `scripts/qa/preview-login.ts`. Trace holds locally — never in Netlify, never in a session |
| `QA_EXEC_PASSWORD` | Local (QA only) | QA-exec password. Same helper. **Never** hardcoded, echoed, committed, or pasted into an agent session |

## QA / Deploy-Preview Capability Stack

**QA-executive account.** A second executive identity exists solely for deploy-preview QA:
`internal_users.designation = 'executive'`, auth UUID `fc262e14-6080-4187-9aa9-84092a556f5c`
(provisioned 2026-07-13 — production now has two executives, where prior work assumed exactly
one; see decision #146 framing). It lets an agent walk exec-gated pages during a deploy-preview
QA pass without borrowing Trace's own credential.

**Preview-only is enforced by a script guard, NOT by the database.** There is a single Supabase
project (`cprltmwwldbxcsunsafl`) behind BOTH production (`ghmdsalesplatform.netlify.app`) and
every `deploy-preview-<PR#>--ghmdsalesplatform.netlify.app`. The QA-exec is therefore a *real*
executive on production too — nothing at the DB layer stops it signing into prod. The only thing
that does is the hostname guard in **`scripts/qa/preview-login.ts`**: `preparePreviewLogin(url)`
asserts the target hostname matches `deploy-preview-<PR#>--ghmdsalesplatform.netlify.app` and
**throws** otherwise, and credential retrieval is sequenced *after* that assertion so there is no
path to the password that skips it. Credentials come from `QA_EXEC_EMAIL` / `QA_EXEC_PASSWORD`
(above). **This guard is load-bearing — treat any change to it as security-sensitive.** Deploy-
preview QA automation must route sign-in through this helper; never read `QA_EXEC_*` directly and
never point QA-exec sign-in at a non-preview host.

## Key Reference Values

| Item | Value |
|------|-------|
| Austin Westlake baseline (v1/Sprint 1, HISTORICAL) | 5,483 addressable patients — superseded by the v3 drive-time anchor (decision #94, 59,699.47 @ 15-min); retained for historical record only, **not a current reference value** |
| Territory standard price | $179,000 (non-negotiable Phase 1) |
| Proposal subdomain | `proposals.gethairmd.com` |
| Drive folder | `1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z` |
| GHMD primary color | `#4681A3` (OCEAN) |
| GHMD accent color | `#E5B36A` (SUNLIGHTS) |
