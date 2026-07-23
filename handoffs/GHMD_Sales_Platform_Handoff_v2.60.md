# GHMD Sales Platform — Session Handoff v2.60

**Supersedes:** v2.59 (committed by PR #160; narrated PR #158 and PR #159). This is narrative
history, not a state source. Per decision #100, all current state — main HEAD, `ops.decision_log`
tip, open PRs, security-advisor status — is derived LIVE every session from git, `ops.decision_log`,
and `get_advisors`. Nothing here is authoritative for current state; where this document and live
state disagree, live state wins.

Live repository check confirmed `handoffs/LATEST.md` was at v2.59 immediately prior to this
document — v2.60 is the correct next version number.

---

## 1. Headline

The legacy Supabase JWT-based credential exposure documented in decision #199 has reached its
**final code-and-provider cutover**: PR #161 removed the last deprecated resolver fallback
branches from source, merged to `main`, deployed to Production, and — after that deployment was
independently verified — **Trace disabled the legacy JWT-based `anon` and `service_role` API keys
at the Supabase provider.** Post-deactivation verification passed on both the frontend (Production
`/prospects`) and the independent GitHub Actions consumer (workflow run `29973141888`, now
independently confirmed — see §5).

**This closes the legacy Supabase anon/service_role credential disposition specifically. It does
NOT close decision #199**, which remains OPEN/unresolved. The most significant open item is
**Census Bureau API-key provider-revocation confirmation**: Trace has reported completing the
replacement, deployment, and revocation-request steps, but **confirmation that the provider has
actually revoked the superseded key is still outstanding** (see §7) — and this progress has not
yet been appended as its own dedicated #199 milestone, which is itself a system-of-record gap that
**must be closed before any further #199 workstream, including the history scan, proceeds** (see
§9). The other remaining item is deferred non-Production `PROPOSAL_GATE_SECRET` context
verification.

---

## 2. Evidentiary classes used in this document

- **[derived]** — read live this session from git, the GitHub API, the Netlify API, or
  `ops.decision_log`, by Chat, this session.
- **[Codex-verified]** — independently performed/observed by Codex (via the Chrome extension)
  this session, and durably recorded in `ops.decision_log`. Distinct from `[user-reported]`:
  Codex directly performed the check itself, rather than Trace reporting an action Codex/Chat
  did not observe.
- **[user-reported]** — Trace or Coder console/local actions neither Chat nor Codex
  independently observed.

**No credential values, fragments, hashes, or masked suffixes are repeated in this document.**
Variable *names* are recorded; values are not.

---

## 3. What shipped — the full credential-containment sequence (item A)

Three PRs, in order, closed the code half of this incident:

| PR | Squash SHA | Merged | Scope |
|---|---|---|---|
| **#158** | `f70a967d75428c946b399fa5259c945f324e5526` | 2026-07-21T15:56:18Z | Service-credential compatibility layer (preferred `SUPABASE_SECRET_KEY`, temporary fallback `SUPABASE_SERVICE_ROLE_KEY`) |
| **#159** | `d917a7f4119eba0be998c30fa531467d6982e9e5` | 2026-07-22T15:59:53Z | Publishable-key compatibility layer (preferred `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_PUBLISHABLE_KEY`, temporary fallback to the two legacy anon variables) + the build-time read-site enforcement scanner |
| **#161** | `fe2e482c9f99b1d351e676db55b547070c84da57` | 2026-07-23T01:28:48Z | **Final cutover** — both compatibility layers become preferred-only; retired identifiers (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`) permanently denylisted in the scanner and permanently refused by `assertNotCredentialVarName`, never reintroducible as silent operational reads |

**[derived — main HEAD independently confirmed at `fe2e482c9f99b1d351e676db55b547070c84da57`
this session via a fresh commit-log read, not solely from PR or decision-log text.]**

PR #161 required one round of correction before merge: an initial draft used language implying
the *entire* rotation ("has been rotated out" / "rotation complete") was finished, when only the
consumer-store/source-code half was. Chat caught this, sent a narrow correction, and Coder fixed
all four flagged locations before the PR was classified and merged. This is recorded here because
it is the same category of precision failure this incident has repeatedly required catching — see
§8.

---

## 4. PR #161 merge, Production deployment, and post-merge verification (items B, C)

- **Merge SHA `fe2e482c9f99b1d351e676db55b547070c84da57`** — **[derived]**, confirmed both via
  the PR's own merge record and independently via a fresh `main` commit-log fetch this session;
  the two match exactly.
- **Netlify Production deploy `6a616e510bc5440007d182b6`** — **[derived]**, independently queried
  live this session (not taken from decision-log text): `state: ready`, `context: production`,
  `commit_ref: fe2e482c9f99b1d351e676db55b547070c84da57` (exact match), `published_at
  2026-07-23T01:29:45.747Z`, deploy time 54s, secret-scan result clean (3,522 files scanned, zero
  matches).

---

## 5. Provider-level legacy key deactivation and post-deactivation verification (items D, E, F)

- **Trace disabled the legacy JWT-based `anon` and `service_role` API keys** in the Supabase
  dashboard. **[user-reported]**
- **Codex independently observed the dashboard control's label change to "Re-enable JWT-based API
  keys,"** establishing that provider-side deactivation took effect. **[Codex-verified]** — Chat
  cannot independently observe Supabase console UI state and did not re-derive this.
- **Codex independently loaded `https://ghmdsalesplatform.netlify.app/prospects`** post-
  deactivation: the authenticated Prospects page rendered with no API-key or authentication
  error. **[Codex-verified]**
- **GitHub Actions workflow run `29973141888`** — **[Codex-verified].** Codex independently
  inspected this run live, in Chrome, after provider deactivation: title "Residual-Risk Overdue
  Sweep #6," status **Success**, repository `GetHairMD/ghmd-sales-platform`, head `fe2e482`. This
  is now durably recorded in both `ops.decision_log` #199 and #206, and this document treats it
  as Codex-independently-verified, not merely user-reported. **Honest evidence-boundary note,
  preserved rather than smoothed over:** Chat's own GitHub connector could not fetch this
  workflow run directly — Chat attempted both a direct API path and a web search this session and
  neither succeeded; no tool in Chat's current toolset exposes GitHub Actions run status. Chat is
  relying on Codex's independent, differently-sourced verification here, not asserting it
  independently derived the same fact through its own tools.

---

## 6. Decision-log state — verified live this session (item G)

| id | Status / residual | Binding | Subject |
|---|---|---|---|
| #192 | OPEN / unresolved | PR 153 | `spatial_ref_sys` grant exposure (SU-426558) |
| #196 | OPEN / unresolved | PR 154 | `st_estimatedextent` overloads (SU-426558) |
| **#199** | **OPEN / unresolved** | **PR 158** | Parent incident — credential exposure. **Verified live this session, full text re-read, not summarized from memory.** |
| #200–#205 | (see v2.59 — carried forward, not re-verified this session; no session activity touched them) | — | — |
| **#206** | **ADOPTED / none** | **PR 161** | Child implementation decision — PR #161's code vehicle and its post-merge/deploy/deactivation verification. **Complete. Verified live this session, full text re-read.** |
| **#207** | **ADOPTED / accepted** | PR-unbound (NULL) | Manual Second-Opinion Gate adjudication for PR #161 — the gate returned `NO_ISSUE`; escalation fired solely because Coder's classification block truthfully declared `coder_residual_risk: unresolved` (the pending provider-level deactivation, at the time of the gate run). Trace manually accepted. **Verified live this session, full text re-read.** |

`#206` is closed **ADOPTED/none and complete** — the specific work it governs (source cleanup,
merge, deploy, provider deactivation, post-deactivation verification) is done. `#207` adjudicates
only the gate-clear act and is intentionally PR-unbound, since #206 retains the sole PR #161
binding. **Neither #206's closure nor #207's adjudication closes, broadens, or narrows #199.**

**Precise distinction on #199:** during this close-out, **#199's `reasoning` field was appended**
with the verified Supabase deactivation/deployment/workflow evidence described in §5 — this is a
real, deliberate write, not nothing. What is genuinely unchanged is #199's **original decision
text, its `OPEN`/`unresolved` status, its `PR #158` binding, its `related_repo`, and its
`superseded_by` field (still NULL)**. "Append-only, supersede-never-delete" means exactly this:
the record grows, the original claim and its open status do not change. This document does not
write to #199 itself — the append already exists live, independently verified by re-reading
#199's full text this session.

---

## 7. Why #199 stays OPEN — precise, not broadened or narrowed (items H, I)

**#199's legacy Supabase anon/service_role disposition is complete** as of the events in §5. This
is the single largest item in #199's original exposure inventory, and it is done: provider-level
deactivation occurred and was verified against both the application's own frontend and an
independent server-side (GitHub Actions) consumer.

**What remains open under #199 — corrected account of Census, per Trace's report:**

- **Census Bureau API key (`CENSUS_API_KEY`) — replacement and revocation-request steps reported
  complete; provider revocation confirmation is the specific outstanding item.** Per Trace:
  a replacement Census key was created/activated; Netlify was updated and a fresh Production
  deploy completed; the authenticated Production Census-backed demand endpoint succeeded for a
  valid county request; the local Census key was removed; and the revocation request for the
  superseded key was sent to the provider. **What is NOT yet established is provider
  confirmation that the old key has actually been revoked** — a sent request is not a confirmed
  revocation, and this document does not upgrade it to one.
  **System-of-record gap, flagged rather than smoothed over:** #199's live `reasoning` text,
  re-read in full this session, contains **no dedicated Census milestone block** — unlike
  `FRED_API_KEY` and `MAPBOX_SERVER_TOKEN`, each of which has its own milestone paragraph
  documenting completed provider-side actions. #199's text records only that Census
  provider-revocation confirmation remains outstanding; it does not yet reflect the replacement/
  deploy/verification/local-removal/request-sent progress Trace has now reported. **This
  document does not claim "no replacement," "no request," or "zero disposition" for Census** —
  that would misstate what Trace has reported — but it also does not treat that reported progress
  as durably recorded until it is appended to #199 as its own milestone, which has not happened
  yet. **This gap is sequence-blocking, not merely noted: see §9 — the next session's #199 append
  must happen before the history-scan workstream proceeds, not alongside or after it.**
- **`PROPOSAL_GATE_SECRET` — Production is rotated and functionally verified; Deploy Previews and
  Branch deploys have new values set but NOT functionally verified** (each needs its own next
  legitimate deploy); **Preview Server & Agent Runners remains empty, with its actual runtime
  fail-mode still unverified** (designed fail-closed, never live-tested in that specific context);
  **Local development's Netlify-context value was deliberately removed**, relying on the code's
  own `NODE_ENV`-gated dev fallback.
- **Variable-wide scope hardening deferred** for `PROPOSAL_GATE_SECRET`, still blocked by the same
  Netlify console limitation (Value-only editing on the existing variable) recorded in prior
  sessions.

**What is fully dispositioned, confirmed by #199's own live text:** `SUPABASE_SERVICE_ROLE_KEY`/
`SUPABASE_ANON_KEY` (provider-deactivated, this session, §5); `FRED_API_KEY` (provider key
deleted, Netlify variable deleted, zero code consumers, confirmed by a fresh repo-wide code
search); `MAPBOX_SERVER_TOKEN` (replacement token issued with all optional scopes disabled,
old token deleted at provider, both Production consumers — geocoding and isochrone — verified);
publishable/secret-key source migration (item A, §3); local/GitHub/Netlify store cleanup for the
service credential (completed in an earlier session, carried forward, not re-verified this
session since no new activity touched it).

**#199 remains OPEN / unresolved, bound to PR #158, its original decision text and other core
fields unchanged.** This document does not close, broaden, or narrow it, and does not itself
write to it — see §6 for the precise append-vs-unchanged distinction.

---

## 8. Judgment calls, residual risk, deferrals (carried forward from v2.59, unaffected by this session)

- **No unused publishable guard.** An `assertNotPublishableVarName` was explicitly rejected for
  PR #159. The service path's equivalent guard is load-bearing only because a real generic
  dynamic env-reader calls it; the publishable path has no such reader, so an unused guard would
  create **false assurance** — worse than an honestly disclosed limitation.
- **PR #161's own precision correction, this session.** See §3 — an initial draft overstated
  "rotation complete" before the provider-level step had actually occurred; caught and corrected
  before merge. Recorded here as the same category of failure mode #199 exists to catch, and the
  same category of failure this document's §7/§9 sequencing correction exists to prevent from
  recurring at the decision-log level.
- **Accepted R7 residual (#204, disposed #205).** The contiguous-text scanner cannot completely
  enforce the read-site boundary: an identifier deliberately assembled at runtime in a
  non-importing file evades it. The accepted residual is a **governance / architectural-
  completeness limitation, not a confidentiality exposure** — the credential is intentionally
  publishable and access remains constrained by database authorization and RLS.
- **Gate-tooling issue — precisely scoped, separate future work.** Declaration integrity compares
  the classification block only against the sole PR-bound decision row; an acceptance recorded in
  a separate PR-unbound row is invisible to that comparison. Recorded for separate disposition.
- **Ruleset observation (unactioned).** Active ruleset "Protect main" (id 18145750) permits
  merge/squash/rebase, contradicting CLAUDE.md Rule 15's claim that regular merge and rebase are
  disabled. **[user-reported]** Flagged as a separate backlog finding, still not remediated.
- **Local untracked file — `.claude/settings.local.json`.** Not repository state; user-owned; do
  not delete or modify. Its presence was reconfirmed as the sole baseline worktree entry during
  the PR #161 verification harness work this session.

---

## 9. Next planned substantive workstream; execution requires separate explicit authorization (item K)

**The Census durable-record gap identified in §7 must close before the history scan proceeds.**
Presenting the scan as the very next action would repeat exactly the kind of sequencing error this
document exists to catch — reported-but-unrecorded progress sitting alongside a new, larger
workstream invites the same "did this actually happen or was it assumed" ambiguity #199 was
opened to prevent. The next session's required order is:

**Step A — Census append (blocking, must complete first):**
1. **Complete mandatory live bootstrap** (fetch canonical docs, re-derive state per decision
   #100 — nothing assumed from this or any prior chat).
2. **Re-read #199 live, in full**, before drafting anything.
3. **Draft a guarded, append-only #199 `reasoning` update** recording only the already-reported
   Census milestones (replacement key created/activated, Netlify updated, fresh Production deploy,
   authenticated demand-endpoint success, local key removal, revocation request sent) —
   **explicitly leaving provider revocation confirmation as pending**, and **leaving `status` at
   `OPEN` and `residual_risk` at `unresolved`**, unchanged. This is a narrower, single-purpose
   version of the same guarded-append pattern already used repeatedly in this incident's history.
4. **Obtain Trace's explicit approval of the exact draft wording** before any decision-log write —
   no write proceeds on assumed or implied authorization.
5. **Execute the single guarded append if and only if approved, then independently read it back**
   — occurrence count, unchanged core fields, no credential/value content — exactly as every prior
   append in this incident has been verified.

**Step B — git-history scan (only after Step A is complete and read back):**

**Next planned substantive workstream — not begun; execution requires separate, explicit
authorization distinct from Step A's approval.** A corrected full git-history secret scan of the
public repository. Self-contained constraints, so the next session does not need to re-read v2.58:

- **Repository visibility is public, and a current-tree scan does not discharge a full-history
  exposure review.** Anything ever committed, including to now-deleted branches still reachable
  in reflog/objects, remains potentially exposed regardless of current-tree cleanliness.
- **Scanning is read-only and must precede any remediation recommendation.** The scan produces
  findings; it does not itself decide or perform remediation.
- **No presumption of history rewrite.** Rotation/revocation at the credential source and
  current-tree removal are the **primary** containment actions — exactly the pattern already
  executed for the service credential, `FRED_API_KEY`, and `MAPBOX_SERVER_TOKEN` in this incident.
  Any history rewrite, force-push, or ref deletion is a **separate, higher-risk action** requiring:
  its own supporting evidence, a **separate reviewed decision** (not bundled into the scan
  authorization), **explicit authorization**, a backup/coordination plan for anyone with an
  existing clone, and its own rollout plan. The scan finding something is never by itself
  sufficient authorization to rewrite history.
- **Scanner output discipline — TruffleHog or any equivalent tool must never emit** raw findings,
  matched content, detector previews, values, fragments, entropy strings, or unredacted JSON into
  Chat, a terminal transcript, a CI log, a PR body/comment, an artifact, or any repository file.
  If raw machine output is unavoidable at some intermediate step, it must remain in a protected
  temporary location, be parsed into sanitized metadata only, and then be securely removed.
- **Sanitized output may include only:** detector/category, commit identifier, file path, line
  number (when reliably available), and status/disposition — **never matched material of any
  kind.**
- **Allowlist discipline mirrors what PR #161 already established for the live scanner:**
  allowlist entries must be narrow and exact — a specific rule plus an exact path/line, or a
  durable structural predicate, each with written justification. **No repository-wide,
  extension-wide, workflow-wide, directory-wide, or detector-wide wildcard exemptions**, ever.
- **The scan itself may not mutate refs, files, history, remotes, provider settings, or
  `ops.decision_log` state.** It is a read/report action only.

---

## 10. Fresh chat kickoff (item L)

**A fresh Claude chat kickoff prompt is created only after this handoff is merged to `main` via
its documentation-only PR (see §12) and that merge is independently verified on `main`.** Trace
has reviewed and approved this handoff's substance, and it is being committed via that PR now —
the merge itself and its independent post-merge verification are the two steps that remain before
a fresh kickoff prompt is created.

**That kickoff prompt must itself encode the Step A → Step B ordering from §9**: the Census
append-first sequence (bootstrap → re-read #199 → draft guarded append → Trace approval → execute
and read back) as the mandatory first substantive action, and the full git-history scan
guardrails (public-repo full-history scope, read-only-before-remediation, no-history-rewrite-
presumption, output-sanitization rules, narrow-exact-allowlist discipline, no-mutation constraint)
as the separately-authorized second workstream. The kickoff prompt must not present the scan as
available to start without Step A having completed and been read back first.

---

## 11. Deferred product requirement — preserved verbatim, not current functionality (item M)

**No decision row exists for this and none is implied by its presence here.** Recorded so it is
not lost, exactly as carried in v2.59 §8, with no invented implementation detail added:

- **Internal-only rep-management / relationship profile**, built inside the **existing Reps
  navigation area** (no new navigation surface):
  - **Authorized W-2 managers** see the reps **assigned to them**.
  - **Executives** have **broader/full visibility** across reps.
  - **Leif** has explicitly approved internal-analyst access and may maintain internal
    records/notes.
  - **1099 reps never see this surface**, under any circumstance.
  - Relationship/engagement metadata is tracked; **AI-generated email summaries may be stored as
    metadata** — this does **not** authorize full email-body retention.
  - **Leif may have Box access.**
- **Bulk cold-lead / outbound prospecting stays segregated** in a separate staging/intake area,
  outside the core deal-flow CRM, so cold lists do not clutter operational opportunities. This is
  not a decision to turn the CRM into a broad outbound generator.

---

## 12. Handoff-file convention

Per repository convention, `/handoffs/LATEST.md` and the versioned copy
`/handoffs/GHMD_Sales_Platform_Handoff_v2.60.md` **must be byte-identical.** Coder commits both
together, as a docs-only PR — no code, no migrations, no workflow changes — and that byte-identity
must hold at commit time and be verified as part of that PR.

---

## 13. Do NOT do, this session or the next, without separate authorization

- Do not begin the git-history scan before Step A (§9) has completed and been read back.
- **Do not claim provider revocation confirmation for the Census key until an actual provider
  response establishes it.** A sent request is not confirmation, and this document does not treat
  it as one. The next chat **may record or assess a received provider response** if and when one
  actually arrives — but **must not invent, assume, or infer one** into existence to close this
  item early.
- Do not attempt non-Production `PROPOSAL_GATE_SECRET` verification opportunistically — it is
  gated on an actual next legitimate PR/branch existing, not on convenience.
- Beyond committing this handoff via its documentation-only PR (§12), do not write
  `ops.decision_log`, or touch Supabase/Netlify/GitHub settings, on the strength of this document
  alone.
- Do not treat #199 as closed, narrowed, or broadened by this document, and do not conflate its
  live `reasoning` append (§5, §6) with a change to its original decision text or status.

---

## 14. Session-close accounting

This handoff was compiled from reads only: GitHub (PR #161, commit log, CLAUDE.md, LATEST.md),
Netlify (deploy record for `6a616e510bc5440007d182b6`), and Supabase (`ops.decision_log` rows
#199, #206, #207, full text, re-read multiple times across drafting to confirm no drift). One
evidence-boundary gap is disclosed rather than smoothed over: GitHub Actions run `29973141888`
could not be independently re-derived by Chat's own toolset; Chat relies here on Codex's
separately-sourced, independently-performed verification, now durably recorded in
`ops.decision_log`. Chat performed no repository write, no decision-log write, and no
console/credential action in the course of compiling this document — committing it to the repo is
Coder's action, via the documentation-only PR described in §12.
