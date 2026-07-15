> PRD v1.2 governs build phasing (P-1→P1); this spec governs
> proposal-system and Sales OS scope (Sessions B onward). Where they
> conflict, PRD wins until Session B opens.

# GHMD Sales Platform — Sales OS & Proposal System Spec v1.2
**Repo:** GetHairMD/ghmd-sales-platform · **Design reference:** gethairmd.biz (hausauerghmd Netlify project) + NIP design language & app shell · **Date:** 2026-07-04
**Rule 0 applies. Squash-merge only. Tokens from `src/design/tokens.ts` — raw Tailwind grays/blues are build failures.**

---

## 1. Problem Statement
Each prospect proposal is currently a hand-cloned Netlify project (e.g., `hausauerghmd`). This doesn't scale, invites copy/design drift per clone, gives no centralized analytics, and can't feed salesperson triggers. The Sales Platform already has `/proposals/[prospectId]` and a Supabase prospect record — the proposal page should be rendered there from data, not re-deployed per prospect.

## 2. Goals
1. One codebase renders every proposal at `/p/[slug]` (or `/proposals/[prospectId]`), pixel-matching the gethairmd.biz template.
2. Gated access with per-prospect identity → every visit, section view, and CTA click logged to Supabase.
3. Salesperson trigger feed (e.g., "clicked See What You Qualify For") surfaced on a new `/dashboard`.
4. Mobile-first (390px QA sweep standard, same as NIP QA-14).
5. New proposal spins up from the prospect record in minutes — zero Netlify work.

## 3. Non-Goals (v1)
- Per-prospect vanity domains (subpath on one domain is fine for v1; revisit if open-rate data says otherwise).
- Prospect self-serve editing, e-signature, or payment.
- Replacing the existing hausauerghmd site mid-deal — parallel-run until parity confirmed.
- CMS for template copy (copy lives in code constants for v1).

## 4. Architecture Decision
**Proposal pages are rendered by the Sales Platform from Supabase**, not cloned Netlify projects.
- Route: `/p/[slug]` where `slug` is unguessable (e.g., `hausauer-x7k2`).
- Gate: access code stored on prospect record (or Supabase magic link). On success, set signed cookie; log `proposal_session` row (prospect_id, ts, device, referrer). Netlify site-password gives no identity — do not use it.
- Netlify stays as the single host for the platform. Per-territory deploys are retired.

## 4B. App Shell & Information Architecture (v1.1 — from NIP screenshot review)
Adopt the NIP internal-app shell as the Sales Platform shell. Port the *patterns*, restyle from tokens — do not fork NIP code.

**Shell (desktop):** persistent left sidebar (GHMD logo + "SALES PLATFORM" wordmark; icon nav) · top bar (global search across prospects/territories, user chip, date) · main content begins with greeting header ("Good morning, {first_name}" + role-context subtitle) — same as NIP.

**Shell (mobile — deliberate deviation from NIP):** sidebar collapses to a bottom tab bar: Dashboard / Pipeline / Prospects / More. Reps live on phones; a hamburger-hidden sidebar buries the pipeline.

**Nav (v1):**
1. **Dashboard** — KPI stat-card grid with period deltas (↑/↓ vs last month, NIP pattern): pipeline value, active proposals, hot leads (7d), stage-conversion rate. Below it, the engagement feed rendered as NIP's **Recommended Actions** pattern — priority chip (High/Med/Low) + category tag + one-line action, e.g., `High · ENGAGEMENT · Dr. Hausauer clicked "See what you qualify for" — call today`. This merges §7 triggers and §8 dashboard into one proven component.
2. **Pipeline** — 11-stage view; default table using NIP's by-location rollup table pattern (sortable columns, status/grade chips); kanban is P1.
3. **Prospects** — list → `/prospects/[id]` detail (existing route).
4. **Proposals** — every live proposal page with engagement stats (visits, total dwell, last seen, hottest section) + link out to `/p/[slug]`.
5. **Deal Territories** — map-first view of sold/assigned territories; reuse NIP Network Map pattern incl. the existing `marker-animate` treatment; click territory → simplified summary (full sales detail lives on the proposal page, per Trace). Route `/territories` (renamed from "Territories" — label-only, PR4). New deal-track territories are created via the executive-only **New Territory** flow (`/territories/new`, PR #114): locate → create a draft `territories` row → size → approve its drive-time boundary. That row is real and eventually rep-visible — architecturally distinct from Territory Scouting (item 7).
6. **National Map** — standalone national status map of every territory (sold / in-pipeline / available), reusing the NIP Network Map pattern. Route `/national-map` (decisions #121/#122/#132). Visible to **all** viewers, reps and executives alike (no `execOnly`) — the route is gated server-side (`territory_status_map()` returns nothing to a non-internal caller), so nav visibility is intentionally open. Distinct from Deal Territories: a different route and a read-only status view with no click-through to prospect/deal records.
7. **Territory Scouting** *(executive-only)* — deal-independent market scouting: an executive picks a location and runs the v3 drive-time sizing engine against it to see the addressable-vs-floor result, purely for strategic planning. Route `/territory-scouting` (decision #146). Gated on `getViewerDesignation() === 'executive'` in **both** the page and its API routes (`/api/territory-scouting/reports*`) — reps and unauthenticated viewers never see it in nav (including the mobile bottom tab bar) and are refused (403) by every route. **Not** a territory-creation flow — that is the New Territory flow under Deal Territories (item 5). A scouting report is never rep-visible, never shown on the National Map, and is never promoted to a real territory in v1 (records live in `territory_scouting_reports`, executive-only RLS; the compute reuses the v3 engine's library functions, never the `/api/territories/size*` routes).
8. **Insights** — nav item present, badged "Coming Soon" (NIP does this with Insights/Q3; sets roadmap expectations cheaply).

**Primitives this adds to Session A:** Sidebar, BottomTabBar, TopBar w/ search, GreetingHeader, StatCardDelta, PriorityFeedItem, DataTable w/ chip cells, SlideOverDetailPanel (the NIP click-through detail drawer — reuse for prospect quick-view from Pipeline/Dashboard without leaving the page).

**GreetingHeader spec:** "Good {morning|afternoon|evening}, {first_name}" resolved from the user's local timezone, plus live date chip — identical behavior to NIP.

## 4C. Sales OS Modules (v1.2 — Trace additions, 2026-07-04)
Beyond proposals, the platform is the reps' operating system. Nav grows to: Dashboard · Pipeline · Prospects · Proposals · Territories · **Scoreboard** · **Community Board** · **Resources** · Insights (Coming Soon).

1. **Scoreboard / Bell Ringing (P1).** Port the NIP Scoreboard pattern to reps: rank cards + sortable table (deals closed, pipeline value, proposal engagement generated, streaks). **Bell Ringing:** a `deal_closed` event auto-posts a celebration card to the Community Board (rep, territory, confetti) and bumps the leaderboard — culture at near-zero build cost. Reuse SlideOverDetailPanel for rep detail.
2. **Community Board (P1).** Port NIP Community Board: pinned leadership announcements, tag filters (Announcements / Wins / Materials / Training / Competitive), search. Primary channel to talk to all reps at once; Bell Ringing posts land here.
3. **Resource Library — "Field Kit" (P1).** Single source of *approved* collateral so reps stop asking and can't circulate stale versions (this is also the compliance win — the library carries only APPROVAL/CLAIMS-matrix-cleared assets, each with version + approved date). Categories: Decks · Testimonial videos (Wistia) · Case studies · Clinical/medical evidence · Business-opportunity materials · Objection playbook. **Every asset gets Copy Link / Text / Email actions that generate per-rep, per-prospect tracked links** — proposal-style engagement analytics extend to all collateral, feeding the Dashboard action feed ("Dr. X watched the LUX testimonial twice").
   **Content-production record (owner: Trace — required for launch):**
   - [ ] Elevator Pitch video + accompanying slide deck
   - [ ] Quick intro videos: Trace, Bruce, Paul, Natalie, Blaine, Caylen, Phil, **Ericka (Implementation)** — leadership visibility + humanize the post-sale team prospects will live with
5. **Email & SMS Template Gallery (P1, lives in Resources).** Approved outreach templates by pipeline stage (first touch, post-proposal follow-up, re-engagement, event invite, post-Calendly no-show). Merge fields auto-fill from the prospect record ({first_name}, {territory_name}, {proposal_link}, {calendly_url}); one tap opens the rep's mail/SMS client pre-filled, links tracked. Templates are approved copy only — same version control as the rest of the Field Kit.
6. **Events & Invites (P1).** An Events module listing upcoming GHMD webinars and conferences (title, date, registration link, one-line pitch). From any prospect record or the event card: **"Invite prospect"** → pre-filled tracked invite (email/SMS template above) → RSVP/registration status writes back to the prospect timeline and fires a dashboard feed item ("Dr. Hausauer registered for the July webinar"). Event attendance becomes a pipeline signal, not just marketing. Webinar registration source: Calendly or Zoom registration webhook — decide at build.
4. **Demo Mode / "Show the Platform" (P2 — Coming Soon in nav).** NIP already runs a demo environment with simulated data and a demo login; weaponize it for sales. A guided, rep-led screen-share tour (≈5 scripted stops: Dashboard → Clinic Model → Patient Trainer → Prep Tool → Live Training) that lets the prospect *feel* network membership — the sophistication is the pitch. Guardrails: demo tenant only, "Simulated data" banner stays, **no prospect-facing credentials** (rep-driven screen share only), no live practice data ever shown. Positioning decision for a future session; hold as backlog.

## 4D. Rep Command Center (executive-only, fully concealed from reps)
**Purpose:** single view for executives to see who's doing what, how they're performing, and how money is actually moving — including negotiated exceptions to list price. Not visible to reps in any form — not in nav, not in DOM, not as a distinguishable 404.

**Nav & routing:** executive-only nav item, gated `execOnly` in nav AND every backing API route — same base pattern as Territory Scouting (§4B item 7), with one deliberate divergence: Territory Scouting returns 403 to unauthorized callers; Rep Command Center returns **404, indistinguishable from the site's real 404 page**, because the requirement here is concealment of existence, not just access denial. The nav item must be absent from the rendered response for a non-executive session, not merely CSS-hidden — a rep with devtools open should find nothing.

**Scope:** reps only (`internal_users.designation = 'rep'`). Executives are graders here, not graded.

**Metrics per rep:**
- Gross (count of Funded/Won closes × $179,000 list price) vs. **Net** (sum of actual `deals.territory_price` on Funded/Won closes — reflects any authorized discount)
- Discount frequency (% of closes below list) with breakdown by the four reason categories
- Average deal-cycle time (`prospects.created_at` → `funded_won_at`)
- Closing rate — TWO variants, not one: overall (won ÷ all assigned) and stage-qualified (won ÷ reached Proposal Sent). Different management questions.
- Engagement — proposal engagement (existing `proposal_events`) + Resource Library share activity once E-3 ships (soft dependency — render as unavailable, not broken, if E-3 hasn't shipped yet)
- Self-score vs. exec-score delta (`call_scores` vs. `rep_call_grades` — both exist, currently both empty; this view is ready the moment either gets populated, including by the Phase-2 Whisper/Claude call-scoring pipeline referenced in CLAUDE.md)
- Deal-health mix (active/stalled/lost, from `prospects.deal_status`)
- Funding-prequal skip rate (`prospects.skipped_funding_prequal`) — feeds the soft-funding-gate revisit trigger already noted in `docs/AGENTS.md`
- Speed-to-lead (approximate — no explicit assignment timestamp exists yet; Coder to use best available proxy, e.g. first `outreach_touches` row after `prospects.created_at`, and flag the approximation in code comments)
- Tenure (rep's `internal_users.created_at` as start-date proxy)
- Territory-quality-normalized deal size (deal price relative to the territory's addressable-market figure — a $179K close in a thin territory reads differently than the same number in a saturated one)
- Full per-deal drill-down via the existing `SlideOverDetailPanel` primitive
- **"Management tips" — explicit backlog, not built this session.** No concrete spec exists for what these should say; scope when there is one.

**Data model additions:**
- `deals.discount_reason` — CHECK-constrained: `speed_to_close | kol_political_sway | strategic_deal | multi_territory | other`
- `deals.discount_authorized_by` — uuid FK `auth.users`
- `CHECK (territory_price >= 179000 OR (discount_reason IS NOT NULL AND discount_authorized_by IS NOT NULL))` — a discounted deal without both fields fails at the database.
- New table `discount_authorizing_designations` (`designation` text PK, `added_by`, `added_at`) — seeded with `'executive'`. Trace directs Coder to add/remove designations; not a UI-managed CRUD screen this session, matches the existing manual-provisioning discipline (Hard Rule 6).
- Validation trigger on `deals` insert/update: when `discount_authorized_by` is set, look up that user's `internal_users.designation` and confirm it's present in `discount_authorizing_designations`; reject if not. A CHECK constraint cannot do this cross-table lookup — must be a trigger, same class as `stamp_community_board_review()`.
- `discount_reason` / `discount_authorized_by` are executive-write-only columns, same lockdown pattern as `funded_won_at` (E-1).

**Governance:** discounting is authorized commercial pricing discretion on licensee deals, formalized via `ops.decision_log` **decision #169** (adopted 2026-07-14, `legal_flag: false`, `residual_risk: none`). Not a compliance exception — Trace-confirmed as ordinary commercial discretion, distinct in kind from the standing ⚠ earnings-claims flag in §10, which remains open and unrelated.

## 5. Data Model — template variables (from red-circled screenshot audit)
Add/confirm on `prospects` (or a `proposals` table keyed to prospect):

| Field | Example | Where used |
|---|---|---|
| prospect_name_full | Amelia K. Hausauer, MD, FAAD | top bar, hero, alignment, final CTA headline |
| prospect_first_display | Dr. Hausauer | final CTA |
| practice_name | Aesthetx | hero card, alignment, form prefill |
| practice_logo_url | (their logo) | hero, territory card |
| practice_interior_photo_url | (lobby photo) | Practice Alignment |
| prospect_photo_url | (bio photo) | Territory Analysis |
| specialty | Dermatology | hero card, scenario copy |
| territory_name | San Rafael, CA | everywhere incl. sticky bar |
| territory_polygon (GeoJSON) + pin lat/lng | — | territory map |
| prepared_month | July 2026 | hero card |
| addressable_market_total / male_pct / female_pct | 11,100 / 44.2 / 55.8 | stat card, demand header |
| demand_matrix (JSON: age band × income tier × gender) | — | demand table |
| new_patients_range | 75–150 | stat card |
| scenario_inputs (patient_base, candidate_pct, conversion_pace) | 2,400 / 37% / 84 | sample scenario block |
| scenario_outputs (conservative/moderate/growth revenue, break-even) | $378K/$546K/$714K / 9 mo | scenario block + investment ROI snapshot |
| alignment_bullets (4 × title+body) | "Established dermatology practice…" | Practice Alignment |
| access_code / slug | — | gate |
| calendly_url | — | final CTA |

All numeric territory/scenario values compute from formula-v2 (`/lib/addressable-market-constants.ts`, Rule 6) — never hand-entered per proposal. Constants (case studies, GEMS, videos, $179K, advisory board, FAQ) live in template code.

## 6. Page Spec — section order & requirements (P0 unless noted)
1. **Confidential top bar** — "Prepared exclusively for {prospect_name_full}".
2. **Hero (dark)** — logos lockup (GHMD × {practice_logo}), headline with {territory_name} in Sunlights Cardo italic, prospect line, 4-field card (Practice/Specialty/Territory/Prepared), dual CTAs. Stat strip ($4.2B / 80M+ / 400% / 51%).
3. **Practice Opportunity (light)** — sample scenario well (variable), **interactive ROI calculator** (inputs: patient base, package mix, specialty → dark results card). Calculator inputs/outputs are analytics events.
4. **Territory Analysis (light)** — prospect photo + practice card, 3 stat cards (Addressable / New Patients / EXCLUSIVE), **territory map** (polygon + pin; brand the pin — no default blue marker), demand-by-age/income table.
   - **Mobile:** the demand matrix is the #1 risk. Collapse to summary cards (Total / Male / Female / Peak bands) with "View full table" horizontal-scroll disclosure. Never render 14 columns at 390px.
5. **Scarcity banner (NEW, P0)** — promote the line "Most physicians reach a decision within 2–3 conversations. Your {territory_name} territory is currently available — we cannot hold it without a signed agreement." Render as a full-width Sunlights-accented strip **immediately after Territory Analysis** (peak-desire moment), and **repeat** in small text at final CTA.
6. **Financing CTA (dark)** — "See what financing you qualify for." Click = **hot-lead trigger event**.
7. **Practice Alignment (dark)** — {practice_interior_photo}, 4 variable fit bullets w/ Sunlights checks.
8. **The Platform (light)** — Clinical/Business/Support cards + G.E.M.S. tiles. Static.
9. **Proven Results (light)** — 3 case-study tabs (Deschutes / LUX / Sand). Static. Tab clicks tracked.
10. **Physician Voices (dark)** — Wistia embeds. **Restyle default blue play button to brand** (Wistia player color API). Play events tracked.
11. **Training & Onboarding (light)** — testimonials + "What this actually requires of you" 3 cards.
12. **Patient Results (Ocean section)** — stats, before/afters, video. Static. *(Claims/consent — see §10.)*
13. **National Network (dark)** — 80+ map. Brand the markers (currently default blue). Fix copy inconsistency: "80+" headline vs "65+ active" body — one number, sourced from data.
14. **Investment (light)** — $179K block, ROI snapshot (variable scenario outputs), included-items grid, black "territory is an asset" card *(see §10 flag)*.
15. **Onboarding & Launch (light)** — 4 phases + named support team. Static.
16. **Clinical Advisory Board (light)** — static grid.
17. **Common Questions** — **always expanded; remove collapse/expand entirely.**
18. **Next Step (dark)** — "{prospect_first_display}, ready to see if {territory_name} is right for you?" Trace card, **embedded Calendly** as primary action, message form as secondary. Repeat scarcity line. Brand line KEEP • IMPROVE • GROW.
19. **Sticky bottom bar (all pages, mobile-persistent)** — "Reserve {territory_name} — talk to Trace" + GET STARTED (anchors to §18).

## 7. Analytics & Triggers
- **First-party events → Supabase `proposal_events`**: session_start, section_view (IntersectionObserver), calculator_interaction, financing_cta_click, calendly_open, calendly_booked (webhook), video_play, case_study_tab, get_started_click, dwell time.
- **Heatmaps/replay:** Microsoft Clarity (free) or PostHog (events+heatmaps+replay in one; preferred if consolidating). Decision: D-log entry required.
- **Triggers (P0):** financing_cta_click, 3rd+ session, >5 min total dwell → notify salesperson (email v1; Slack later) + surface in dashboard feed.

## 8. Dashboard (`/dashboard`) — P0 minimal
- Pipeline summary strip (11-stage counts).
- **Proposal engagement feed:** "Dr. Hausauer — 3 visits this week · 4 min on Investment · clicked financing." Sorted by heat.
- Hot-lead list (trigger hits, last 7 days). Everything links into `/prospects/[id]`.

## 9. Design & Mobile
- Execute strictly from `src/design/tokens.ts` (palette already matches gethairmd.biz: Ocean, Sunlights, near-black, Mist/cream, Cardo italic accents, DM Sans headings, all-caps tracked labels, pill CTAs).
- Section rhythm alternates dark ↔ light exactly as the template.
- 390px QA sweep on every section before merge (NIP QA-14 standard). Sticky bar must not obscure final CTA form on mobile.
- Lint/CI check: fail on `gray-`, `red-`, `blue-` raw utilities in `src/app` and `src/components`.

## 10. Open Questions & Counsel Flags (blocking marked ⚠)
- ⚠ **Legal (Rick Dahlson):** proposal contains earnings representations ("$300K in 9 months," "payback 9–18 months," revenue scenarios) and the "PE roll-up at a significant premium" statement, delivered to prospective licensees during an active 506(b). Confirm FTC Business Opportunity Rule / state business-opportunity & earnings-claim exposure and required disclaimers before this system scales send volume. Non-blocking for build; **blocking for broad rollout.**
- ⚠ **Claims/consent:** confirm patient consent on file for before/after photos and that "90% measurable improvement" language matches the CLAIMS_MATRIX once live.
- Analytics vendor: Clarity vs PostHog (owner: Trace; D-log).
- Do prospect logos/photos get stored in Supabase Storage with a takedown path? (Recommended yes.)
- Retire hausauerghmd Netlify project after first in-platform proposal parity check (owner: Trace).

## 11. Build Order
- **Session A (foundation):** token-enforcement rule + CI check; **app shell per §4B** (Sidebar, BottomTabBar, TopBar, GreetingHeader) + UI primitives (Button, Card, StatCard, StatCardDelta, PriorityFeedItem, DataTable, SectionHeader, StickyBar, DarkSection/LightSection, Input); restyle `/login` to NIP language; wrap existing `/pipeline` and `/prospects/[id]` in the shell.
- **Session B (proposal p1):** data model migration; gate + session logging; sections 1–5 incl. calculator + mobile demand-table treatment.
- **Session C (proposal p2):** sections 6–19; Wistia + Calendly; scarcity banner; event instrumentation.
- **Session D:** `/dashboard` + trigger notifications; **proposal generator flow** (rep selects prospect → formula-v2 computes → slug + access code minted → ready-to-send email/SMS copy on one screen); **auto-logged prospect timeline** on `/prospects/[id]` (proposal events + Calendly webhook + tracked-link opens; manual notes optional); 390px QA sweep; parity review vs hausauerghmd; retire clone.
- **Session E (Sales OS):** Scoreboard + Bell Ringing events; Community Board; Resource Library with tracked share links; email/SMS template gallery with merge fields; Events module + tracked prospect invites (RSVP → timeline + feed); objection playbook seeded from proposal FAQ content.
- **Backlog (P2):** Demo Mode guided tour; kanban pipeline; AI pre-meeting brief (one-tap prospect one-pager: practice snapshot, territory numbers, engagement heat, suggested talking points — candidate for Claude API once core ships); Insights.
Each session: one repo, decision-log entries via sanctioned path only.
