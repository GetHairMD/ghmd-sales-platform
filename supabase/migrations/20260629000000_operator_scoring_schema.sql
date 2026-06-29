-- Project: cprltmwwldbxcsunsafl (ghmd-sales-platform) — NOT NIP
--
-- Operator Scoring Schema v1 — built from Capture Taxonomy v1 (ADOPTED 2026-06-27).
-- Source of record for the field dictionary: scripts/seed_capture_taxonomy.sql
-- and decisions/DECISION_LOG.md ([2026-06-27] Capture Taxonomy v1).
--
-- Conforms to Operator Score Architecture (LOCKED 2026-06-27) and Capture Taxonomy v1:
--   * five capture source types (enriched, ai_extracted, ai_derived, human_entered, human_override)
--   * Group A enrichment is NON-SCORING and physically separated (own table)
--   * Groups B/C/D scored fields use the four-column pattern: value · source · confidence · notes
--   * Group E (human_override mechanics) enforced via the *_source column + override-requires-notes CHECK
--   * Group F record-level fields incl. nullable day-one operator_score_composite
--   * per-field override rate queryable via a view
--   * RLS enabled on every table at creation (Rule 3)
--
-- NOTE (Coder flag): the build spec requested `CREATE TYPE IF NOT EXISTS capture_source ...`.
-- PostgreSQL does NOT support IF NOT EXISTS on CREATE TYPE; that syntax errors on apply.
-- The guarded DO block below is the idiomatic, idempotent equivalent (same intent, runs clean).

BEGIN;

-- ---------------------------------------------------------------------------
-- Capture source enum — one enum, used across all scored-field *_source columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capture_source') THEN
    CREATE TYPE capture_source AS ENUM (
      'enriched',
      'ai_extracted',
      'ai_derived',
      'human_entered',
      'human_override'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. operators (STUB) — minimal FK anchor, replaced in full by Sprint 1
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE operators IS '-- STUB: minimal FK anchor. Full operators table built in Sprint 1. Replace entirely.';
-- operators.id is covered by the primary key index — no separate index needed.

-- ---------------------------------------------------------------------------
-- 2. operator_enrichment (Group A) — NON-SCORING context, context-only (no quad)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES operators(id),
  practice_npi text,
  years_in_practice integer,
  existing_aesthetic_services text,
  digital_footprint_present boolean,
  prior_financing_relationship boolean,
  captured_at timestamptz DEFAULT now(),
  source capture_source DEFAULT 'enriched'
);
ALTER TABLE operator_enrichment ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE operator_enrichment IS '-- Group A: NON-SCORING enrichment context. Not included in operator_score_composite.';
CREATE INDEX IF NOT EXISTS idx_operator_enrichment_operator_id ON operator_enrichment (operator_id);

-- ---------------------------------------------------------------------------
-- 3. operator_scores (Groups B, C, D) — wide column, four-column pattern
--    One row per operator per call/session.
--    Per scored field: _value · _source · _confidence (0..1) · _notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES operators(id),
  session_id uuid,

  -- ----- Group B (ai_extracted) -----
  stated_facts_value text,
  stated_facts_source capture_source DEFAULT 'ai_extracted',
  stated_facts_confidence numeric CHECK (stated_facts_confidence >= 0 AND stated_facts_confidence <= 1),
  stated_facts_notes text,

  revealed_behavior_value text,
  revealed_behavior_source capture_source DEFAULT 'ai_extracted',
  revealed_behavior_confidence numeric CHECK (revealed_behavior_confidence >= 0 AND revealed_behavior_confidence <= 1),
  revealed_behavior_notes text,

  response_classification_value text,
  response_classification_source capture_source DEFAULT 'ai_extracted',
  response_classification_confidence numeric CHECK (response_classification_confidence >= 0 AND response_classification_confidence <= 1),
  response_classification_notes text,

  follow_through_language_value text,
  follow_through_language_source capture_source DEFAULT 'ai_extracted',
  follow_through_language_confidence numeric CHECK (follow_through_language_confidence >= 0 AND follow_through_language_confidence <= 1),
  follow_through_language_notes text,

  objections_raised_value text,
  objections_raised_source capture_source DEFAULT 'ai_extracted',
  objections_raised_confidence numeric CHECK (objections_raised_confidence >= 0 AND objections_raised_confidence <= 1),
  objections_raised_notes text,

  questions_asked_value text,
  questions_asked_source capture_source DEFAULT 'ai_extracted',
  questions_asked_confidence numeric CHECK (questions_asked_confidence >= 0 AND questions_asked_confidence <= 1),
  questions_asked_notes text,

  -- ----- Group C (ai_derived) -----
  talk_time_ratio_value numeric,
  talk_time_ratio_source capture_source DEFAULT 'ai_derived',
  talk_time_ratio_confidence numeric CHECK (talk_time_ratio_confidence >= 0 AND talk_time_ratio_confidence <= 1),
  talk_time_ratio_notes text,

  answer_specificity_value numeric,
  answer_specificity_source capture_source DEFAULT 'ai_derived',
  answer_specificity_confidence numeric CHECK (answer_specificity_confidence >= 0 AND answer_specificity_confidence <= 1),
  answer_specificity_notes text,

  engagement_proxy_textual_value text,
  engagement_proxy_textual_source capture_source DEFAULT 'ai_derived',
  engagement_proxy_textual_confidence numeric CHECK (engagement_proxy_textual_confidence >= 0 AND engagement_proxy_textual_confidence <= 1),
  engagement_proxy_textual_notes text,

  -- ----- Group D (human_entered) -----
  affect_energy_value text,
  affect_energy_source capture_source DEFAULT 'human_entered',
  affect_energy_confidence numeric CHECK (affect_energy_confidence >= 0 AND affect_energy_confidence <= 1),
  affect_energy_notes text,

  coachability_value text,
  coachability_source capture_source DEFAULT 'human_entered',
  coachability_confidence numeric CHECK (coachability_confidence >= 0 AND coachability_confidence <= 1),
  coachability_notes text,

  motivation_authenticity_value text,
  motivation_authenticity_source capture_source DEFAULT 'human_entered',
  motivation_authenticity_confidence numeric CHECK (motivation_authenticity_confidence >= 0 AND motivation_authenticity_confidence <= 1),
  motivation_authenticity_notes text,

  engagement_value text,
  engagement_source capture_source DEFAULT 'human_entered',
  engagement_confidence numeric CHECK (engagement_confidence >= 0 AND engagement_confidence <= 1),
  engagement_notes text,

  chemistry_fit_value text,
  chemistry_fit_source capture_source DEFAULT 'human_entered',
  chemistry_fit_confidence numeric CHECK (chemistry_fit_confidence >= 0 AND chemistry_fit_confidence <= 1),
  chemistry_fit_notes text,

  created_at timestamptz DEFAULT now(),

  -- ----- Group E (human_override mechanics): every human_override requires notes -----
  CONSTRAINT override_requires_notes CHECK (
    (stated_facts_source <> 'human_override' OR (stated_facts_notes IS NOT NULL AND stated_facts_notes <> ''))
    AND (revealed_behavior_source <> 'human_override' OR (revealed_behavior_notes IS NOT NULL AND revealed_behavior_notes <> ''))
    AND (response_classification_source <> 'human_override' OR (response_classification_notes IS NOT NULL AND response_classification_notes <> ''))
    AND (follow_through_language_source <> 'human_override' OR (follow_through_language_notes IS NOT NULL AND follow_through_language_notes <> ''))
    AND (objections_raised_source <> 'human_override' OR (objections_raised_notes IS NOT NULL AND objections_raised_notes <> ''))
    AND (questions_asked_source <> 'human_override' OR (questions_asked_notes IS NOT NULL AND questions_asked_notes <> ''))
    AND (talk_time_ratio_source <> 'human_override' OR (talk_time_ratio_notes IS NOT NULL AND talk_time_ratio_notes <> ''))
    AND (answer_specificity_source <> 'human_override' OR (answer_specificity_notes IS NOT NULL AND answer_specificity_notes <> ''))
    AND (engagement_proxy_textual_source <> 'human_override' OR (engagement_proxy_textual_notes IS NOT NULL AND engagement_proxy_textual_notes <> ''))
    AND (affect_energy_source <> 'human_override' OR (affect_energy_notes IS NOT NULL AND affect_energy_notes <> ''))
    AND (coachability_source <> 'human_override' OR (coachability_notes IS NOT NULL AND coachability_notes <> ''))
    AND (motivation_authenticity_source <> 'human_override' OR (motivation_authenticity_notes IS NOT NULL AND motivation_authenticity_notes <> ''))
    AND (engagement_source <> 'human_override' OR (engagement_notes IS NOT NULL AND engagement_notes <> ''))
    AND (chemistry_fit_source <> 'human_override' OR (chemistry_fit_notes IS NOT NULL AND chemistry_fit_notes <> ''))
  )
);
ALTER TABLE operator_scores ENABLE ROW LEVEL SECURITY;

-- Group/default annotations on each _source column
COMMENT ON COLUMN operator_scores.stated_facts_source IS 'Group B — default ai_extracted';
COMMENT ON COLUMN operator_scores.revealed_behavior_source IS 'Group B — default ai_extracted';
COMMENT ON COLUMN operator_scores.response_classification_source IS 'Group B — default ai_extracted';
COMMENT ON COLUMN operator_scores.follow_through_language_source IS 'Group B — default ai_extracted';
COMMENT ON COLUMN operator_scores.objections_raised_source IS 'Group B — default ai_extracted';
COMMENT ON COLUMN operator_scores.questions_asked_source IS 'Group B — default ai_extracted';
COMMENT ON COLUMN operator_scores.talk_time_ratio_source IS 'Group C — default ai_derived';
COMMENT ON COLUMN operator_scores.answer_specificity_source IS 'Group C — default ai_derived';
COMMENT ON COLUMN operator_scores.engagement_proxy_textual_source IS 'Group C — default ai_derived';
COMMENT ON COLUMN operator_scores.affect_energy_source IS 'Group D — default human_entered';
COMMENT ON COLUMN operator_scores.coachability_source IS 'Group D — default human_entered';
COMMENT ON COLUMN operator_scores.motivation_authenticity_source IS 'Group D — default human_entered';
COMMENT ON COLUMN operator_scores.engagement_source IS 'Group D — default human_entered';
COMMENT ON COLUMN operator_scores.chemistry_fit_source IS 'Group D — default human_entered';

CREATE INDEX IF NOT EXISTS idx_operator_scores_operator_id ON operator_scores (operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_scores_session_id ON operator_scores (session_id);

-- ---------------------------------------------------------------------------
-- 4. operator_score_records (Group F) — record-level review + composite
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_score_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES operators(id),
  session_id uuid,
  reviewed_at timestamptz,
  reviewed_by text,
  operator_score_composite numeric,
  triage_recommendation text CHECK (triage_recommendation IN ('proceed', 'conditional', 'pass')),
  capital_status text,
  created_at timestamptz DEFAULT now(),

  -- Low-confidence hard gate: floor only; real gate enforced at composite-generation in app layer
  CONSTRAINT low_confidence_gate CHECK (operator_score_composite IS NULL OR operator_score_composite >= 0)
);
ALTER TABLE operator_score_records ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN operator_score_records.operator_score_composite IS '-- Nullable day-one. Populated only after 6-12 months of outcome validation. Never AI-alone.';
COMMENT ON COLUMN operator_score_records.capital_status IS '-- Records financing outcome. NOT a scoring input.';
COMMENT ON CONSTRAINT low_confidence_gate ON operator_score_records IS '-- Low-confidence hard gate enforced at composite-generation time in application layer, not at insert. This constraint is a floor only.';

CREATE INDEX IF NOT EXISTS idx_operator_score_records_operator_id ON operator_score_records (operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_score_records_reviewed_at ON operator_score_records (reviewed_at);

-- ---------------------------------------------------------------------------
-- 5. operator_score_override_rates — per-field override rate (platform health metric)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW operator_score_override_rates AS
SELECT
  COUNT(*) FILTER (WHERE stated_facts_source = 'human_override') AS stated_facts_override_count,
  COUNT(*) AS stated_facts_total,
  ROUND(COUNT(*) FILTER (WHERE stated_facts_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS stated_facts_override_rate,

  COUNT(*) FILTER (WHERE revealed_behavior_source = 'human_override') AS revealed_behavior_override_count,
  COUNT(*) AS revealed_behavior_total,
  ROUND(COUNT(*) FILTER (WHERE revealed_behavior_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS revealed_behavior_override_rate,

  COUNT(*) FILTER (WHERE response_classification_source = 'human_override') AS response_classification_override_count,
  COUNT(*) AS response_classification_total,
  ROUND(COUNT(*) FILTER (WHERE response_classification_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS response_classification_override_rate,

  COUNT(*) FILTER (WHERE follow_through_language_source = 'human_override') AS follow_through_language_override_count,
  COUNT(*) AS follow_through_language_total,
  ROUND(COUNT(*) FILTER (WHERE follow_through_language_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS follow_through_language_override_rate,

  COUNT(*) FILTER (WHERE objections_raised_source = 'human_override') AS objections_raised_override_count,
  COUNT(*) AS objections_raised_total,
  ROUND(COUNT(*) FILTER (WHERE objections_raised_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS objections_raised_override_rate,

  COUNT(*) FILTER (WHERE questions_asked_source = 'human_override') AS questions_asked_override_count,
  COUNT(*) AS questions_asked_total,
  ROUND(COUNT(*) FILTER (WHERE questions_asked_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS questions_asked_override_rate,

  COUNT(*) FILTER (WHERE talk_time_ratio_source = 'human_override') AS talk_time_ratio_override_count,
  COUNT(*) AS talk_time_ratio_total,
  ROUND(COUNT(*) FILTER (WHERE talk_time_ratio_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS talk_time_ratio_override_rate,

  COUNT(*) FILTER (WHERE answer_specificity_source = 'human_override') AS answer_specificity_override_count,
  COUNT(*) AS answer_specificity_total,
  ROUND(COUNT(*) FILTER (WHERE answer_specificity_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS answer_specificity_override_rate,

  COUNT(*) FILTER (WHERE engagement_proxy_textual_source = 'human_override') AS engagement_proxy_textual_override_count,
  COUNT(*) AS engagement_proxy_textual_total,
  ROUND(COUNT(*) FILTER (WHERE engagement_proxy_textual_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS engagement_proxy_textual_override_rate,

  COUNT(*) FILTER (WHERE affect_energy_source = 'human_override') AS affect_energy_override_count,
  COUNT(*) AS affect_energy_total,
  ROUND(COUNT(*) FILTER (WHERE affect_energy_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS affect_energy_override_rate,

  COUNT(*) FILTER (WHERE coachability_source = 'human_override') AS coachability_override_count,
  COUNT(*) AS coachability_total,
  ROUND(COUNT(*) FILTER (WHERE coachability_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS coachability_override_rate,

  COUNT(*) FILTER (WHERE motivation_authenticity_source = 'human_override') AS motivation_authenticity_override_count,
  COUNT(*) AS motivation_authenticity_total,
  ROUND(COUNT(*) FILTER (WHERE motivation_authenticity_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS motivation_authenticity_override_rate,

  COUNT(*) FILTER (WHERE engagement_source = 'human_override') AS engagement_override_count,
  COUNT(*) AS engagement_total,
  ROUND(COUNT(*) FILTER (WHERE engagement_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS engagement_override_rate,

  COUNT(*) FILTER (WHERE chemistry_fit_source = 'human_override') AS chemistry_fit_override_count,
  COUNT(*) AS chemistry_fit_total,
  ROUND(COUNT(*) FILTER (WHERE chemistry_fit_source = 'human_override')::numeric / NULLIF(COUNT(*), 0), 4) AS chemistry_fit_override_rate
FROM operator_scores;

COMMIT;
