/**
 * GHMD brand assets — committed logo files + usage rules (PRD v1.2 §4.2).
 *
 * Files live in /public/brand and are documented in /public/brand/README.md.
 * The mark is a monochrome system: black lockup (canonical), white/reversed
 * for dark surfaces, and the flame icon alone. There is no separate full-color
 * lockup — the primary (black) lockup is the "full-color"/default reference.
 */

export type LogoVariant = 'primary' | 'white' | 'icon' | 'compact';

export interface LogoAsset {
  /** Public path (Next static). */
  src: string;
  /** Intrinsic pixel size — required by next/image and used to preserve ratio. */
  width: number;
  height: number;
  alt: string;
  /** Monochrome tone. */
  tone: 'black' | 'white';
  layout: 'stacked' | 'horizontal' | 'icon';
  /** Minimum rendered width (px) below which the asset must not be used. */
  minWidthPx: number;
}

export const logoAssets: Record<LogoVariant, LogoAsset> = {
  // Primary stacked lockup (wordmark + flame + tagline), black — the default.
  primary: {
    src: '/brand/gethairmd-logo-black.png',
    width: 2978,
    height: 2006,
    alt: 'GetHairMD',
    tone: 'black',
    layout: 'stacked',
    minWidthPx: 120,
  },
  // Horizontal reversed lockup for dark surfaces (nav, dark hero).
  white: {
    src: '/brand/gethairmd-logo-white.png',
    width: 1172,
    height: 300,
    alt: 'GetHairMD',
    tone: 'white',
    layout: 'horizontal',
    minWidthPx: 120,
  },
  // Flame mark only — favicons, compact chrome, avatars.
  icon: {
    src: '/brand/gethairmd-icon-black.png',
    width: 2149,
    height: 2958,
    alt: 'GetHairMD',
    tone: 'black',
    layout: 'icon',
    minWidthPx: 24,
  },
  // Compact black lockup for tight/document contexts.
  compact: {
    src: '/brand/gethairmd-logo-black-sm.png',
    width: 369,
    height: 249,
    alt: 'GetHairMD',
    tone: 'black',
    layout: 'stacked',
    minWidthPx: 96,
  },
};

/**
 * Clear space around any logo = at least this fraction of its rendered height,
 * kept free of other elements (PRD "honor min-size + clear-space rules").
 */
export const LOGO_CLEAR_SPACE_RATIO = 0.25;

/** The brand line renders EXACTLY as below (PRD / P0 kickoff). */
export const BRAND_LINE = 'KEEP • IMPROVE • GROW';
