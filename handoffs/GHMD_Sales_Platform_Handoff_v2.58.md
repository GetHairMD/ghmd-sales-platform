# GHMD Sales Platform — Session Handoff v2.58

**Supersedes:** v2.57 (PR #155). This is narrative history, not a state source. Per decision
#100, all current state — main HEAD, ops.decision_log tip, open PRs, security-advisor status —
is derived LIVE every session from git, ops.decision_log, and get_advisors. Nothing here is
authoritative for current state; where this document and live state disagree, live state wins.

---

## 1. Headline

Sprint 0.1 Phase 0 containment blocker **decision #200** (ungated legacy public
`/proposals/[prospectId]` route + stored legacy URLs) is **COMPLETE and CLOSED — not merely
merged.** PR #156 was merged, its migration applied and verified live, the production deploy
matched to the merge SHA, deployed route behavior independently verified, the Second-Opinion
Gate disposition logged (#201), and #200 updated to `ADOPTED/none` on verified evidence.

No credential-compatibility work, credential rotation, or git-history secret scan was performed
this session. Those remain queued in the order given in §7.

---

## 2. What shipped — PR #156 (decision #200 containment)

**PR:** #156 — `fix(security): route-removal — delete public /proposals/[prospectId],
gate+tombstone, null demo URLs [ultrareview]`. Tier: ultrareview.
**Merge:** squash-merged to `main` at full SHA
`46fa80541ad6db19a9eb64a5503ebe5e6f8c22b2`.
**Production deploy:** `6a5f2ed9fac4f10008927478` — state ready, context production, branch
main, `commit_ref` = the merge SHA above, published 2026-07-21T08:34:21Z.

### Code containment
- Deleted the public, service-role-backed page `src/app/proposals/[prospectId]/page.tsx`.
- Removed the `/proposals/` exemption from `isPublicPath()` (`src/lib/auth-gate.ts`), so the
  exposure no longer survives `AUTH_GATE_DISABLED` removal.
- Added a pre-auth middleware tombstone via a segment-required predicate
  `isRetiredProposalPath()` (`startsWith('/proposals/') && length > '/proposals/'.length`):
  only `/proposals/<non-empty-segment>` is 404'd. `/proposals` and `/proposals/` are not
  tombstoned and continue through the existing middleware flow. When `shouldRefuseServing()` is
  inactive, they proceed to the normal authentication flow; the global refusal check
  intentionally remains earlier and may respond first. The tombstone runs before
  `createServerClient()` and `auth.getUser()`, and after `shouldRefuseServing()`.
- Removed the internal `DealRoom` CTA href to the dead route (no UUID→slug redirect
  introduced); `/p/[slug]` untouched; seed no longer writes a legacy `proposal_url`.

### Stored-data containment (migration)
- Migration `20260720160000_null_legacy_proposal_urls` applied live to project
  `cprltmwwldbxcsunsafl`; recorded in `supabase_migrations.schema_migrations` as version
  `20260721083837`, name `20260720160000_null_legacy_proposal_urls`. Merged SQL was read from
  `main` and confirmed identical to the reviewed branch before apply.
- Design: single `DO $$…$$` block, no `EXCEPTION` handler; `SET LOCAL lock_timeout = '5s'`
  then `LOCK TABLE public.deals, public.prospects IN SHARE MODE` before the guard, held
  through the postcondition (both tables locked because both contribute a mutable column to
  the destructive eligibility predicate); null-safe LEFT JOIN + `) IS NOT TRUE` guard;
  target-bounded UPDATE; zero-remaining postcondition.
- **Data result: 7 legacy `deals.proposal_url` values matching `/proposals/` before, 0 after.**
  Pre-apply: 7 matching, 7 eligible under the guard, 0 unexpected. Post-apply: 0 remaining.
  Exactly the 7 intended rows were nulled and no unrelated rows were modified. Evidentiary
  basis: the target-bounded UPDATE could affect only the seven eligible rows; post-apply state
  was 28 NULL / 0 non-NULL, so under the executed SQL the remaining 21 rows were unaffected and
  their NULL state necessarily pre-existed the migration — a reconciliation conclusion from the
  bounded target set and post-state, not a separately captured pre-apply total-non-NULL
  snapshot. No guard or postcondition RAISE occurred at apply time.

### Production route verification (Codex, independent, against the merge-SHA deployment)
- anon GET `/proposals` → 307, Location `/login`.
- anon GET `/proposals/` → 307, Location `/login/`.
- authenticated: `/proposals` renders the Proposals index; `/proposals/` canonicalizes to
  `/proposals` and renders the same index. Both preserved, not tombstoned.
- anon GET `/proposals/<synthetic-segment>` → 404, no redirect.
- anon GET of an existing dummy `/p/[slug]` → 200 with the access-code gate present.
- **Evidentiary distinction (preserved):** the production requests verify *observable HTTP
  behavior*. The no-client/no-auth-query ordering of the retired-path 404 (tombstone before
  `createServerClient()` and `auth.getUser()`, after `shouldRefuseServing()`) is proven by the
  committed middleware source and its ordering tests on the merged SHA — not by the HTTP
  observation alone.

---

## 3. Gate history and dispositions for PR #156

PR #156 went through three heads under ultrareview; all earlier gate runs are historical, and
only the final fully-refreshed run was adjudicated:

- Head `dd7d6b4` (null-safe guard correction): gate escalated `coder-residual`
  (ACCEPTABLE_WITH_RATIONALE) and then `gpt-block` on a single-table-lock concurrency gap.
- Head `fddac88` (added `LOCK TABLE public.deals` only): two fresh `gpt-block` findings — (A)
  the `startsWith('/proposals/')` tombstone also matched `/proposals/`, regressing the
  preserved index; (B) the lock covered only `deals`, leaving `prospects.lead_source` mutable.
- Head `ce8917b` (segment-required tombstone + both-table SHARE lock): the authoritative gate
  run (latest run after the corrected commit, final-head evidence, and refreshed
  body/classification) returned **NO_ISSUE**; the only escalation was the mechanical
  `coder-residual` because the classification correctly left #200 OPEN/unresolved.

**Decision #201 — ADOPTED / accepted (Hard Rule 7 manual gate clear).** PR-unbound
(`related_pr`/`related_repo` NULL, because #200 owns the unique PR #156 binding). Records the
manual clear of the sole `coder-residual` escalation on final head `ce8917b`; the second
opinion returned NO_ISSUE and the gate was red only due to the intentional unresolved residual
flag. This clear authorized merge only — it did not resolve or close #200. Branch-scoped
`get_files` verification confirmed the committed middleware/auth-gate/migration matched the PR
evidence verbatim before the clear was logged.

**Decision #200 — ADOPTED / none.** Closed via a guarded single-row UPDATE
(`WHERE id=200 AND status='OPEN' AND residual_risk='unresolved' AND related_pr=156 AND
related_repo='GetHairMD/ghmd-sales-platform' AND superseded_by IS NULL`), exactly one row
updated. The original `decision` text (blocker statement, remediation requirements, closure
definition) was preserved byte-for-byte; the post-merge evidence was appended once to
`reasoning`. **Its PR #156 binding is retained** (`related_pr = 156`,
`related_repo = GetHairMD/ghmd-sales-platform`).

---

## 4. Live state at session end (recorded as narrative; re-derive per #100)

- `main` HEAD at session end: `46fa80541ad6db19a9eb64a5503ebe5e6f8c22b2` (PR #156 squash).
  **Re-derive live.**
- Migrations: `20260720160000_null_legacy_proposal_urls` recorded applied (version prefix
  `20260721083837`). Latest prior recorded migration before it was `20260720194604`.
- Decision-log activity this session: inserted #201 (ADOPTED/accepted); updated #200
  OPEN/unresolved → ADOPTED/none. **ops.decision_log in Supabase is the sole authoritative
  decision record — re-derive the tip live.**
- get_advisors at session start returned the standing set only (no new findings): the
  pre-adjudicated PostGIS/`spatial_ref_sys` and `st_estimatedextent` items, SECURITY DEFINER
  functions, `gate_decision_for_pr`, and the RLS-no-policy INFO rows. **Re-run get_advisors
  live next session.**

---

## 5. Standing security items that remain SEPARATE and unresolved (NOT closed by #200)

PR #156 / #200 contained the `/proposals/[prospectId]` route and its stored legacy URLs ONLY.
The following are independent and remain open on their own tracks:

- `spatial_ref_sys` — decision **#192** (grant-level exposure; not remediable from a
  postgres-role migration; Supabase support path).
- `st_estimatedextent` (three overloads) — decision **#196** (same class; Supabase ticket
  #SU-426558 shared with the spatial_ref_sys item).
- Credential-exposure incident — decision **#199** (OPEN; the known exposed service-role
  credential awaits compatibility work and rotation across every mapped credential store;
  re-read #199 live for its exact scope). Not advanced this session.
- SECURITY DEFINER surface review, leaked-password protection, and **`AUTH_GATE_DISABLED`
  removal** remain separate standing pre-live gates. No real prospect or representative data
  may load before the Security Containment and Foundation MVP milestones are formally signed
  off (CRM-003; Hard Rules 10–11).

---

## 6. Judgment calls, residual risk, deferrals

- **Both-table SHARE lock over single-statement rewrite.** The gpt-block on
  `prospects.lead_source` was fixed by widening the explicit `LOCK TABLE` to both tables in one
  consistently-ordered statement, NOT by an `UPDATE … FROM prospects` rewrite: a single
  statement gives one snapshot but does not hold the joined `prospects` row immutable through
  commit (the referenced table takes only ACCESS SHARE), so it would not have closed the
  window without adding the same lock anyway.
- **Two-backend concurrency rehearsal — disclosed verification-method limitation, not a product
  residual.** A literal two-connection block/timeout could not be executed from the available
  tooling (MCP `execute_sql` serializes to one connection; `max_prepared_transactions = 0`;
  `dblink` self-connect needs withheld credentials). The concurrency guarantee rests on the
  structure test (both-table SHARE lock precedes the guard), the observed granted `ShareLock`
  on both tables, PostgreSQL's fixed SHARE × ROW EXCLUSIVE conflict semantics, and the
  now-completed live application. This was explicitly NOT logged as a separate decision.
- **GitHub connector comment-write 403.** The connector could not post the Coder send-backs or
  gate dispositions as PR comments this session (`403 Resource not accessible by integration`);
  those were delivered via the Coder session instead. Flag for a later permissions fix if Chat
  is expected to post PR comments in future. Non-blocking.
- **Credential-compatibility brief is NOT yet finalized as an authoritative artifact.** No
  compatibility or rotation work began this session. It must be finalized and reviewed before
  any rotation.
- **Git-history secret-scan brief is parked and still requires four corrections** before it is
  sent to Coder: (1) repository-visibility accuracy — verify and state the repository's live
  visibility and operational constraint when the scan begins; do not assume that later
  privatization or history rewriting contains a credential that was already exposed. Rotation
  or revocation is the required containment; (2) non-presumptive history-rewrite framing (do
  not present rewrite as containment; GitHub retains orphaned commits regardless);
  (3) suppression of raw TruffleHog secret output (findings by class/path/SHA/rule only, zero
  value characters); (4) narrowly justified allowlisting (public-by-design values inventoried,
  not broadly exempted).

---

## 7. Recommended next-session order (do NOT begin any of these here)

1. **Verify live state and #199** — re-derive main HEAD, ops.decision_log tip, and
   get_advisors per #100; re-read decision #199 for the current rotation scope.
2. **Finalize the credential-compatibility brief** as an authoritative, reviewed artifact
   (apply any outstanding corrections; state tier explicitly).
3. **Execute its reviewed PR** (Coder; standard/ultrareview per the brief), with the usual
   draft → gate → Chat verification sequence.
4. **Rotate the exposed service-role credential across all mapped stores** (every location in
   #199's inventory — no store skipped).
5. **Verify and close #199** on first-hand evidence, guarded update, PR binding as applicable.
6. **Then perform the corrected full git-history secret scan** (only after the four brief
   corrections above are applied; Task 5 activity, distinct from and not discharged by the
   PR-0a.1 deploy-time current-tree scan).

Ordering rationale: the known exposed service-role credential must be rotated and #199 verified
closed without waiting for the historical scan. The subsequent history scan then determines
whether repository history contains any additional credential exposures requiring separate
rotation or containment, using the newly rotated credential state as the known-good current
baseline. History rewriting must not be treated as a substitute for rotation.

---

## 8. Session-close accounting

This session merged a PR (#156) and wrote to ops.decision_log (#201 insert; #200
OPEN/unresolved → ADOPTED/none), so a handoff update is required per the docs/AGENTS.md
session-close rule — this document is that update. No credential-compatibility, credential
rotation, or git-history scan work was performed. Chat performed only MCP operations,
verification, and this handoff narrative; Coder owns all repo writes, including committing this
handoff as `handoffs/LATEST.md` and the byte-identical `handoffs/GHMD_Sales_Platform_Handoff_v2.58.md`.
