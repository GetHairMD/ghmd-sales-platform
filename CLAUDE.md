# GHMD Sales Platform — Claude Code Session Instructions

> Read this file at the start of every session. No exceptions.

## Project Identity

**GetHairMD Franchise Sales Platform** — a standalone Next.js / Supabase / Netlify application
purpose-built for franchise prospect-to-close sales operations.

This is **entirely separate** from the GHMD Network Intelligence Platform (NIP).

| Item | Value |
|------|-------|
| Repo | `ghmd-sales-platform` |
| Deploy | `ghmdsalesplatform.netlify.app` (main branch auto-deploys) |
| Supabase project | `ghmd-sales-platform` · ID: `cprltmwwldbxcsunsafl` |
| NIP Supabase ID | `kjweckggegifjmmqccul` — **NEVER TOUCH** |
| NIP Netlify | `ghmdnetwork.netlify.app` — **NEVER TOUCH** |
| Monday.com board | `18419216445` |

## Stack

- **Frontend**: Next.js (App Router)
- **Database**: Supabase (PostgreSQL + RLS + Edge Functions)
- **Deploy**: Netlify — `ghmdsalesplatform.netlify.app`
- **Maps**: Mapbox GL JS + Isochrone API (drive-time, not radius)
- **Demographics**: Census ACS API (B01001, B19001, B25105)
- **Phase 2**: Whisper + Claude API call scoring
- **Signing**: DocuSign (owned)
- **CRM stopgap**: AesthetiX / GHL (pipeline tracking only during build)

## NIP Separation — Hard Boundary

The NIP Supabase project (`kjweckggegifjmmqccul`) is a completely separate production system
serving franchisee operators. **Zero shared DB, auth, or codebase.** Before any schema or data
operation, confirm you are connected to `cprltmwwldbxcsunsafl` (ghmd-sales-platform).

Never:
- Query across projects
- Share environment variables between projects
- Reference NIP table names or IDs in this codebase

## Standing Rules for Every Session

0. **Rule 0 — Confirm git remote before writing any files.**
   Run `git remote -v` at the start of every session. Remote must be `traceh-ghmd/ghmd-sales-platform`. If remote shows `traceh-ghmd/gethairmd-network` (the NIP) or any other unexpected repo: STOP immediately. Do not write any files. Do not open any sprint. Flag to Trace and wait for instruction.
1. **Confirm Supabase project isolation** before any schema or data operation
2. All migrations go in `/supabase/migrations/` with timestamp prefix (`YYYYMMDDHHMMSS_description.sql`)
3. **RLS enabled on every table from creation** — never disabled
4. No secrets in code or git history — all env vars via Netlify + Supabase secrets
5. Census API responses cached in `territories.census_raw_data` — never re-fetched if < 90 days old
6. **Formula constants live in `/lib/addressable-market-constants.ts`** — never hardcoded inline
7. Every Edge Function has error logging — no silent failures
8. Sprint acceptance criteria must pass before closing the sprint
9. Report blockers immediately — do not work around schema issues silently
10. Branch strategy Sprint 1: **main only**

## Formula Constants Location

All addressable market formula constants are in `/lib/addressable-market-constants.ts`.
Never hardcode prevalence rates, propensity rates, income band base rates, or the housing
cost adjustment formula inline in Edge Functions or components. Always import from this file.

## Sprint Discipline

- Confirm current sprint with Trace at session start
- Do not begin Sprint N+1 work during a Sprint N session
- All acceptance criteria must pass before sprint is closed
- See `docs/SPRINT-STATE.md` for current sprint and open blockers
- See `docs/QA-SPRINT-1.md` for Sprint 1 acceptance criteria

## Agent Roles

See `docs/AGENTS.md` for full role definitions.

- **Claude Chat**: PM + MCP ops (planning, Drive, Supabase console, Monday.com)
- **Claude Code**: All code, migrations, git operations, Edge Functions
- **Claude Chrome**: GitHub UI fallback only (PR review, branch ops if CLI unavailable)

## Environment Variables

All secrets via Netlify environment variables and Supabase Edge Function secrets.
Never committed to git.

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Sales project only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never expose to client |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Client | Restricted to proposals.gethairmd.com domain |
| `CENSUS_API_KEY` | Server only | Edge Function only |
| `GOOGLE_PLACES_API_KEY` | Server only | Edge Function only; restricted to server IP |
| `DOCUSIGN_INTEGRATION_KEY` | Server only | |
| `DOCUSIGN_WEBHOOK_SECRET` | Server only | Verify webhook signatures |
| `GHL_WEBHOOK_SECRET` | Server only | Verify AesthetiX webhook signatures |
| `ANTHROPIC_API_KEY` | Server only | Phase 2: call scoring engine |

## Key Reference Values

| Item | Value |
|------|-------|
| Austin Westlake baseline | 5,483 addressable patients (Sprint 1 QA anchor) |
| Territory standard price | $179,000 (non-negotiable Phase 1) |
| Proposal subdomain | `proposals.gethairmd.com` |
| Drive folder | `1NX32J_EElgpANLzJetN1BmS6gOYzAK3Z` |
| GHMD primary color | `#4681A3` (OCEAN) |
| GHMD accent color | `#E5B36A` (SUNLIGHTS) |
