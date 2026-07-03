# /data — static public-source datasets (formula-v2-public-source)

In-repo static files backing the addressable-market formula. **Not live APIs at request time** —
each is a snapshot with a provenance header, refreshed deliberately (via API pull or download).

| File | Task | Purpose | Status |
|------|------|---------|--------|
| `hud-usps-zip-county-crosswalk.json` | B | HUD USPS **ZIP↔County** crosswalk (+ ZIP-as-ZCTA resolution). **Geography join only** — which ZIPs/ZCTAs belong to a county/territory. | ✅ Populated — 54,234 rows, 51 states + DC |
| `experian-credit-share-by-state.json` | C | Experian FICO≥670 credit-qualified share by state (natl 70.4%, Sept 2025). | ⬜ Task C |
| `prevalence-by-age-sex.json` | D | Peer-reviewed hair-loss prevalence by age band × sex. **Provenance artifact** — generated from `HAIR_LOSS_PREVALENCE` (Rule 6 canonical); not the compute source. | ✅ Generated (28 entries) |

## HUD USPS ZIP↔County Crosswalk — how it's built

**Important:** HUD's USPS crosswalk provides **ZIP↔County** (also Tract/CBSA/CD/CountySub) — it has
**no ZCTA geography**. We therefore use the ZIP↔County crosswalk and apply the **ZIP-as-ZCTA**
resolution for the ACS join: each USPS ZIP is used directly as its ACS ZCTA5 (verified against
Marin ZIP 94901/94903/94904). See `ops.decision_log` — "HUD Crosswalk Methodology". This is the
correct HUD dataset — **not** Fair Market Rent, Income Limits, CHAS, or NCWM.

Pulled programmatically from the HUD USER API (`type=2`, per-state), not a manual download:

1. Export `HUD_API_KEY` (from `.env.local`; tsx/node does not auto-load it).
2. Run the pull (51 calls: 50 states + DC), writing `{ zip, zcta, county_fips, res_ratio }` rows.
   `res_ratio` is retained for **Task G** cross-county allocation (a ZIP spanning counties gets one
   row per county). `zcta` equals `zip` by the ZIP-as-ZCTA resolution.
3. `provenance.year/quarter/downloaded_at` are stamped from the API response, and
   `manual_download_required` is set to `false`.

`assertCrosswalkPopulated()` (see `src/lib/hud-crosswalk.ts`) throws in the pipeline path if the
file is empty or still flagged — a missing extract fails loudly rather than silently joining empty.

### Known residual (checked in Task G national reconciliation)

A small set of ZIPs have no clean ACS ZCTA equivalent (PO-box-only / single-business ZIPs) and will
return empty B19001 at ACS-ZCTA query time. These are logged as a residual on the HUD methodology
decision and verified during Task G — `res_ratio` weighting is expected to cover the material cases.
