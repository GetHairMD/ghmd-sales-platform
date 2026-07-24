# GHMD Sales Platform — Session Handoff v2.62

**Supersedes:** v2.61, committed by documentation-only PR #163.

**What this file is:** historical narrative and durable work sequencing. It is not a live-state
source. At every session start, derive current repository HEAD, open pull requests, deploy state,
Supabase advisor results, and `ops.decision_log` state from the authoritative systems. If this
document and live state disagree, live state wins.

No credential value, fragment, masked suffix, or secret-bearing request is reproduced here.

---

## 1. Headline

Sprint 0.1 credential containment and repository-history review remain complete. Decision #199 is
closed `ADOPTED / none` after replacement or removal of the mapped credentials, provider
deactivation of the retired Supabase and Census credentials, Production verification, and a
sanitized scan of the full reachable textual Git history.

The Netlify rollback-to-vulnerable-artifact concern remains dispositioned. Decision #189 is closed
`ADOPTED / accepted`: Blaine and Leif were changed from Netlify Developer to Reviewer with
specific-project access, leaving Trace as the sole Owner with deployment-management and
historical-republish authority. Historical artifacts may remain until automatic retention removes
eligible deployments; no mass manual deletion, Enterprise upgrade, or password-protection change is
required for this phase.

The PostGIS schema-exposure remediation is now complete. On 2026-07-24 Supabase Support completed
ticket #SU-426558 by relocating PostGIS from `public` to `extensions`. Independent live
verification passed, and decisions #192 and #196 are both now closed `ADOPTED / none`. Ticket
#SU-426558 is closed.

The only remaining open decisions are #141 and #176. The next actionable workstream is
territory-data discovery and validation under decision #141, which the completed PostGIS relocation
no longer blocks.

---

## 2. Evidence vocabulary

- **Derived live:** read from git or Supabase during preparation of this handoff.
- **Provider-confirmed:** established by written confirmation from the responsible provider.
- **User-confirmed:** an external console action performed and reported by Trace.
- **Historical:** already completed and durably recorded in the repository or
  `ops.decision_log`; not re-executed merely for this handoff.

This vocabulary describes evidence strength. It does not authorize a new write, deployment,
migration, import, or provider action.

---

## 3. Handoff v2.61 landed

Documentation-only PR #163 squash-merged Handoff v2.61 as:

`4b51d5dafbdc5abadafa1f2a6ba649c7db5df0cc`

The committed versioned handoff and `handoffs/LATEST.md` resolve to the same Git blob:

`b48845b9fd8b399af6334c09a6db1f62d8bfae75`

These are historical merge facts, not instructions to treat that commit as the current HEAD in a
future session.

---

## 4. Decision #199 — credential incident closed

Decision #199 is now `ADOPTED / none`, remains bound to PR #158, and retains its original incident
statement and historical reasoning. Its closure block records the final disposition; it does not
erase or rewrite the incident history.

### 4.1 Supabase credentials

- PR #158 introduced the service-credential compatibility layer.
- PR #159 introduced the publishable-key compatibility layer and enforcement scanning.
- PR #161 removed the legacy fallback branches while permanently refusing the retired identifier
  names.
- Production was deployed and verified on the preferred keys.
- The legacy JWT-based Supabase `anon` and `service_role` API keys were disabled at the provider.
- Production and the separate GitHub Actions consumer succeeded after deactivation.
- Decision #206 records the implementation completion; #207 records the manual gate adjudication.

### 4.2 Other mapped credentials

- `PROPOSAL_GATE_SECRET`: Production was replaced and functionally verified. The retired value is
  no longer retained in the reconciled non-Production/local contexts. Remaining context
  availability verification or Netlify scope hardening is separate defense-in-depth work, not an
  active incident exposure.
- `FRED_API_KEY`: deleted at the provider and removed from Netlify; no active code consumer
  remained.
- `MAPBOX_SERVER_TOKEN`: replaced with a least-privilege Production token, Production geocoding
  and isochrone consumers were verified, and the retired provider/local value was removed.
- `CENSUS_API_KEY`: replacement was configured in Netlify and verified through a successful
  Production Census-backed request. The local retired value was removed. The U.S. Census Bureau
  confirmed in writing on July 23, 2026 that its API team deactivated the retired key.

No retired credential should be functionally retested merely to duplicate authoritative provider
confirmation.

### 4.3 Reachable Git-history scan

The authorized read-only scan covered the full reachable textual repository history:

- 458 commits enumerated.
- Gitleaks returned zero findings.
- All 17 merge commits received supplemental per-parent diff coverage.
- Two TruffleHog Netlify detections were independently adjudicated as non-secret test fixtures.
- No real dotenv file was present in reachable history.

No history rewrite, force-push, ref deletion, or clone invalidation is required or authorized.
The scan does not claim coverage of unreachable objects, GitHub internal retention, or independent
third-party forks/clones.

---

## 5. Decision #189 — Netlify historical rollback residual closed

Decision #189 is `ADOPTED / accepted`.

The underlying technical limitation remains true: a historical Netlify artifact executes the code
that existed when that artifact was built. Current source code cannot retroactively add security
guards to an old bundle.

The risk is bounded operationally:

- Security-boundary commit `8fb5e9a5e8d13d81c577b8b91c6e2e3eb7f1f9ec` remains the oldest
  permitted production rollback.
- Trace changed Blaine and Leif from Netlify Developer to Reviewer with specific-project access.
- Trace is the sole Netlify Owner with authority to manage or republish Production deployments.
- The platform remains pre-live with dummy/test data.
- Netlify may remove eligible historical deployments through automatic retention.
- No claim is made that historical artifacts were deleted, locked, or password-protected.
- No mass manual deletion, Netlify Enterprise upgrade, or password-protection change is required
  for this phase.

Two-factor authentication remains recommended for the Owner account but was explicitly not made a
closure precondition.

---

## 6. PostGIS and Supabase Support — completed

Decisions #192 and #196 are both now closed `ADOPTED / none`, under completed Supabase Support
ticket #SU-426558. Decision #192 retains its PR #153 binding unchanged; decision #196 retains its
PR #154 binding unchanged.

### 6.1 What Support performed

Support had explained that PostGIS was installed by `supabase_admin` in the exposed `public`
schema, which is why the repository migration role could not remediate the owned extension
objects. On 2026-07-24 Supabase Support completed ticket #SU-426558 by relocating PostGIS from
`public` to `extensions`, within the authorized boundaries (project `cprltmwwldbxcsunsafl`; no
extension drop; no `CASCADE`; territory geometry columns and indexes preserved). Support confirmed
a restorable backup dated 2026-07-24 05:15:42 UTC captured before the relocation.

### 6.2 Independent post-relocation verification

Independent live verification confirmed:

- PostGIS version `3.3.7` is installed in `extensions`.
- The extension owner remains `supabase_admin`; `extrelocatable` is `false`.
- No PostGIS-owned relations, functions, or types remain in `public`.
- `public.spatial_ref_sys` no longer exists; its replacement resides in `extensions`.
- All three `st_estimatedextent` overloads reside in `extensions`.
- The prior PostGIS-specific Security Advisor warnings are gone.
- Read-only PostGIS geometry and territory-map functional probes succeeded.
- Unrelated Security Advisor findings remain separately governed and must not be represented as
  cleared by this relocation.

Supabase Support was notified that verification succeeded. Ticket #SU-426558 is closed. No further
PostGIS migration, extension drop/reinstall, or schema relocation is authorized by this handoff.

---

## 7. Live decision queue at handoff preparation

The following two rows were the complete live `OPEN` and non-superseded queue when this handoff was
prepared. Future sessions must query the table again.

| Decision | Status / residual | Meaning and disposition |
|---|---|---|
| #141 | `OPEN / accepted` | Legacy sold-territory ArcGIS import. Deferred prerequisite for the territory-authoring flow. |
| #176 | `OPEN / unresolved` | Claude capability-stack cloud portability from PR #145 did not function in `claude.ai/code`. Non-blocking for product delivery under the revised working process. |

Decisions #189 and #199 are closed as recorded above. Decisions #192 and #196 are now closed
`ADOPTED / none` following the completed PostGIS relocation.

---

## 8. Next authorized sequence

### Step 1 — decision #141 territory-data discovery and validation

With the PostGIS relocation verified and #192/#196 closed, the next actionable workstream is a
read-only inventory of the legacy territory sources:

- prior CRM exports;
- ArcGIS Online exports or Feature Service data;
- currently stored Supabase territory records;
- National Network Map expectations;
- sold, provisional, pipeline, abandoned, and negotiation-redraw semantics.

The first deliverable is a reconciliation and validation report, not an import. It must identify:

- duplicate and abandoned sketches;
- invalid or self-intersecting geometries;
- genuine overlaps between sold territories;
- naming/date/identifier normalization needs;
- legal/commercial boundaries that must be preserved exactly rather than recalculated;
- geometry/SRID conversion;
- proposed authoritative source and rollback plan;
- evidence required before any write.

Do not bulk-import, redraw, resize, clip, overwrite, or publish territory geometry without a
separate approved brief and acceptance criteria. Existing sold boundaries represent contracted
commercial rights and must not be silently re-derived through the current sizing formula.

### Step 2 — executive system map and AI-governance presentation

After the territory source-of-truth and formula status are sufficiently verified, create the
non-technical executive presentation and one-page system map. The presentation must distinguish:

- Live;
- Built, unvalidated;
- In development;
- Approved future design;
- Concept requiring approval;
- Human only.

It must explain territory data sources and equations, Mapbox/PostGIS/ArcGIS responsibilities,
qualification and proposal gates, the embedded Zoom/script/transcript workspace, separate prospect
and salesperson evaluation, Outlook-derived communication summaries, AI recommendations and
controlled automation, and every consequential human approval.

---

## 9. Working-process adjustment

The current operating preference is:

1. Codex creates consolidated briefs, architecture analysis, acceptance criteria, and independent
   PR review.
2. Coder implements one approved bounded brief and reports evidence.
3. Codex independently verifies the resulting PR and live claims.
4. Gemini may provide one bounded second review when genuinely useful.
5. Claude Chat is not part of the default drafting/reconciliation loop.
6. Trace remains final business and risk authority.

This is intended to reduce repeated multi-model reconciliation, token consumption, and drift
toward compromise for its own sake. It does not weaken the repository's Second-Opinion Gate or
allow Coder to make product decisions.

Decision #176 remains open because PR #145's Claude cloud-portability mechanism was confirmed
non-functional. That issue is not a blocker for the working process above and should not consume
product-development time unless Trace separately prioritizes it.

---

## 10. Deferred product requirements preserved

### 10.1 Internal rep-management profile

This belongs inside the existing Reps navigation area:

- Executives have broad/full visibility.
- Authorized W-2 managers see the reps assigned to them.
- Leif has authorized internal access and may maintain permitted records and notes.
- 1099 reps never see the management profile, private notes, rankings, or coaching analysis.
- The profile supports relationship management, communication history, engagement metadata,
  follow-ups, support needs, and executive-only performance/coaching views.
- AI-generated email summaries may be stored as governed metadata; this does not authorize
  unrestricted storage of full email bodies.
- Leif may have approved Box access.
- Follow-up cadence is created as needed, not imposed as a universal schedule.

### 10.2 Cold-lead staging

Large cold-lead and outbound lists remain segregated in a staging/intake area. They must not
clutter Accounts, Contacts, Opportunities, rep-management profiles, or the core deal flow. This is
not approval to turn the CRM into a broad outbound-generation platform.

### 10.3 Executive system visualization and AI governance

The future executive artifact must cover:

- source-to-map territory flow and the binding formula;
- Mapbox, Census, credit-quality data, Supabase/PostGIS, and ArcGIS transition roles;
- manual negotiation redraw and National Network Map update;
- Zoom meeting entry, script panel, required questions, transcript capture, consent, and evidence;
- separate prospect and sales-rep scoring;
- provisional scoring weights clearly labeled as requiring approval;
- AI summaries, missing-information detection, stalled-deal alerts, recommended next steps, and
  permitted low-risk automation;
- human-only qualification, territory, pricing, contract, funding, loss/not-ready, compensation,
  disciplinary, legal, and access-control decisions;
- permission-safe retrieval, source citations, confidence, model/rubric version, reviewer edits,
  override reasons, and audit history.

No proposed score, weight, workflow, or integration is represented as deployed merely because it
appears in the planned executive artifact.

---

## 11. Handoff delivery convention

Coder must commit this complete artifact verbatim to both:

- `handoffs/LATEST.md`
- `handoffs/GHMD_Sales_Platform_Handoff_v2.62.md`

The two committed files must be byte-identical. Delivery is a documentation-only PR from
`chore/handoff-v2.62`; no application code, migration, workflow, configuration, decision-log, or
provider change belongs in that PR.

The PR is standard-tier documentation work. It must state:

`Handoff: included — LATEST.md updated to v2.62`

The PR must report the two Git blob IDs or cryptographic hashes demonstrating byte identity, plus
the final changed-file list and diff statistics.

After Trace squash-merges the PR, Coder verifies that `main` contains the squash SHA and that the
two files remain byte-identical, then performs normal merged-branch cleanup.

---

## 12. Do not do without separate authorization

- Do not reopen #192 or #196, or re-run the PostGIS relocation, without new live evidence.
- Do not represent unrelated Security Advisor findings as cleared by the PostGIS relocation.
- Do not begin a territory import merely because #141 is next in sequence.
- Do not redraw or resize a sold territory as a data-cleanup shortcut.
- Do not reopen decision #199 or repeat completed credential tests without new evidence.
- Do not manually delete hundreds of Netlify deployments.
- Do not treat historical Netlify artifacts as deleted or locked; #189 closes by bounded accepted
  risk, not by artifact removal.
- Do not spend product-development time on #176 unless Trace separately prioritizes it.
- Do not implement proposed AI scores, weights, or automation from the executive-artifact
  requirements without explicit product approval.
- Do not write `ops.decision_log` from Coder or any subagent.

---

## 13. Session-close accounting

This documentation session made no database write. Decisions #192 and #196 were guarded from
`OPEN / unresolved` to `ADOPTED / none` through the sanctioned decision-log write path — each with
its closure block appended and its original decision text and PR binding (#153 and #154
respectively) preserved. Those closures are recorded here; they were not performed by this handoff
PR.

This handoff was prepared from:

- the committed v2.61 artifact read in full;
- local git metadata for the already-merged documentation PR #163;
- the completed Supabase Support ticket #SU-426558 and its 2026-07-24 05:15:42 UTC provider backup
  confirmation, as reported;
- the independent post-relocation PostGIS and territory-map verification results, as reported;
- the recorded `ops.decision_log` closures for #192 and #196.

No repository file, migration, provider setting, or additional decision-log row was changed while
preparing this artifact. Coder owns the documentation-only PR described in §11.
