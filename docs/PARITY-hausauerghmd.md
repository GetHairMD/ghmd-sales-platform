# Parity Review — in-platform `/p/[slug]` vs. `hausauerghmd.netlify.app` (Session D / D6)

**Owner of the retire decision: Trace.** This is a *report only* — per the Session D brief,
retiring the hausauerghmd Netlify clone is a Trace call. Nothing here retires it.

Compared: the hand-cloned single-prospect page (`hausauerghmd.netlify.app`, 16 sections) against
the data-driven in-platform proposal (`SALES-OS-SPEC.md` §6, 19 sections). Fetched 2026-07-05.

## Section-by-section

| # (spec §6) | In-platform section | Clone equivalent | Parity |
|---|---|---|---|
| 1 | Confidential top bar | (implicit header) | ✅ present both |
| 2 | Hero + stat strip ($4.2B/80M+/400%/51%) | §1 Header + §2 Market Context stats | ✅ parity |
| 3 | Practice Opportunity + ROI calculator | §3 "revenue already in your patient base" + calculator | ⚠ **divergent** — see Earnings note |
| 4 | Territory Analysis (map + demand table) | §4 "Your protected market" (map + demographics) | ✅ parity (our demand table = B01001 demographics, #68) |
| 5 | **Scarcity banner (NEW P0)** | — | ❌ **clone lacks** — ours adds it at peak-desire + repeat at CTA |
| 6 | Financing CTA (hot-lead trigger) | (calculator only) | ❌ **clone lacks the discrete "See what financing you qualify for" trigger** |
| 7 | Practice Alignment (4 fit bullets) | §5 "Why AesthetiX is a strong fit" | ✅ parity (ours now per-prospect via `alignment_bullets`, D5) |
| 8 | The Platform + G.E.M.S. | §6 "complete operating system" | ✅ parity |
| 9 | Proven Results (3 case-study tabs) | §7 Case Studies | ✅ parity |
| 10 | Physician Voices (Wistia, tracked) | §8 Physician Testimonials | ⚠ ours adds play-event tracking + brand-styled player |
| 11 | Training & Onboarding | §9 + §10 (Time Requirements) | ✅ parity |
| 12 | Patient Results (Ocean) | §11 "Real patients. Real outcomes" | ✅ parity (claims/consent gate, §10 ⚠) |
| 13 | National Network (80+ map) | §12 "80+ Locations & Growing" | ⚠ copy-consistency fix pending (80+ vs 65+ active), §6.13 |
| 14 | Investment ($179K + ROI snapshot) | §13 Investment + §14 Territory Value | ⚠ **divergent** — see Earnings note |
| 15 | Onboarding & Launch (4 phases) | §15 "100-Day Launch" | ✅ parity |
| 16 | Clinical Advisory Board | §16 Clinical Board | ✅ parity (both content-pending) |
| 17 | **Common Questions (always expanded)** | — | ❌ **clone has no FAQ** |
| 18 | **Next Step — embedded Calendly + form** | (no explicit scheduler) | ❌ **clone lacks in-page scheduler** (our URL is content-pending) |
| 19 | **Sticky bottom bar (mobile-persistent)** | — | ❌ **clone lacks** |

## Material discrepancies (ranked)

1. **Earnings figures — intentional divergence, do not "fix."** The clone shows revenue/earnings
   dollar figures in §2/§3/§13 (ROI calculators returning revenue, "the investment and what it
   returns"). The in-platform page **deliberately suppresses per-prospect earnings**: `scenario_outputs`
   is illustrative-only (#71, `legal_flag`) and, for **generator-minted** proposals, is **NULL** (revenue/
   ROI blocks render as pending). This is the standing legal posture (§10 ⚠ active 506(b) / FTC
   earnings-claim exposure), **not** a parity gap to close. The clone is the *more* exposed artifact here.
2. **Clone is missing four in-platform sections:** Scarcity banner (§5), Financing CTA trigger (§6),
   Common Questions/FAQ (§17), and the Sticky bottom bar (§19). The in-platform page is a superset.
3. **Instrumentation:** the in-platform page fires first-party events (section_view, dwell, calculator,
   financing_cta_click, video_play, Calendly booked/canceled) into `proposal_events`; the clone is static.
   This is what feeds the Session D dashboard + hot-lead triggers.
4. **Per-prospect vs. hand-cloned:** the clone is one hard-coded prospect (AesthetiX / San Rafael);
   the in-platform page is data-driven from `proposals` and mintable via the D3 generator.
5. **"Franchise" language:** clone uses "partner" framing; the in-platform surface carries **zero**
   prospect-facing "franchise" occurrences (Hard Rule 10). No violation either side.

## Content-pending on the in-platform side (not clone-parity gaps)

Wistia media IDs (§10), Calendly scheduling URL (§18), §6.13 network count/source, case-study copy,
advisory-board grid, §4C named support-team videos — all Trace-supplied; slots wired, content awaited.

## Recommendation (for Trace)

The in-platform page is at or ahead of the clone on every section **except content-pending slots**, and
is materially safer on earnings exposure. Once (a) the content-pending slots are filled and (b) a live
390px visual QA of a generated proposal passes on the deploy-preview, the clone is fully superseded and a
candidate for retirement. **Retire decision remains Trace's.**
