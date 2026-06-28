# GHMD Sales Platform — Session Handoff v2.16

Supersedes: v2.15 | Date: 2026-06-27
Platform: GHMD Sales Platform (validates/operationalizes the GHMD sales process — NOT the NIP)
Stack: Next.js 14 · Supabase · Netlify · Mapbox · Census API · Box Sign
Infra: Supabase cprltmwwldbxcsunsafl · Netlify 0a339783 · Repo GetHairMD/ghmd-sales-platform
Spec folder (Drive — human-read reference only): 1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z

> GUARDRAIL: This handoff LINKS to SPRINT-STATE.md for sprint status; it never restates
> sprint status. LATEST.md is a verbatim mirror of the highest-numbered handoff. If they
> diverge, the versioned vN.NN file wins and LATEST.md is regenerated from it.

## WHAT CHANGED (v2.15 → v2.16)
1. Capture Taxonomy v1 — ADOPTED. Method map + field dictionary for operator scoring. Five
   source types (enriched, ai_extracted, ai_derived [NEW], human_entered, human_override).
   ai_derived split from ai_extracted for clean confidence semantics. Added objections_raised,
   questions_asked beyond locked Tier 1 list. Group A enrichment non-scoring in v1.
   Logged ops.decision_log id=1.
2. Decision logging migrated Google Doc → Supabase ops.decision_log. 17 rows, ops schema,
   service-role-only RLS, DELETE revoked, self-FK superseded_by, indexed. Git mirror at
   /decisions/DECISION_LOG.md (npm run log:export). Old Doc frozen. id 15 corrected
   ADOPTED→LOCKED. PR #7 merged to main (87bdb19).
3. Handoffs moved to repo (/handoffs/), not Drive. Resolves the rule conflict where Coder
   can't fetch Drive. Versioned by git. LATEST.md mirrors the latest versioned handoff and
   links to SPRINT-STATE.md for sprint status.
4. CLAUDE.md: Decision Logging section + handoff-read rule + rule-change-by-quote meta-rule.
   Drive scoped to reference/export-only. RLS rule kept.

## LOCKED / DO NOT REOPEN
- Operator Score Architecture (LOCKED 2026-06-27): two-tier AI pre-score + human confirm 24h;
  four-column schema; low-confidence hard gate; composite never AI-alone; operator_score_composite
  nullable day one.
- Transcription Stack (LOCKED 2026-06-26): Recall.ai + AssemblyAI Universal-3 Pro + Medical
  Mode + Claude API. Whisper/Deepgram/Fireflies/Plaud rejected.
- Capture Taxonomy v1 (ADOPTED 2026-06-27).
- Bilateral qualification + operator-underwriting ($179K protected territory; intro call is
  underwriting event; needs both territory score + operator score).
- Capital gate: binary post-financing field, lender underwrites. NOT an intro-call input.
- Outcome metrics (LOCKED): signed AND funded; territory perf proxied by disposable reorder velocity.
- Three-layer rate-limiting + spend caps (PLANNED, Open Item #20, not built).

## NEXT SESSION — IMMEDIATE WORK
Coder builds operator scoring Supabase schema from Capture Taxonomy v1 field dictionary.
Wide-column pattern. source enum all five values. Four columns per scored field. Low-confidence
hard gate at composite-generation. Field Groups A–F. Override rate queryable per field.
DO NOT reopen operator score architecture, transcription stack, or capture taxonomy.

## OPEN ITEMS (carried)
- PR #9: pre-merge migration + clobber (package.json/scripts) drift check vs current main
  must be clean before squash-merge; correct the stale "docs-only" PR description.
  (foyfhh branch resolved: local-only, strict subset, deleted — no GitHub action.)
- LATEST.md vs SPRINT-STATE.md relationship: handoff links, never restates sprint status.
  LATEST.md mirrors the latest versioned handoff. Guardrail against drift.
- #20: three-layer rate-limiting + spend caps — future security sprint, needs one live AI route.
- Spend caps (Anthropic/OpenAI/Netlify) — tied to #20.
- MedspaDB pricing eval — submit territory sample (DFW, Phoenix, one mid-size); spoke
  candidate screen blocked until data layer confirmed.
- Capture Taxonomy v1 open Qs (defaulted): wide vs normalized (wide); objections_raised/
  questions_asked keep-or-cut; Group A non-scoring confirm — resolve at schema build.
