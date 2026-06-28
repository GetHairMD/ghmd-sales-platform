# GHMD Sales Platform — Session Handoff v2.17

Supersedes: v2.16 | Date: 2026-06-28
Platform: GHMD Sales Platform (validates/operationalizes the GHMD sales process — NOT the NIP)
Stack: Next.js 14 · Supabase · Netlify · Mapbox · Census API · Box Sign
Infra: Supabase cprltmwwldbxcsunsafl · Netlify 0a339783 · Repo GetHairMD/ghmd-sales-platform
Spec folder (Drive — human-read reference only): 1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z

> GUARDRAIL: This handoff LINKS to SPRINT-STATE.md for sprint status; it never restates it.
> LATEST.md is a byte-identical mirror of the highest-numbered handoff. If they diverge, the
> versioned vN.NN file wins and LATEST.md is regenerated from it.

## WHAT CHANGED (v2.16 → v2.17)
1. PR #9 merged to main (squash c79e985): CLAUDE.md gained rule #11 (handoff-read) and
   rule #12 (rule-change-by-quote meta-rule) + Decision Logging section; /handoffs/v2.16.md
   and LATEST.md created. RLS rule #3 left untouched (verified). Pre-merge drift check
   confirmed docs-only against current main; decision-log impl already live via #7/#8.
2. Decision logged: ops.decision_log row 18 (ADOPTED) — handoff repo-hosting + LATEST.md/
   SPRINT-STATE guardrail. Git mirror refreshed; merged via PR #10 (squash f9a28fa).
   NOTE: mirror for row 18 was regenerated via a SQL replica of export-decision-log.ts
   (service-role key absent in shell), diff-proven byte-identical except an intentional
   stale-blank-line normalization. NEXT real `npm run log:export` should produce a clean
   no-op diff — if it churns, regenerate from the real script. (Carried flag.)
3. Rule hygiene audit (read-only) PASSED: rule numbering gap-free (0,0-B..0-E,1–12); RLS
   rule #3 intact and live (relrowsecurity=true); exactly one operational by-number
   reference in the corpus (CLAUDE.md:97 → rule #11) and it resolves correctly. No mismatches.

## LOCKED / DO NOT REOPEN
- Operator Score Architecture (LOCKED 2026-06-27): two-tier AI pre-score + human confirm 24h;
  four-column schema (value·source·confidence·notes); low-confidence hard gate at composite;
  composite never AI-alone; operator_score_composite nullable day one.
- Transcription Stack (LOCKED 2026-06-26): Recall.ai + AssemblyAI Universal-3 Pro + Medical
  Mode + Claude API. Whisper/Deepgram/Fireflies/Plaud rejected.
- Capture Taxonomy v1 (ADOPTED 2026-06-27): five source types (enriched, ai_extracted,
  ai_derived, human_entered, human_override); Groups A–F; Group A enrichment non-scoring in v1.
- Bilateral qualification + operator-underwriting ($179K protected territory; intro call is
  underwriting event; needs both territory score + operator score).
- Capital gate: binary post-financing field, lender underwrites. NOT an intro-call input.
- Outcome metrics (LOCKED): signed AND funded; territory perf proxied by disposable reorder velocity.

## NEXT SESSION — IMMEDIATE WORK
Build the operator-scoring Supabase schema from the Capture Taxonomy v1 field dictionary.
GATED ON: Trace pasting the field dictionary into chat (Rules 6/7 — Coder does not fetch it
from Drive). Build spec: wide-column pattern; source enum all five values; four columns per
scored field; low-confidence hard gate at composite-generation; Field Groups A–F; Group A
non-scoring (confirm at build); per-field override-rate queryable. Enforce at creation:
RLS on (Rule 3), Supabase isolation cprltmwwldbxcsunsafl not NIP (Rule 1), timestamped
migration in /supabase/migrations/ (Rule 2).
DO NOT reopen operator score architecture, transcription stack, or capture taxonomy.

## OPEN ITEMS (carried)
- Decision-log mirror: verify clean no-op diff on next real `npm run log:export` (row 18
  was SQL-replica-regenerated). If churn, regenerate from export-decision-log.ts.
- Capture Taxonomy v1 open Qs to resolve AT schema build: wide-vs-normalized (defaulted
  wide — confirm); objections_raised/questions_asked keep-or-cut (recommend keep as nullable);
  Group A non-scoring confirm.
- #20: three-layer rate-limiting + spend caps — future security sprint, needs one live AI route.
- Spend caps (Anthropic/OpenAI/Netlify) — tied to #20.
- MedspaDB pricing eval — submit territory sample (DFW, Phoenix, one mid-size); spoke
  candidate screen blocked until data layer confirmed.
- LATEST.md vs SPRINT-STATE.md: handoff links, never restates. LATEST.md mirrors latest
  versioned handoff. Drift guardrail.

For sprint status see SPRINT-STATE.md — this handoff links there, does not restate it.
