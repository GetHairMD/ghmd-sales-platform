-- Sprint 2: Confirm auth-gated RLS on all Sprint 1 tables.
-- Existing "authenticated_all" policies (FOR ALL TO authenticated USING (true))
-- are correct for this single-org internal tool — all reps see all data.
-- auth.uid() row isolation is not required; authenticated role membership IS the gate.
-- This migration revokes anon access as belt-and-suspenders.

REVOKE ALL ON public.prospects FROM anon;
REVOKE ALL ON public.territories FROM anon;
REVOKE ALL ON public.deals FROM anon;
REVOKE ALL ON public.call_scores FROM anon;
REVOKE ALL ON public.spoke_candidates FROM anon;
REVOKE ALL ON public.outreach_touches FROM anon;
