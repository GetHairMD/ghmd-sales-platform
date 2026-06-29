-- Project: cprltmwwldbxcsunsafl (ghmd-sales-platform) — NOT NIP
--
-- Follow-up to 20260629000000_operator_scoring_schema.sql.
-- Fixes security advisor ERROR 0010_security_definer_view on
-- public.operator_score_override_rates.
--
-- Supabase creates views as SECURITY DEFINER by default, which runs the view
-- with the creator's privileges and bypasses the querying user's RLS. This
-- migration drops and recreates the view WITH (security_invoker = true) so it
-- respects the caller's permissions and RLS policies. The SELECT definition is
-- byte-for-byte identical to the original — only the security property changes.

BEGIN;

DROP VIEW IF EXISTS operator_score_override_rates;

CREATE VIEW operator_score_override_rates
WITH (security_invoker = true) AS
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
