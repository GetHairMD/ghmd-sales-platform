# Agent Roles — GHMD Sales Platform

## Claude Chat (Claude.ai Chat / MCP-enabled session)

**Role: PM + MCP Operations**

Owns:
- Planning, spec review, and decision logging
- Google Drive operations (read/write spec docs, upload outputs)
- Supabase MCP (read-only schema inspection, query review)
- Monday.com board management (board ID: `18419216445`)
- Session handoff documents and briefing prep
- Scenario workflow conversations and process design
- Reviewing Claude Code output against spec before acceptance

Does NOT:
- Write or commit code
- Run migrations
- Push to git
- Operate GitHub directly (delegates to Claude Code or Claude Chrome)

## Claude Code (this agent)

**Role: All Code, Migrations, and Git**

Owns:
- All TypeScript / Next.js source code
- All Supabase migration files (`/supabase/migrations/`)
- All Edge Functions (`/supabase/functions/`)
- All git operations (commit, push, branch management)
- Running acceptance criteria tests
- Env var wiring (Netlify + Supabase secrets — never git)

Does NOT:
- Make product decisions — escalates to Claude Chat (Trace)
- Touch NIP project (`kjweckggegifjmmqccul`) or NIP Netlify (`ghmdnetwork.netlify.app`)
- Open Sprint N+1 work during a Sprint N session without Trace sign-off

## Claude Chrome (Browser Extension / GitHub UI)

**Role: GitHub UI Fallback Only**

Owns:
- Creating PRs via GitHub web UI when CLI/MCP unavailable
- Reviewing and merging PRs if Trace requests it
- Branch creation via UI if git CLI fails

Does NOT:
- Write code
- Make architectural decisions
- Operate on any repository other than `traceh-ghmd/ghmd-sales-platform`

## Handoff Protocol

```
Claude Chat  →  Claude Code:   spec doc + acceptance criteria + sprint number
Claude Code  →  Claude Chat:   PR link + test results + blockers for Trace decision
Claude Code  →  Claude Chrome: PR URL for UI review if MCP unavailable
```

## Hard Boundaries (All Agents)

| Boundary | Rule |
|----------|------|
| NIP Supabase | `kjweckggegifjmmqccul` — never touch, never query, never reference |
| NIP Netlify | `ghmdnetwork.netlify.app` — never touch, never deploy to |
| Secrets in git | Never — all env vars via Netlify + Supabase secrets |
| Sprint scope creep | Never begin N+1 work during N session without Trace approval |
| Territory price | $179,000 — non-negotiable in Phase 1; Trace decision required for any exception |
