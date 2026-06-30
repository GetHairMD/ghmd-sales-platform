# Second-Opinion Gate

Adversarial second review for high-stakes PRs. Coder finishes a PR and writes a
self-justification (existing practice); for changes in the trigger list, an
independent OpenAI ("GPT-5") read is taken and compared against Coder's own risk
disposition. Disagreement — or any accepted/unresolved risk from either side —
escalates to Trace before merge. Everything else passes silently.

This gate sits entirely **upstream of Pilot**. Pilot's role is unchanged
(confirm merge SHA). OpenAI never gets repo write, repo access, or any role in
the commit graph — it receives only the SPEC text and the PR diff.

## Pipeline (A7)

```
Coder finishes PR + writes the gate block (below)
        ↓
second-opinion-gate.yml runs on the PR
        ↓ block present?                         ↓ no block
Gate runs (OpenAI + A3 compare)            Pass — not in the trigger list
        ↓
Silent pass → Pilot confirms merge SHA
   or
Escalate    → PR comment tagging Trace, check fails → Trace accepts (logs to
              ops.decision_log) or sends back to Coder
```

## When does a PR route through the gate? (A6)

Tag the PR **only** if it touches one of these. Classify by what the code *does*,
not just the file it touches; when ambiguous, route it through the gate.

1. Security/auth boundaries, RLS policies, webhook signature verification
2. Financial formulas (addressable market, PPI rent-burden multiplier, financing math)
3. PHI-adjacent data paths
4. Operator-score gating logic (the low-confidence hard gate specifically)
5. NPI provider data handling (caching, TTL expiry, taxonomy matching)

**Excluded by design:** general feature UI, CRUD, leaderboard/simulator/training-hub,
general Sales Platform UI work.

### Hard exceptions (A8) — always escalate, even on a clean double pass

Set `hard_exception: true` when the change touches any of:

- PHI architecture changes
- Regulatory filing logic
- Securities-related logic
- Signed-contract logic (Ottri, Revian, HairCodeRx terms encoded as business rules)

Two models agreeing is not sufficient confirmation on irreversible or regulated actions.

## How to classify a PR (Step 5)

Manual tagging — paste this block into the PR **description**. No block = not in
scope = automatic pass. `residual_risk` is read **literally** from this block,
never inferred from prose (CLAUDE.md Rule 14).

```
<!-- second-opinion-gate
category: 2
hard_exception: false
coder_residual_risk: none
decision_log_id: 22
spec: |
  What this change is supposed to do or prevent. Be concrete — this is what
  OpenAI is told the change must achieve, and what it attacks.
coder_self_justification: |
  One to two sentences: why you believe this is correct/contained.
-->
```

| Field | Meaning |
|-------|---------|
| `category` | One of 1–5 above. **Required.** |
| `hard_exception` | `true`/`false`. Defaults false. |
| `coder_residual_risk` | `none` \| `accepted` \| `unresolved`. **Missing/invalid → treated as `unresolved` (fail closed).** |
| `decision_log_id` | Optional reference to the `ops.decision_log` row this change relates to. |
| `spec` | **Required.** What the change must do/prevent. Missing → fails closed. |
| `coder_self_justification` | Shown to Trace verbatim on escalation. |

## Decision logic (A3 — asymmetric agreement)

Evaluated in this exact order; **silent pass requires both sides to independently
conclude `none`:**

1. OpenAI call failed / timed out / malformed → **escalate** (a broken second opinion ≠ "no issue").
2. `hard_exception: true` → **escalate**.
3. OpenAI `RESIDUAL_RISK: unresolved` (BLOCK) → **escalate**.
4. Coder `residual_risk` is `accepted` or `unresolved` → **escalate**.
5. OpenAI `RESIDUAL_RISK: accepted` → **escalate** (any accepted risk from either side triggers review).
6. Both `none` → **silent pass**.
7. Anything else → **escalate** (fail closed).

On escalation the gate posts the four-line A4 summary as a PR comment tagging
Trace, and the check **fails** so the PR can't merge until Trace clears it.

## Escalation delivery (A10)

GitHub Mobile's native PR-comment push notifications — no SMS, no separate
delivery layer. Each escalation posts its own comment; GitHub notifies Trace the
normal way. Accepted tradeoff: no dedicated urgency signal distinguishing a
blocking escalation from any other (logged: `ops.decision_log`).

## Overdue residual-risk sweep (A5 / Step 6)

`residual-risk-sweep.yml` runs weekly (Mon 13:00 UTC). It calls
`public.residual_risk_overdue()` — a SECURITY DEFINER function returning a **safe
projection only** (id, title, owner, target_date; never `reasoning`/`decision`),
service-role-execute-only — and maintains **one persistent** GitHub issue
(label `residual-risk-overdue`) tagging Trace. Reopened/refreshed on each hit,
closed when the list is empty. Flags rows that are `residual_risk = accepted`
and either past `residual_risk_target_date` or with no target date set —
**except** rows marked `residual_risk_standing = true`, which are intentionally
undated standing decisions (not deadline-bearing tasks) and are never flagged.

## How Trace clears an escalation (A9)

Repo write is restricted to `traceh-ghmd`, so only Trace can clear an escalation
— structurally, not by convention. To accept: log the disposition to
`ops.decision_log` (with `residual_risk` + owner + target date per Rule 14) and
admin-merge. To reject: send back to Coder for a fix; the next push re-runs the gate.

## Setup — enabling the gate (confirm-before-ship)

**Status: LIVE as of 2026-06-30** (`SECOND_OPINION_GATE_ENABLED = true`, secrets
provisioned). Both workflows are gated on repo variable
`SECOND_OPINION_GATE_ENABLED`; setting it back to `false` reverts them to dormant
(the gate passes without calling OpenAI and the sweep does not run).

**Repository secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Used by | Notes |
|--------|---------|-------|
| `OPENAI_API_KEY` | gate | Trace's OpenAI key. |
| `SUPABASE_URL` | sweep | Sales project URL (`cprltmwwldbxcsunsafl`). |
| `SUPABASE_SERVICE_ROLE_KEY` | sweep | Calls the safe RPC only. |

`GITHUB_TOKEN` is provided automatically (PR comments + issue management).

**Repository variables** (… → Variables):

| Variable | Value |
|----------|-------|
| `SECOND_OPINION_GATE_ENABLED` | `true` to activate. |
| `OPENAI_MODEL` | optional; defaults to `gpt-5`. |
| `GATE_TRACE_HANDLE` | optional; defaults to `traceh-ghmd`. |

## Step 7 (done) — required status check

Branch protection on `main` requires the `gate` status check (`enforce_admins:
false`, so Trace can admin-merge to clear an escalation). Because no-block PRs
pass, ordinary PRs are not blocked.

## Step 8 (done) — end-to-end tested; gate is LIVE

Verified live via test PRs: the OpenAI call fires and returns structured A1
output; silent-pass (both `none`) posts no comment and the check is green;
forced escalation from either side (GPT `BLOCK` or Coder `accepted`) posts the
A4 comment and fails the check; branch protection blocks the merge; the GitHub
Mobile push was received. **The gate governs real PRs as of 2026-06-30.**
