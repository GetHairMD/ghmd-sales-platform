CREATE TABLE IF NOT EXISTS public.activities (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now() NOT NULL,
  prospect_id   uuid        NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  activity_type text        NOT NULL CHECK (activity_type IN ('note', 'call_log')),
  body          text        NOT NULL,
  created_by    text        NOT NULL
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_activities_prospect_id ON public.activities(prospect_id);
CREATE INDEX idx_activities_created_at  ON public.activities(created_at DESC);
