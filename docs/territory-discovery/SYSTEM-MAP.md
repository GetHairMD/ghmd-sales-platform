# One-Page System Map — GetHairMD Sales Platform

**Prepared 2026-07-24 · Companion to EXECUTIVE-PRESENTATION.md · Evidence in SOURCE-REGISTER.md**

Status labels: **Live** · **Built, unvalidated** · **In development** · **Approved future design** ·
**Concept requiring approval** · **Human only**. Provisional items marked `[PROVISIONAL]`.
**Evidence standard:** a capability is **Live** only with dated evidence it is operational in the live
Sales Platform environment (`cprltmwwldbxcsunsafl` / production); "a file or migration exists" alone → **Built, unvalidated**.

```mermaid
flowchart TB
    subgraph SRC["Data sources & providers"]
        CENSUS["U.S. Census ACS — income<br/>(Live: Production request verified [HANDOFF v2.62 §4.2])"]
        CREDIT["Credit quality / Experian — financeable share<br/>(Built, unvalidated: data present, consumption unverified)<br/>[REPO: data/sources/GHMD_State_Analysis_Data_Dump.csv]"]
        MAPBOX["Mapbox — map display + drive-time isochrones<br/>(Built, unvalidated: token provisioned, op unverified)<br/>editing (Approved future design)"]
        ARCGIS["ArcGIS Online — 80+ REAL sold territories<br/>(Approved future design: transition) [DECISION #141]"]
    end

    subgraph FORMULA["Governing equations (corporate-only; reps see outputs only)"]
        V2["Addressable v2 = households x income-qualified x credit-eligible<br/>(Built, unvalidated: constants locked; live run unverified)<br/>[REPO: lib/addressable-market-constants.ts]"]
        V3["v3 drive-time sizing: grow 5-45 min to >=18,600 qualified HH<br/>(Built, unvalidated) — 0 run in prod [DB 2026-07-24]<br/>62 x 1.5 = 93 customers / 0.5% Conservative = 18,600 HH [PROVISIONAL]<br/>[REPO: src/lib/__tests__/v3-constants.test.ts]"]
    end

    subgraph STORE["Supabase / PostGIS 3.3.7 in extensions (Live infra, dated catalog [DB 2026-07-24])"]
        BGEOM["boundary_geom (current sizing output, re-derivable pre-sale)<br/>(Built, unvalidated) — 0 rows populated [DB 2026-07-24]"]
        SOLD["sold_boundary_geom — FROZEN, write-once, never recomputed<br/>(Live: guard territories_sold_boundary_guard applied & enabled,<br/>dated catalog [DB 2026-07-24]; guards 0 rows today)<br/>[REPO: supabase/migrations/20260710140000_governed_row_write_guards.sql]"]
        STATUS["status: available / draft / sold<br/>DB today = DEMO ONLY (21 'sold' are demo) [DB 2026-07-24]"]
    end

    subgraph MAP["National Network Map"]
        NMAP["Renders DB rows (Built, unvalidated: code exists, live render unverified)<br/>— currently DEMO coverage, not real [DB: F13]"]
    end

    subgraph GATES["Deal gates — HUMAN ONLY decisions"]
        QUAL["Qualification gate (Built, unvalidated)"]
        PROP["Proposal gate — no viability leaks to prospect<br/>(Built, unvalidated; revenue illustrative-only, decision #71)<br/>[REPO: docs/TERRITORY-METHODOLOGY.md §7] [PROVISIONAL]"]
        PRICE["Territory price $179,000 (Live: in force) [REPO: AGENTS.md]<br/>Human-only to change"]
    end

    subgraph WORK["Meeting workspace — Approved future design (Phase 3)"]
        ZOOM["Zoom entry + script panel + required questions<br/>+ consent + transcript capture (NOT built) [PROVISIONAL]"]
        OUTLOOK["Outlook-derived communication summaries (NOT built) [PROVISIONAL]"]
    end

    subgraph EVAL["Evaluation — kept separate"]
        PEVAL["Prospect eval: icp_score (Built, unvalidated) / AI scoring (Approved future design)"]
        SEVAL["Salesperson eval: call scoring (Concept requiring approval)<br/>comp/discipline = Human only"]
    end

    subgraph AI["AI assistance — Approved future design (Phase 4)"]
        AISUM["Summaries · missing-info · stalled alerts · next steps<br/>(rule-based stalled signal in code = Built, unvalidated) [REPO: src/lib/dashboard/triggers.ts]"]
        AUTO["Controlled low-risk automation (draft-for-human-send)"]
        RAILS["Rails: permission-safe retrieval · citations · confidence<br/>· model/rubric version · reviewer edits · overrides · audit"]
    end

    HUMAN["HUMAN AUTHORITY — qualification · territory rights · pricing · contracting<br/>· funding · loss status · compensation · discipline · legal · access control<br/>(Human only) [REPO: docs/GHMD-CRM-003.md §11]"]

    CENSUS --> V2
    CREDIT --> V2
    MAPBOX --> V3
    V2 --> BGEOM
    V3 --> BGEOM
    ARCGIS -. "verbatim import, NEVER re-sized (future, gated)" .-> SOLD
    BGEOM --> STATUS
    SOLD --> STATUS
    STATUS --> NMAP
    STATUS --> GATES
    WORK --> EVAL
    EVAL --> AI
    AI --> HUMAN
    GATES --> HUMAN
    AISUM --> RAILS
    AUTO --> RAILS
    RAILS --> HUMAN

    classDef live fill:#DFF5E1,stroke:#2E7D32,color:#153;
    classDef built fill:#FFF6D6,stroke:#B8860B,color:#432;
    classDef future fill:#E3EEF6,stroke:#4681A3,color:#123;
    classDef concept fill:#F3E1E1,stroke:#B23,color:#411;
    classDef human fill:#EDE3F6,stroke:#6A3,color:#312,stroke-width:3px;

    class CENSUS,SOLD,PRICE live;
    class V2,V3,MAPBOX,CREDIT,BGEOM,STATUS,NMAP,QUAL,PROP,PEVAL built;
    class ARCGIS,ZOOM,OUTLOOK,AISUM,AUTO,RAILS future;
    class SEVAL concept;
    class HUMAN,GATES human;
```

## Legend

| Color | Meaning |
|---|---|
| 🟢 Green | **Live** — operational today, backed by dated live evidence |
| 🟡 Amber | **Built, unvalidated** — code/schema exists, not proven operational in the live environment |
| 🔵 Blue | **Approved future design** — designed & sequenced, not built |
| 🔴 Red | **Concept requiring approval** — not designed/approved for build |
| 🟣 Purple (bold) | **Human only** — consequential decisions reserved for people |

## The three lines that never bend

1. **ArcGIS → `sold_boundary_geom` is a *verbatim* copy, never a recalculation.** Sold boundaries are
   contracts. [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]
2. **The database today holds demo data only** — the map is illustrative until the real import lands. [DB: F13]
3. **AI assists; humans decide.** Every consequential outcome routes to Human authority with an audit trail. [REPO: docs/GHMD-CRM-003.md §11]
