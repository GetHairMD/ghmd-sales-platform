-- NPI Provider Cache — server-side cache of CMS NPPES NPI Registry lookups.
-- Populated by an Edge Function using the service role; not exposed to the client.
-- Cache TTL is 90 days (see expires_at); rows past expires_at are re-fetched.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

create table if not exists public.npi_provider_cache (
  npi                  text        primary key,                         -- 10-digit NPI number
  taxonomy_code        text        not null,
  taxonomy_description text        not null,
  provider_first_name  text,
  provider_last_name   text,
  organization_name    text,
  city                 text,
  state                char(2),
  postal_code          text,
  enumeration_type     text        check (enumeration_type in ('NPI-1', 'NPI-2')),
  fetched_at           timestamptz not null default now(),
  expires_at           timestamptz not null default (now() + interval '90 days')  -- cache TTL: 90 days from fetch
);

-- RLS enabled, no public access. Service role (Edge Function) bypasses RLS;
-- anon and authenticated roles get no policy and are therefore denied.
alter table public.npi_provider_cache enable row level security;

create policy "service_role read"  on public.npi_provider_cache
  for select using (auth.role() = 'service_role');
create policy "service_role write" on public.npi_provider_cache
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Lookup indexes.
create index idx_npi_provider_cache_state         on public.npi_provider_cache(state);
create index idx_npi_provider_cache_taxonomy_code on public.npi_provider_cache(taxonomy_code);
-- Cache-expiry queries.
create index idx_npi_provider_cache_expires_at    on public.npi_provider_cache(expires_at);
