/**
 * GHMD Design Tokens — single source of truth (PRD v1.2 §4.2).
 *
 * Color, typography, spacing, radius, elevation, and motion all originate here.
 * `tailwind.config.ts` consumes these exports so Tailwind utilities and raw
 * component styles never diverge. NEVER hardcode a hex, font, or spacing value
 * inline — import the token.
 *
 * Brand values are final per crm-demo-v1 P0 (NIP parity by convention).
 * The internal app uses the utilitarian end of the scale; the public Proposal
 * Page uses the expressive end (display type, larger elevation).
 */

/** Raw named brand palette — the atomic hexes. Prefer the semantic layer below. */
export const palette = {
  ocean: '#4681A3', // OCEAN — primary
  almostRose: '#DBCBBD', // ALMOST ROSE — secondary
  sunlights: '#E5B36A', // SUNLIGHTS — accent
  black: '#040404', // BLACK
  shadow: '#544F54', // SHADOW
  white: '#FFFFFF',
  mist: '#F2F2F2', // MIST
  // Semantic hues
  success: '#4CAF50',
  warning: '#E5B36A', // == SUNLIGHTS by design
  error: '#C0392B',
  info: '#4681A3', // == OCEAN by design
} as const;

/**
 * Semantic color roles — what components reference. Each maps to a palette hex,
 * so intent (primary/error/text.muted) stays decoupled from the raw value.
 */
export const color = {
  primary: palette.ocean,
  secondary: palette.almostRose,
  accent: palette.sunlights,

  text: {
    DEFAULT: palette.black, // body text
    muted: palette.shadow, // secondary text
    inverse: palette.white, // on dark / on primary
  },

  bg: {
    DEFAULT: palette.white, // app surface
    subtle: palette.mist, // subtle fills, zebra, wells
    dark: palette.black, // dark surface (Proposal Page expressive)
  },

  success: palette.success,
  warning: palette.warning,
  error: palette.error,
  info: palette.info,

  // Brand names kept addressable for the expressive Proposal Page range.
  ocean: palette.ocean,
  almostRose: palette.almostRose,
  sunlights: palette.sunlights,
  mist: palette.mist,
  shadow: palette.shadow,
} as const;

/**
 * Font families, wired to the next/font CSS variables set in `layout.tsx`.
 * DM Sans = headings + all-caps labels/buttons · Poppins = body/UI ·
 * Cardo = serif accent (subtitles, pull quotes, brand line) · Source Code Pro = mono.
 */
export const fontFamily = {
  heading: ['var(--font-dm-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  body: ['var(--font-poppins)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  serif: ['var(--font-cardo)', 'ui-serif', 'Georgia', 'serif'],
  mono: ['var(--font-source-code-pro)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
} as const;

/** Type scale (rem) with paired line-heights — executive, strong hierarchy. */
export const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }], // 12/16
  sm: ['0.875rem', { lineHeight: '1.25rem' }], // 14/20
  base: ['1rem', { lineHeight: '1.5rem' }], // 16/24
  lg: ['1.125rem', { lineHeight: '1.75rem' }], // 18/28
  xl: ['1.25rem', { lineHeight: '1.75rem' }], // 20/28
  '2xl': ['1.5rem', { lineHeight: '2rem' }], // 24/32
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30/36
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36/40
  '5xl': ['3rem', { lineHeight: '1.1' }], // 48 — display (Proposal Page)
  '6xl': ['3.75rem', { lineHeight: '1.05' }], // 60 — display (Proposal Page)
} as const;

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Wider tracking for the all-caps DM Sans labels/buttons and the brand line. */
export const letterSpacing = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.04em',
  caps: '0.08em', // all-caps labels/buttons
} as const;

/**
 * Spacing — 4-pt scale (root 16px → 0.25rem = 4pt). This IS the 4-pt grid the
 * PRD mandates; extended onto Tailwind's compatible default, not replacing it.
 */
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem', // 2
  1: '0.25rem', // 4
  2: '0.5rem', // 8
  3: '0.75rem', // 12
  4: '1rem', // 16
  5: '1.25rem', // 20
  6: '1.5rem', // 24
  8: '2rem', // 32
  10: '2.5rem', // 40
  12: '3rem', // 48
  16: '4rem', // 64
  20: '5rem', // 80
  24: '6rem', // 96
} as const;

export const radius = {
  none: '0',
  sm: '0.25rem', // 4
  DEFAULT: '0.5rem', // 8 — cards, inputs
  md: '0.5rem',
  lg: '0.75rem', // 12 — panels
  xl: '1rem', // 16 — Proposal Page surfaces
  full: '9999px', // chips, pills, flame
} as const;

/** Elevation — subtle, clinical. Higher levels reserved for the Proposal Page. */
export const elevation = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(4, 4, 4, 0.05)',
  DEFAULT: '0 1px 3px 0 rgba(4, 4, 4, 0.08), 0 1px 2px -1px rgba(4, 4, 4, 0.08)',
  md: '0 4px 8px -2px rgba(4, 4, 4, 0.10), 0 2px 4px -2px rgba(4, 4, 4, 0.06)',
  lg: '0 12px 20px -4px rgba(4, 4, 4, 0.12), 0 4px 8px -4px rgba(4, 4, 4, 0.08)',
  xl: '0 24px 40px -8px rgba(4, 4, 4, 0.16)',
} as const;

export const motion = {
  duration: {
    fast: '120ms',
    base: '180ms',
    slow: '280ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1.2)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

/** Brand constants. The brand line renders EXACTLY as below (PRD / kickoff). */
export const brand = {
  line: 'KEEP • IMPROVE • GROW',
  names: {
    ocean: 'OCEAN',
    almostRose: 'ALMOST ROSE',
    sunlights: 'SUNLIGHTS',
    black: 'BLACK',
    shadow: 'SHADOW',
    mist: 'MIST',
  },
} as const;

export const tokens = {
  palette,
  color,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  spacing,
  radius,
  elevation,
  motion,
  brand,
} as const;

export default tokens;
