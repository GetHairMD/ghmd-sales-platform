# GHMD Sales Platform — Session Handoff v2.18

Supersedes: v2.17 | Date: 2026-06-28
Platform: GHMD Sales Platform (validates/operationalizes the GHMD sales process — NOT the NIP)
Stack: Next.js 14 · Supabase · Netlify · Mapbox · Census API · Box Sign
Infra: Supabase cprltmwwldbxcsunsafl · Netlify 0a339783 · Repo GetHairMD/ghmd-sales-platform
Spec folder (Drive — human-read reference only): 1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z

> GUARDRAIL: This handoff LINKS to SPRINT-STATE.md for sprint status; never restates it.
> LATEST.md is a byte-identical mirror of the highest-numbered handoff. If they diverge,
> the versioned vN.NN file wins and LATEST.md is regenerated from it.

## WHAT CHANGED (v2.17 → v2.18)
This session was housekeeping + governance hygiene only. No sprint movement, no schema built.
1. PR #9 merged (c79e985): CLAUDE.md rules #11/#12 + Decision Logging section; v2.16 + LATEST.md created. RLS rule #3 untouched.
2. Decision-log row 18 logged (ADOPTED) via Coder; mirror refreshed; PR #10 merged (f9a28fa).
   CARRIED FLAG: row-18 mirror was regenerated via a SQL replica of export-decision-log.ts (service-role key absent in shell), diff-proven byte-identical except an intentional stale-blank-line normalization. NEXT real `npm run log:export` should produce a clean no-op diff; if it churns, regenerate from the real script.
3. Rule hygiene audit PASSED: numbering gap-free (0,0-B..0-E,1–13); RLS rule #3 intact and live (relrowsecurity=true); only one operational by-number reference in the corpus (CLAUDE.md:97 → rule #11) and it resolves correctly. Full CLAUDE.md reviewed (Standing Rules, Session Safety Rules, Decision Logging, Formula Constants, Sprint Discipline, Agent Roles/Names, Env Vars, Key Reference Values) — confirmed consistent with locked architecture.
4. v2.17 handoff created + merged (PR #11, 2a1459f) — repo-hosted handoff protocol proven end-to-end (byte-identical mirror, links-not-restates, contamination clean).
5. Rule #13 added + merged (PR #12, f80d45f): "Do not arm self-check-in wakeups on draft PRs awaiting Trace's manual merge." It self-complied on its own PR (no wakeup armed).
6. Repo setting "Automatically delete head branches" ENABLED. Stale merged claude/* branches cleaned (#10, #12 deleted; #9, #11 already gone).

## LOCKED / DO NOT REOPEN
- Operator Score Architecture (LOCKED 2026-06-27): two-tier AI pre-score + human confirm 24h; four-column schema (value·source·confidence·notes); low-confidence hard gate at composite; composite never AI-alone; operator_score_composite nullable day one.
- Transcription Stack (LOCKED 2026-06-26): Recall.ai + AssemblyAI Universal-3 Pro + Medical Mode + Claude API. Whisper/Deepgram/Fireflies/Plaud rejected.
- Capture Taxonomy v1 (ADOPTED 2026-06-27): five source types (enriched, ai_extracted, ai_derived, human_entered, human_override); Groups A–F; Group A enrichment non-scoring in v1.
- Bilateral qualification + operator-underwriting ($179K protected territory; intro call is underwriting event; needs both territory score + operator score).
- Capital gate: binary post-financing field, lender underwrites. NOT an intro-call input.
- Outcome metrics (LOCKED): signed AND funded; territory perf proxied by disposable reorder velocity.

## NEXT SESSION — IMMEDIATE WORK (in order)
1. FIRST: investigate branch claude/capture-taxonomy-seed-bd9ioj. It is from merged PR #7 but shows 3 commits AHEAD of main. Determine via `git log main..` and `git diff main...` whether those commits are (a) pre-squash history already on main [safe to delete] or (b) unmerged content. CRITICAL: if any differing content is Capture Taxonomy v1 field-dictionary material (field names, Groups A–F, tier assignments, source-type mappings), quote it in full — it may be the authoritative field dictionary needed for the schema build. Do NOT delete the branch until resolved.
2. THEN: build the operator-scoring Supabase schema from the Capture Taxonomy v1 field dictionary (from the branch if it's there, otherwise Trace pastes it — Rules 6/7, Coder does not fetch from Drive). Build spec: wide-column pattern; source enum all five values; four columns per scored field; low-confidence hard gate at composite-generation; Field Groups A–F; Group A non-scoring (confirm at build); per-field override-rate queryable. Enforce at creation: RLS on (Rule 3); Supabase isolation cprltmwwldbxcsunsafl not NIP (Rule 1); timestamped migration in /supabase/migrations/ (Rule 2).
DO NOT reopen operator score architecture, transcription stack, or capture taxonomy.

## OPEN ITEMS (carried)
- Capture-taxonomy-seed branch investigation (gates schema build) — see Next Work #1.
- Capture Taxonomy v1 open Qs to resolve AT schema build: wide-vs-normalized (defaulted wide — confirm); objections_raised/questions_asked keep-or-cut (recommend keep as nullable); Group A non-scoring confirm.
- Decision-log mirror: verify clean no-op diff on next real `npm run log:export` (row 18 was SQL-replica-regenerated).
- CLEANUP (parked, not urgent): Session Safety Rules bullets substantially duplicate Standing Rules 0-B/0-C/0-D/0-E. Resolve if/when consolidating governance — independent of any rule.
- #20: three-layer rate-limiting + spend caps — future security sprint, needs one live AI route.
- Spend caps (Anthropic/OpenAI/Netlify) — tied to #20.
- MedspaDB pricing eval — submit territory sample (DFW, Phoenix, one mid-size); spoke candidate screen blocked until data layer confirmed.
- LATEST.md vs SPRINT-STATE.md drift guardrail: handoff links, never restates.

For sprint status see SPRINT-STATE.md — this handoff links there, does not restate it.
