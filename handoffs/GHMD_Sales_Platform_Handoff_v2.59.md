# GHMD Sales Platform — Session Handoff v2.59

**Supersedes:** v2.58 (committed by PR #157; it narrated the PR #156 route-removal work). This
is narrative history, not a state source. Per decision #100, all current state — main HEAD,
ops.decision_log tip, open PRs, security-advisor status — is derived LIVE every session from
git, ops.decision_log, and get_advisors. Nothing here is authoritative for current state; where
this document and live state disagree, live state wins.

---

## 1. Headline

Two credential-compatibility PRs merged since v2.58, closing the *code* half of the credential
migration for both the service credential and the public credential:

- **PR #158** — service-credential compatibility layer (one Supabase secret-key resolver +
  apikey-only sweep). Squash SHA `f70a967d75428c946b399fa5259c945f324e5526`.
- **PR #159** — publishable-key compatibility layer (app + gate resolvers, apikey-only
  declaration RPC, and the mechanically-enforced read-site scan). Squash SHA
  `d917a7f4119eba0be998c30fa531467d6982e9e5`.

**Decision #199 remains OPEN / unresolved**, bound to PR #158. It is not closed by either
merge. Its closure is now additionally coupled to the publishable rollout — see §6.

v2.58's §7 recommended order was followed through store-level rotation for the *service*
credential and extended with an unplanned but necessary publishable lane, which v2.58 did not
anticipate.

---

## 2. Evidentiary classes used in this document

Because this session mixed independently-derivable facts with console-only actions, each claim
is labelled:

- **[derived]** — read live this session from git, GitHub API, or `ops.decision_log` by Chat.
- **[user-reported]** — Trace or Coder console actions Chat cannot independently observe
  (Netlify/GitHub/Supabase console state, local machine state, suite/lint/build execution).
  Recorded as reported, not as independently verified.

**No credential values or fragments are repeated in this document**, by name-only convention.
Variable *names* are recorded; values are not.

---

## 3. What shipped — PR #158 (service-credential compatibility)

**PR:** #158 — `fix(security): credential compatibility layer — one Supabase secret-key
resolver + apikey-only sweep [ultrareview]`. Tier: ultrareview.
**Merge:** squash-merged to `main` at full SHA
`f70a967d75428c946b399fa5259c945f324e5526`, merged_at **2026-07-21T15:56:18Z**. **[derived]**
Final stats: **17 files, 11 commits, +1,354 / −62**; feature branch `feature/credential-compat`
deleted.

- Introduced `src/lib/supabase/secret-key.ts` — a single resolver preferring
  `SUPABASE_SECRET_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY`, throwing on padded /
  malformed values and throwing (naming both variables) when neither is set. Literal
  `process.env` dot accesses; variable names module-private; no exported name. **[derived —
  file read at the merge SHA]**
- Swept the service-credential consumers onto the resolver and made the residual-risk sweep's
  raw request apikey-only.
- Reached merge only after nine classified Second-Opinion-Gate rounds (R1–R6, R8, R9 each a
  real defect fixed-not-cleared; R7 the sole disclosed residual) plus a declaration-integrity
  pass. **[user-reported]**

**Decision #202 — ADOPTED / accepted, PR-unbound** (`related_pr` / `related_repo` NULL,
mirroring the #201 precedent). Adjudicated the R7 bounded-limitation gate-clear only; it did
not close #199. **[derived]**

---

## 4. Service-credential work Trace completed (console) — store-level, source deactivation pending

**This section exists to prevent a false reading of §5.** PR #159 itself performed no
credential or environment action. That is *not* the same as saying no credential or environment
actions occurred during the overall session. For the **service** credential, Trace completed
**store-level provisioning, verification, and legacy-variable migration/removal**. This is
deliberately *not* described as a full rotation sequence, because **source-level legacy
deactivation remains outstanding.**

All of the following are **[user-reported]** — Chat verified none of these completion actions
directly. No credential value or fragment is repeated in this handoff; the original incident
did place plaintext values into Chat and is documented in decision #199.

- Modern secret keys provisioned separately for **Netlify Production (Key N)**, **GitHub
  Actions residual-risk sweep (Key G)**, and **Coder/local scripts in the ignored, untracked
  `.env.local` (Key L)** — distinct, independently revocable credentials under one variable
  name per store.
- Netlify Production both-vars and then new-only deployments were `commit_ref`-matched and
  authenticated read paths passed.
- GitHub both-vars and then new-only workflow runs passed.
- The legacy service-role variable was **removed** from Netlify, the GitHub repository, and
  Coder's local `.env.local`.
- Coder's local Key L verification passed: preferred variable present and well-formed, legacy
  variable absent, file untracked/ignored, resolver selected preferred, read-only HEAD/count
  request succeeded.

**Explicitly pending:** the legacy Supabase keys have **not** been deactivated at source. See
§6 for why that step is blocked and what must be reverified before it is attempted.

Pre-provision governance (A1–A3, B1) was completed before any key creation: #199's exposure
inventory was re-read; the resolver was confirmed live in the production deploy with
`commit_ref` matched **[derived]**; the credential-store × context matrix was built
presence-only; and the Netlify sensitive-variable policy was confirmed as
*"Untrusted deploys — Require approval"* **[user-reported]**, carried as a standing operational
control: an untrusted deploy must never be approved without reviewing author and changes.

---

## 5. What shipped — PR #159 (publishable-key compatibility)

**PR:** #159 — `feat(security): publishable-key compatibility layer — app + gate resolvers,
apikey-only declaration RPC [ultrareview]`. Tier: ultrareview.
**Merge:** squash-merged to `main` at full SHA
`d917a7f4119eba0be998c30fa531467d6982e9e5`, merged_at **2026-07-22T15:59:53Z**, merged by
`traceh-ghmd`. **[derived]** Final head `f5fd2ca71d589346db0e7d32079f24cf956b8e50`;
9 commits, 18 files, +2,500 / −90.

### Code
- `src/lib/supabase/publishable-key.ts` — app resolver preferring
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, temporary fallback
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`; whitespace-only means absent; padded non-blank throws;
  neither present throws naming both. Literal dot accesses (required for `NEXT_PUBLIC_`
  static substitution). No `assertNotPublishableVarName` guard — deliberately omitted; see §7.
- `scripts/second-opinion-gate/publishable-key.ts` — separate CI resolver preferring
  `SUPABASE_PUBLISHABLE_KEY`, fallback `SUPABASE_ANON_KEY`.
- `scripts/second-opinion-gate/declaration-rpc.ts` — extracted declaration-integrity request
  builder, credential on `apikey` only, never Bearer.
- `client.ts`, `server.ts`, `middleware.ts` route through the app resolver.
- `.env.local.example` gains a blank modern placeholder above the retained legacy placeholder.
- `.github/workflows/second-opinion-gate.yml` maps both public credentials during
  compatibility, so an absent modern secret resolves as absent and the fallback works.

### The enforcement machinery (four gate rounds of real defects, all fixed not waived)
- `scripts/security/read-site-scan.mjs` — dependency-free shared scanner holding both
  policies, invoked from `next.config.mjs` at config evaluation. Netlify's build command is
  `npm run build`, and `netlify/ghmdsalesplatform/deploy-preview` is the **only** required
  status check on `main`, so a prohibited read site now fails a required check with **no
  ruleset change and no console action**.
- Fail-closed at three levels: **enumeration** (tracked-files-only via git metadata, never a
  filesystem walk; throws if git is missing, errors, or enumerates zero files);
  **per-file read** (a read failure throws rather than yielding zero hits — the caught error is
  never bound, rethrown, or stringified, so no OS text, errno, absolute path, file content, or
  credential fragment can reach a public build log); and **positive presence**
  (`assertRequiredReads` requires each of six critical literal reads to occur exactly once in
  its designated tracked file — zero, duplicate, altered, or moved-to-another-file all fail
  closed; line numbers are not pinned).
- Documentation-accuracy correction across three prose surfaces (publishable suite, PR-body
  gate spec, service-policy comment), each of which under-counted its allowlist branches by
  omitting `policyModule`. Prose only; proven mechanically by an empty non-comment diff.
- `.github/workflows/pr-tests.yml` — unprivileged full-suite run on PR head (`pull_request`,
  `contents: read`, no secrets, `persist-credentials: false`). **Staged depth, NOT a merge
  gate.** It becomes mechanically required only if Trace later adds its exact check context to
  ruleset 18145750.

### Verification at final head **[user-reported]**
2010 tests passing across 77 files; lint exit 0 (two pre-existing warnings); build exit 0;
PR Tests green; required Netlify deploy-preview green; a remote A/B negative-control rehearsal
(`6d251e4` green → `ac58100` planted name-only read red → `6c81121` revert green) proving the
scanner actually executes on PR head.

### What PR #159 itself did NOT do
No key creation, no environment-variable change, no deployment, no legacy-variable removal, no
Supabase deactivation. **The publishable code is inert until its rollout runs under separate
authorization.** This statement is scoped to PR #159 only and does not contradict §4.

---

## 6. Decision-log state (recorded as narrative; re-derive per #100)

Verified live this session **[derived]**:

| id | Status / residual | Binding | Subject |
|---|---|---|---|
| #192 | OPEN / unresolved | PR 153 | `spatial_ref_sys` grant exposure (SU-426558) |
| #196 | OPEN / unresolved | PR 154 | `st_estimatedextent` overloads (SU-426558) |
| **#199** | **OPEN / unresolved** | **PR 158** | credential-exposure incident |
| #200 | ADOPTED / none | PR 156 | legacy `/proposals/[prospectId]` containment |
| #201 | ADOPTED / accepted | PR-unbound | HR7 gate clear, PR #156 |
| #202 | ADOPTED / accepted | PR-unbound | HR7 gate clear, PR #158 |
| #203 | ADOPTED / none | PR 159 | publishable-key compatibility adopted |
| #204 | ADOPTED / accepted | PR-unbound | HR7 acceptance, inherited R7 limitation |
| #205 | ADOPTED / accepted | PR-unbound | HR7 disposition, final head `f5fd2ca`, run 29934504615 |

`#203` is the sole PR-159 binding; `#204` and `#205` are PR-unbound because the
`(lower(related_repo), related_pr)` unique partial index reserves that binding. Neither #199
nor any prior decision was rebound or superseded.

### Why #199 stays OPEN

**Current operational understanding [user-reported], which MUST be reverified directly in the
Supabase console immediately before any deactivation action:** Supabase's legacy API-key
deactivation is understood to cover the legacy `anon` and `service_role` keys **together**,
as a single combined switch. The application still actively uses the legacy anon credential, so
deactivating under that understanding would break the app and the Second-Opinion Gate.

This is a **console behavior that can change**, not an unconditional platform guarantee. Do not
treat it as settled: reverify the actual deactivation granularity in the Supabase console at
the moment of action, and re-plan if the granularity differs from this understanding.

Under the current understanding, service-role source deactivation — the final act of #199
closure — is **coupled to and blocked by the publishable migration**.

#199 closes only when **all** of the following hold: every exposure store named in #199's own
inventory is dispositioned — the service credential across Netlify / GitHub Actions / local,
plus **`PROPOSAL_GATE_SECRET`**, **`CENSUS_API_KEY`**, **`FRED_API_KEY`**, and
**`MAPBOX_SERVER_TOKEN`** (categories re-read live from #199 this session **[derived]**); the
publishable rollout has completed through new-only verification; the combined legacy
anon/service_role deactivation has been safely sequenced, executed, and verified against
reverified console granularity; and closure is confirmed against live state rather than
inferred from merge or deploy status.

**This document authorizes no rollout action.**

---

## 7. Judgment calls, residual risk, deferrals

- **No unused publishable guard.** An `assertNotPublishableVarName` was explicitly rejected.
  The service path's equivalent guard is load-bearing only because a real generic dynamic
  env-reader calls it; the publishable path has no such reader, so an unused guard would create
  **false assurance** — worse than an honestly disclosed limitation.
- **Accepted R7 residual (#204, disposed #205).** The contiguous-text scanner cannot completely
  enforce the read-site boundary: an identifier deliberately assembled at runtime in a
  non-importing file evades it. Runtime nuance, stated precisely: a computed `NEXT_PUBLIC_*`
  read is not statically substituted and may resolve `undefined` in browser/edge bundles, but a
  deliberately assembled `process.env` identifier **in the Node/server runtime may resolve**.
  The accepted residual is therefore a **governance / architectural-completeness limitation, not
  a confidentiality exposure** — the credential is intentionally publishable and access remains
  constrained by database authorization and RLS. Stronger structural controls (intercepting
  dynamic environment access, or a repository-wide mandatory environment-access abstraction) are
  **separate future work**, ruled out of PR #159's scope.
- **Gate-tooling issue — precisely scoped, separate future work.** Declaration integrity
  compares the classification block **only against the sole PR-bound decision row**. When an
  accepted residual is recorded in a *separate PR-unbound row* (here #204 alongside PR-bound
  #203 at `residual_risk: none`), the gate has no mechanism to observe that acceptance:
  setting `coder_residual_risk: accepted` fails `verify-risk-mismatch`, and leaving it `none`
  causes the gate to re-derive the accepted residual. This arises from **that specific
  configuration** — an acceptance held in a PR-unbound row while integrity recognizes only the
  PR-bound row — **not from every PR carrying accepted risk categorically.** Recorded for
  separate disposition; not a PR #159 change.
- **Ruleset observation (unactioned).** Active ruleset "Protect main" (id 18145750) applies to
  `refs/heads/main` with no bypass actors; its only required status check is
  `netlify/ghmdsalesplatform/deploy-preview` (strict=false). The Second-Opinion Gate is
  **process-enforced, not mechanically required**. The ruleset also permits merge/squash/rebase,
  which contradicts CLAUDE.md Rule 15's claim that regular merge and rebase are disabled.
  **[user-reported]** Flagged as a separate backlog finding; not remediated in PR #159.
- **Local untracked file — `.claude/settings.local.json`.** This is **not repository state**
  and was correctly excluded from both PR #158 and PR #159. It is **user-owned: do not delete
  or modify it.** It is not governance-neutral — it may affect local Claude/Coder behavior, so
  treat unexplained local tooling differences as potentially originating there before
  attributing them to repository state.

---

## 8. Deferred product requirement (preserved; NOT a decision)

Recorded here so it is not lost; **no decision row exists and none is implied.**

- **Internal-only rep-management / relationship profile.**
  - **Authorized W2 managers** see the reps **assigned to them**.
  - **Executives** have **full visibility**.
  - **Leif** has the **explicitly approved internal analyst access** and **may maintain
    internal records/notes**.
  - **Reps never see this surface.**
  - **Cadence is as-needed, not universal** — this is not a standing per-rep reporting
    obligation.
  - **AI-generated email summaries may be stored as metadata.** This does **not** imply or
    authorize full email-body retention.
  - **Box access may extend to Leif.**
  - **Keep this under the existing Reps navigation** rather than adding new navigation clutter.
- **Large cold-lead lists stay outside the core deal-flow CRM**, in a separate outbound
  staging / intake area, until a lead is qualified. **There is no decision to turn the CRM into
  a broad outbound generator.**

---

## 9. Standing items that remain SEPARATE from the credential lanes

Neither PR #158 nor PR #159 touched any of these:

- **#192 / #196 — Supabase ticket SU-426558.** `spatial_ref_sys` grant exposure and the three
  `st_estimatedextent` overloads. Supabase Support has **offered a PostGIS relocation**;
  that offer is **PENDING EXPLICIT AUTHORIZATION and is NOT approved.** **[user-reported]**
  Keep this entirely separate from credential rollout — it is a different remediation track
  with its own blast radius.
- **SECURITY DEFINER surface review**, **leaked-password protection**, and
  **`AUTH_GATE_DISABLED` removal** remain standing pre-live gates.
- **Hard Rules 10–11 stand:** no proposal link to any prospect until the standing advisors are
  remediated and logged, and no real prospect or representative data before the Security
  Containment and Foundation MVP milestones are formally signed off (CRM-003).
- **Git-history secret scan** remains parked, still requiring the four corrections listed in
  v2.58 §6 before any brief is sent to Coder.
- **Option B / computed-`process.env` repo-wide hardening** remains separate queued work,
  deliberately not filed as a backlog decision row.

---

## 10. Next authorized sequence (do NOT execute here)

1. **Review this v2.59 artifact.**
2. **Mechanical Coder docs-only PR** committing `handoffs/LATEST.md` and
   `handoffs/GHMD_Sales_Platform_Handoff_v2.59.md` **byte-identical**. Docs-only; no code, no
   migrations, no workflow changes.
3. **Merge that PR.**
4. **Then, separately, plan the publishable-key rollout** — provisioning, per-context fresh
   `ready`/`commit_ref`-matched deploys, new-only verification, legacy removal, and only
   afterwards the safely-sequenced combined legacy anon/service_role deactivation (with console
   granularity reverified per §6), followed by #199 closure against live evidence.

Step 4 is **planning-gated, not authorized by this document.**

---

## 11. Session-close accounting

**v2.59 closes the narrative gap covering all work since v2.58.** That gap spans more than the
immediate PR #159 events: it includes **PR #158** and **PR #159**, and decisions **#202, #203,
#204, and #205** as applicable — none of which existed when v2.58 was authored, and none of
which had any handoff coverage. PR #158 carried a `Handoff: not needed` opt-out for itself,
which covered that PR but left its decision-log activity unnarrated.

The `docs/AGENTS.md` session-close rule requires a handoff update from any session that merges a
PR or writes to `ops.decision_log`; this session did both. This document is that update, and it
additionally discharges the outstanding narrative debt described above.

Chat performed only MCP reads, decision-log writes under explicit Trace authorization, and
verification/briefs. **Coder owns all repo writes**, including committing this handoff as
`handoffs/LATEST.md` and the byte-identical
`handoffs/GHMD_Sales_Platform_Handoff_v2.59.md`. Chat wrote nothing to the repository.
