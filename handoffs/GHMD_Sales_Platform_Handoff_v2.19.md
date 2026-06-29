# GHMD Sales Platform — Session Handoff v2.19

Supersedes: v2.18 | Date: 2026-06-29
Platform: GHMD Sales Platform (validates/operationalizes the GHMD sales process — NOT the NIP)
Stack: Next.js 14 · Supabase · Netlify · Mapbox · Census API · Box Sign
Infra: Supabase cprltmwwldbxcsunsafl · Netlify 0a339783 · Repo GetHairMD/ghmd-sales-platform
Spec folder (Drive — human-read reference only): 1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z

> GUARDRAIL: This handoff LINKS to SPRINT-STATE.md for sprint status; never restates it.
> LATEST.md is a byte-identical mirror of the highest-numbered handoff. If they diverge,
> the versioned vN.NN file wins and LATEST.md is regenerated from it.

## WHAT CHANGED (v2.18 → v2.19)
This session built and applied the operator-scoring DB foundation and opened Sprint 1.
1. Operator-scoring schema migration `20260629000000_operator_scoring_schema.sql` (PR #14, d877fe1) APPLIED to `cprltmwwldbxcsunsafl` and VERIFIED: tables `operators`, `operator_enrichment`, `operator_scores`, `operator_score_records` created with RLS enabled (Rule 3); `capture_source` enum (five source types) present; `operator_score_override_rates` view present. Confirms LOCKED Operator Score Architecture + Capture Taxonomy v1 (four-column pattern, Group A non-scoring, low-confidence gate, nullable day-one composite).
2. Post-apply advisor sweep (security + performance) surfaced ONE ERROR: `security_definer_view` on `operator_score_override_rates`. FIXED via migration `20260629000001_fix_override_rates_view_security.sql` — view dropped and recreated `WITH (security_invoker = true)`, SELECT definition byte-for-byte identical. APPLIED to `cprltmwwldbxcsunsafl` and VERIFIED (`pg_class.reloptions = {security_invoker=true}`). PR #15 MERGED (5cd8bc3).
3. Sprint 1 OPENED 2026-06-29 — PR #16 MERGED (bdf91b3). Status authoritative in SPRINT-STATE.md (this handoff links, does not restate).
4. `.env.local` created locally for dev (gitignored via `.gitignore` `.env.*`; never committed; `git status` clean of it). Contains `NEXT_PUBLIC_SUPABASE_URL` (https://cprltmwwldbxcsunsafl.supabase.co) and `SUPABASE_SERVICE_ROLE_KEY` — sales project only, NOT NIP.

## FLAGS (this session)
- **PR #13 (v2.18 handoff) is MERGED**, not pending. Verified `gh pr view 13` → state MERGED, mergedAt 2026-06-29T14:54:31Z (commit 1544eed, on main since session start). The task brief that produced this handoff described #13 as "still pending manual merge" — that is stale; corrected here to the verified state.
- **`log:export` script is NOT present in package.json** — only `dev`, `build`, `start`, `lint` exist. Confirmed via `npm run`. Carried to Sprint 1 backlog (also tracked in SPRINT-STATE.md).
- **Decision-log mirror: row 20 missing from the markdown mirror** (per Trace) — blocked on the missing `log:export` script. The export-from-SQL replica path used for row 18 (see v2.18) remains the only stopgap until `log:export` is wired into package.json and produces a clean no-op diff.

## LOCKED / DO NOT REOPEN
- Operator Score Architecture (LOCKED 2026-06-27): two-tier AI pre-score + human confirm 24h; four-column schema (value·source·confidence·notes); low-confidence hard gate at composite; composite never AI-alone; operator_score_composite nullable day one. NOW REALIZED in DB (migrations 20260629000000 + 20260629000001).
- Transcription Stack (LOCKED 2026-06-26): Recall.ai + AssemblyAI Universal-3 Pro + Medical Mode + Claude API. Whisper/Deepgram/Fireflies/Plaud rejected.
- Capture Taxonomy v1 (ADOPTED 2026-06-27): five source types (enriched, ai_extracted, ai_derived, human_entered, human_override); Groups A–F; Group A enrichment non-scoring in v1.
- Bilateral qualification + operator-underwriting ($179K protected territory; intro call is underwriting event; needs both territory score + operator score).
- Capital gate: binary post-financing field, lender underwrites. NOT an intro-call input.
- Outcome metrics (LOCKED): signed AND funded; territory perf proxied by disposable reorder velocity.

## NEXT SESSION — IMMEDIATE WORK (in order)
1. Sprint 1 — Census API scaffold. Census ACS API (B01001 + B19001 + B25105) → zip-code demographics; cache in `territories.census_raw_data` (Rule 5: never re-fetch if < 90 days old). Formula constants imported from `/lib/addressable-market-constants.ts` (Rule 6 — never inline). Supabase isolation `cprltmwwldbxcsunsafl` not NIP (Rule 1); Edge Function error logging (Rule 7).
2. Wire `log:export` into package.json (unblocks decision-log mirror row 20); verify clean no-op diff against `scripts/export-decision-log.ts`.
DO NOT reopen operator score architecture, transcription stack, or capture taxonomy.

## OPEN ITEMS (carried)
- Capture-taxonomy-seed branch (`claude/capture-taxonomy-seed-bd9ioj`) investigation — was v2.18 Next-Work #1. Schema build (Next-Work #2) is now done via PR #14; confirm whether the branch still holds any unmerged authoritative field-dictionary content before deleting. Status unverified this session.
- Decision-log mirror: row 20 missing; blocked on `log:export` (see Flags). Row 18 was SQL-replica-regenerated (v2.18) — re-verify on first real `log:export`.
- RLS POLICIES for new operator_* tables: RLS is ON (Rule 3) but no policies exist yet (advisor INFO `rls_enabled_no_policy` ×4) — tables currently service-role-only. Policy design pending Trace direction.
- Pre-existing advisor items (not from this session): `rls_policy_always_true` ×7 (Sprint 2/3 tables, `USING (true)`), unindexed FKs, `ops.decision_log` auth_rls_initplan ×2. Triage in a future hardening pass.
- CLEANUP (parked): Session Safety Rules bullets duplicate Standing Rules 0-B/0-C/0-D/0-E.
- #20: three-layer rate-limiting + spend caps — future security sprint, needs one live AI route. Spend caps (Anthropic/OpenAI/Netlify) tied to #20.
- MedspaDB pricing eval — submit territory sample (DFW, Phoenix, one mid-size); spoke candidate screen blocked until data layer confirmed.
- LATEST.md vs SPRINT-STATE.md drift guardrail: handoff links, never restates.

For sprint status see SPRINT-STATE.md — this handoff links there, does not restate it.
