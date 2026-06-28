-- GHMD Sales Platform — Decision Log seed entry
-- The in-flight decision from session GHMD_Sales_Platform_Handoff_v2.15 (2026-06-27)
-- Seeded FIRST in the migration so it cannot be lost.

insert into ops.decision_log
  (decided_on, platform, title, decision, reasoning, status, legal_flag, source_session)
values
(
  '2026-06-27',
  'sales',
  'Capture Taxonomy v1',
  $decision$
Capture Taxonomy v1 adopted as the governing source-logic map and field dictionary for operator scoring data capture. Conforms to Operator Score Architecture (LOCKED 2026-06-27) and Call Capture & Transcription Stack (LOCKED 2026-06-26) — operationalizes both into a buildable Supabase schema; does not redefine either.

STRUCTURE — two parts:
Part 1 Capture-Method Map (governing source logic, prevents source contamination).
Part 2 Field Dictionary (schema-of-record Coder builds from).

CAPTURE METHODS — five source types:
- enriched: pre-call external behavioral residue
- ai_extracted: facts lifted verbatim from transcript
- ai_derived: metrics computed from transcript (NEW — see addition note)
- human_entered: judgment-only fields, AI never writes
- human_override: logged correction to an AI value

FIELD GROUPS:
- Group A pre-call enrichment (enriched) — NON-SCORING context in v1; schema-separated so it cannot leak into a future weighted composite without an explicit decision. Fields: practice_npi, years_in_practice, existing_aesthetic_services, digital_footprint_present, prior_financing_relationship.
- Group B transcript extraction (ai_extracted): stated_facts, revealed_behavior, response_classification, follow_through_language, objections_raised, questions_asked.
- Group C transcript derivation (ai_derived): talk_time_ratio, answer_specificity, engagement_proxy_textual.
- Group D human judgment-only (human_entered): affect_energy, coachability, motivation_authenticity, engagement, chemistry_fit.
- Group E human confirmation layer (override mechanics; notes required on human_override).
- Group F record-level: reviewed_at, reviewed_by, operator_score_composite (nullable, day-one, NULL until outcome-validated), triage_recommendation (proceed/conditional/pass), capital_status (approved/declined/amount — NOT a score input).

SCHEMA PATTERN: four columns per scored field — value · source · confidence · notes. Source enum carries all five values. Low-confidence = hard gate at composite-generation (not at insert). Override rate queryable per field as platform health metric. Recommended build: wide columns over normalized child table for v1.
  $decision$,
  $reasoning$
ARCHITECTURAL ADDITION — ai_derived as a fifth source type, splitting the locked Tier 1 list. The locked list mixed extracted facts (stated_facts, follow_through_language) with computed metrics (talk_time_ratio, answer_specificity). These cannot share confidence semantics: ai_extracted confidence = extraction certainty ("did the model read it right"); ai_derived confidence = computational completeness ("was the transcript complete enough to compute"). Collapsing them corrupts the override-rate health metric — a low computed-confidence (bad diarization) would masquerade as a bad extraction prompt and trigger a pointless prompt revision. This is the ONLY addition to the locked architecture in v1. Approved by Trace 2026-06-27. One-line revert if rejected: collapse ai_derived into ai_extracted.

engagement appears twice BY DESIGN: engagement_proxy_textual (Group C, computed signal) vs engagement (Group D, human judgment). Kept as separate schema fields so the AI proxy informs but does not anchor the human's judgment. Not a duplication error.

Two extraction fields added beyond the locked Tier 1 list — objections_raised, questions_asked — as buying-signal proxies. Scope additions, not architecture changes; cut if v1 scope tightens.

Group A walled off as non-scoring to prevent verifiable enrichment context from being silently absorbed into a future weighted operator score without an explicit weighting decision.
  $reasoning$,
  'ADOPTED',
  true,
  'GHMD_Sales_Platform_Handoff_v2.15'
);
