/**
 * Static presentation constants for the gated proposal page (/p/[slug]).
 *
 * Static template constants (gethairmd.biz); copy pending Trace/claims review (spec §10).
 * These are category-level marketing figures, NOT per-prospect or formula-derived
 * values — presentational category figures only, independent of sizing logic.
 */

export interface StatStripItem {
  value: string
  label: string
}

/** Hero stat strip — four category-size proof points (spec §10). */
export const STAT_STRIP: StatStripItem[] = [
  { value: '$4.2B', label: 'Category size' },
  { value: '80M+', label: 'Affected in the U.S.' },
  { value: '400%', label: 'Category growth' },
  { value: '51%', label: 'Seek treatment' },
]
