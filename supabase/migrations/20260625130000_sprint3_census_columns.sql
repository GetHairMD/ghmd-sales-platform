-- Sprint 3: Add Census ACS caching columns to territories
-- Per CLAUDE.md: Census API responses cached in territories.census_raw_data — never re-fetched if < 90 days old

ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS census_raw_data     JSONB,
  ADD COLUMN IF NOT EXISTS census_fetched_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.territories.census_raw_data   IS 'Raw Census ACS 5-year variable map; cached per CENSUS_CACHE_TTL_DAYS (90 days)';
COMMENT ON COLUMN public.territories.census_fetched_at IS 'Timestamp when census_raw_data was last fetched from Census API';
