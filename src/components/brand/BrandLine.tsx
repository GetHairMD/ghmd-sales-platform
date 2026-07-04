import { BRAND_LINE } from '@/design/brand';

interface BrandLineProps {
  className?: string;
}

/**
 * The GHMD brand line — renders EXACTLY "KEEP • IMPROVE • GROW" (PRD / P0).
 * Typeface follows the §4.2 assignment of the brand line to Cardo (serif accent).
 * NOTE: the raster logo lockups set the tagline in DM Sans caps — reconcile at
 * Trace's design review if the standalone line should match the lockup.
 */
export default function BrandLine({ className }: BrandLineProps) {
  return (
    <span
      className={`font-serif uppercase tracking-caps text-text ${className ?? ''}`.trim()}
    >
      {BRAND_LINE}
    </span>
  );
}
