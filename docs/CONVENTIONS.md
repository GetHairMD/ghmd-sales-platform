# Code Conventions — GHMD Sales Platform

## TypeScript

- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` types — use `unknown` and narrow, or define explicit types
- All Supabase query results typed via generated types (`supabase gen types typescript`)
- Enums defined as `const` objects with `as const`, not TypeScript `enum`

## File Structure

```
/app                          Next.js App Router pages and layouts
/components                   Shared React components (no page-specific logic)
/lib                          Pure utility functions and constants
  addressable-market-constants.ts   Formula constants — single source of truth
/supabase
  /migrations                 SQL migration files — timestamp prefix required
  /functions                  Edge Functions — one directory per function
/types                        Shared TypeScript type definitions
```

## Supabase

- **All tables have RLS enabled from day one** — no exceptions
- Migrations use timestamp prefix: `YYYYMMDDHHMMSS_description.sql`
- Never use `supabase.from().select('*')` — always specify columns explicitly
- Service role key is server-only; never expose to client
- Edge Functions use Deno — no Node.js imports
- Cache Census API responses in `territories.census_raw_data` (90-day TTL)

## Formula Constants

All addressable market constants live in `/lib/addressable-market-constants.ts`:
- Hair loss prevalence rates by age × gender
- Propensity to act rates by age × gender
- Income band affordability base rates
- Housing cost adjustment formula
- Drive-time boundary values (30 min / 45 min)
- Financing take-up rate

**Never hardcode these values inline.** Import from the constants file.

## Environment Variables

| Prefix | Rule |
|--------|------|
| `NEXT_PUBLIC_` | Safe to expose to browser — only non-secret config |
| No prefix | Server-only — never reference in client components |

All env vars set via Netlify environment settings or `supabase secrets set`.
Never in `.env` committed to git.

## API Calls

- Census ACS: batch multiple zip codes in a single call (comma-separated, up to 500)
- Mapbox Isochrone: store full GeoJSON response — don't re-fetch if < 90 days old
- Google Places: use isochrone polygon to filter after initial radius pull
- Rate limit awareness: Census API 500 req/day per key — cache aggressively

## Git

- Branch strategy Sprint 1: **direct commits to main** — no feature branches, no PRs
- The draft PR used to land the initial file set (PR #2) was a one-time exception; all Sprint 1 work commits straight to main
- Commit messages: `type: description` (feat / fix / chore / docs / test / migration)
- Never force-push main
- Never commit secrets (pre-commit hook validates)

## Error Handling

- Edge Functions: always log `{ error, territory_id, timestamp }` before throwing
- No silent failures — every caught error must log
- Graceful error on bad address input: return structured error, don't crash
- Client-side: surface errors to user; don't swallow

## Naming

- Database tables: `snake_case` plural (e.g., `prospects`, `call_scores`)
- Database columns: `snake_case` (e.g., `payer_mix_cash_pct`)
- TypeScript: `camelCase` for variables/functions, `PascalCase` for types/components
- Files: `kebab-case.ts` for lib/util files, `PascalCase.tsx` for React components
- Supabase functions: `kebab-case` directory names (e.g., `calculate-addressable-market`)
