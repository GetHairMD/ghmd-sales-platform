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
19. GHMD-CRM-003 (docs/GHMD-CRM-003.md, v1.0, decision #177) governs architecture and delivery order. Session E (SALES-OS-SPEC) is frozen — never resume E-4/E-5. No feature work outside the CRM-003 phase plan. Phase 0 security containment precedes all Phase 1 foundation work.

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
| `SUPABASE_SECRET_KEY` | Server only | **Preferred** Supabase service credential (modern `sb_secret_` key — not a JWT). Never expose to client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | **Deprecated fallback** — legacy `service_role` JWT, read only when `SUPABASE_SECRET_KEY` is absent/blank; removed once rotation completes (decision #199). Never expose to client |
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

**One name, different underlying credentials per store.** `SUPABASE_SECRET_KEY` is provisioned
separately in each credential store — Netlify env vars and the GitHub Actions repository secret
carry **different** `sb_secret_` keys under the same variable name, so either store can be
revoked independently and a compromise of one does not expose the other. Netlify secrets are
additionally scoped context-by-context (least privilege; the repo is public, so secrets must not
reach untrusted deploy previews).

**Every read goes through one module.** `src/lib/supabase/secret-key.ts` is the only place in the
repo that reads either credential variable; everything else calls `getSupabaseSecretKey()`. It
prefers `SUPABASE_SECRET_KEY`, falls back to `SUPABASE_SERVICE_ROLE_KEY` only when the preferred
one is absent/blank, throws on a whitespace-padded (malformed) value rather than trimming it, and
throws when neither is set.

The invariant is enforced in CI by `src/lib/__tests__/credential-read-sites.test.ts`, a whole-line
scan over **every git-tracked file in the repo, with no extension filter**, minus the prose
surfaces excluded by path (`docs/`, `handoffs/`, `decisions/`, `CLAUDE.md`). Type-agnostic scope is
load-bearing: an extension-filtered scan left `netlify.toml`, every `.sql` file and all `.json`
config outside enforcement. Tracked-only scope is equally load-bearing — a filesystem walk would
read `.env.local` and the failure message would print a live key.

**A scan failure never echoes line content.** It reports `file:line` plus which variable was named,
and nothing else from the line. Redacting "the part after `=`" was tried and is unsafe by
construction: `"SUPABASE_SECRET_KEY": "sb_secret_…"` in a tracked `.json` puts a quote between the
identifier and the colon, so a redaction pattern misses and the value lands in the CI log of a
**public** repo. Any redact-the-dangerous-part scheme must enumerate the syntaxes a value can hide
in; printing nothing from the line has no enumeration to get wrong. Assertions in that suite
compare counts and booleans for the same reason — a failing `toEqual` on raw lines would leak just
as effectively.

Either variable name appearing anywhere outside an exact allowlist fails the build. The allowlist
has **five** branches: (a) the resolver module (whole file); (b) `.env.local.example` — **only the
two bare `NAME=` placeholder lines, matched exactly**; (c) exactly two environment-mapping lines in
`.github/workflows/residual-risk-sweep.yml`; (d) one exact comment line in an already-applied,
immutable migration; (e) the three credential test suites — **only their two constant-declaration
lines each**. No path wildcards — for (b)–(e) the file is not exempt, only those lines are.

**`secret-key.ts` must never export a variable NAME.** An exported name is a read primitive: any
module can import it — or re-export it through an intermediary, so the eventual consumer neither
spells the identifier nor imports the resolver path — and then `process.env[thatConstant]`. It
exports `assertNotCredentialVarName` instead, a predicate that can refuse a name but cannot hand
one out. The three credential test suites spell the literals on **two declaration lines each**,
allowlisted by exact path and exact line, and manipulate env only via `vi.stubEnv`.

Defence in depth on top of that: **any file importing from `secret-key` is barred from computed
`process.env[…]` access and from aliasing `process.env`**; the sole exception is the generic
`env()` helper in `scripts/second-opinion-gate/overdue-rpc.ts`, which calls
`assertNotCredentialVarName` and **throws** on either credential name. That allowlist entry and its
runtime guard are a pair — never add one without the other. A repo-wide ban on computed env access
was rejected deliberately: ~10 unrelated legitimate sites use it.

**Every branch is exact-line, never shape-inferred.** A rule that tries to reject "assigning"
forms has to enumerate the ways a value can follow a name (`NAME=v`, `NAME = v`, `NAME: v`,
`# NAME v` with no separator at all) and that enumeration is never complete — two review rounds
found holes in exactly such rules. Consequently `.env.local.example` prose must **not** name either
variable; if it ever needs to, the line must be added to the allowlist deliberately.

**Rotation requires a deploy even though it requires no code change.** Env vars are captured per
deploy and service clients are process-cached: no existing deploy adopts an env change. After any
credential env change, force a fresh deploy in **every affected context** (production and each
preview/branch context under test) and confirm each is `ready` with `commit_ref` matched to the
intended SHA before verifying against it.

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

## Rep Provisioning (manual — E-0a, decision #150)

Reps are the second `internal_users.designation` value (`'rep'`; the domain is CHECK-constrained
to `'executive' | 'rep'`). There is **no self-serve invite flow** — provisioning is manual and
mirrors the QA-exec pattern exactly. **Hard Rule 6 applies identically to rep accounts: no
password ever routes through an agent session, is echoed, committed, or pasted.**

Procedure:
1. **Trace** creates the Supabase Auth user (`auth.users`) and sets the password **directly in the
   Supabase console** — never via any agent, never through Coder.
2. **Trace** provides Coder only: the new user's **auth UUID**, the rep's **full name**, and
   confirmation that the designation is `'rep'`.
3. **Coder** inserts the `public.internal_users` row: `user_id = <UUID>`, `designation = 'rep'`,
   `full_name = <name>`. (`internal_users.user_id` is an FK to `auth.users`, so step 1 must happen
   first.)

`full_name` is nullable — a rep may be provisioned before a name is supplied — so every UI surface
that renders it must fall back to a generic label on NULL, never crash or show "null".

## Key Reference Values

| Item | Value |
|------|-------|
| Austin Westlake baseline (v1/Sprint 1, HISTORICAL) | 5,483 addressable patients — superseded by the v3 drive-time anchor (decision #94, 59,699.47 @ 15-min); retained for historical record only, **not a current reference value** |
| Territory standard price | $179,000 (non-negotiable Phase 1) |
| Proposal subdomain | `proposals.gethairmd.com` |
| Drive folder | `1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z` |
| GHMD primary color | `#4681A3` (OCEAN) |
| GHMD accent color | `#E5B36A` (SUNLIGHTS) |
