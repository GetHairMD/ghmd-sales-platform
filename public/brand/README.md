# GHMD Brand Assets

Committed logo files for the Territory Sales OS (PRD v1.2 §4.2, P0). Reference
these through [`src/design/brand.ts`](../../src/design/brand.ts) and the
`<Logo>` component — never hardcode a `/brand/...` path in a raw `<img>`.

Source: exported from the GHMD brand Drive folder by Trace, 2026-07-03.

## Assets

| File | Variant | Tone / Layout | Dimensions | Source filename | Use when |
|------|---------|---------------|------------|-----------------|----------|
| `gethairmd-logo-black.png` | `primary` | black · stacked | 2978×2006 | `GHMD_Logo_RGB_Black.png` | Default lockup on light surfaces (app chrome, Proposal Page on white). |
| `gethairmd-logo-white.png` | `white` | white · horizontal | 1172×300 | `GHMD-Horizontal-Logo-w-Icon-White-02.png` | Reversed lockup on dark surfaces (dark hero, primary-filled bars). |
| `gethairmd-icon-black.png` | `icon` | black · mark only | 2149×2958 | `GHMD_Icon_RGB_Black.png` | Flame mark alone — favicons, compact chrome, avatars. |
| `gethairmd-logo-black-sm.png` | `compact` | black · stacked | 369×249 | `ghmd logo black for documents.png` | Tight/document contexts where the full-res lockup is overkill. |

All four are transparent-background PNGs (32-bit ARGB).

## Monochrome system — note on "full-color"

The kickoff asked for **full-color, white, black** variants. The GHMD mark is a
**monochrome system**: the export contains black + white(reversed) + icon only —
there is no separate OCEAN/SUNLIGHTS color lockup. The primary **black** lockup
serves as the canonical/"full-color" reference; white is the dark-surface
reverse. If a color lockup is later intended, drop it in and add a `color`
variant to `brand.ts`. Flagged for Trace's design review.

## Usage rules

- **Min-size** — do not render below the per-asset `minWidthPx` in `brand.ts`
  (primary/white 120px, compact 96px, icon 24px). `<Logo>` warns in dev if
  violated.
- **Clear space** — keep clear space around the logo of at least **25%** of its
  rendered height (`LOGO_CLEAR_SPACE_RATIO`). Pass `clearSpace` to `<Logo>` to
  reserve it automatically.
- **Tone by surface** — black on light, white on dark. Never place the black
  lockup on a dark/photographic background or the white lockup on light.
- **Do not** recolor, rotate, stretch, add effects, or box the mark.
