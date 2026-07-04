import Image from 'next/image';
import { logoAssets, type LogoVariant, LOGO_CLEAR_SPACE_RATIO } from '@/design/brand';

interface LogoProps {
  variant?: LogoVariant;
  /** Rendered width in px; height derives from the asset's intrinsic ratio. */
  width?: number;
  /** Reserve brand clear-space padding (25% of height) around the mark. */
  clearSpace?: boolean;
  /** Pass through to next/image for above-the-fold marks. */
  priority?: boolean;
  className?: string;
}

/**
 * Renders a committed GHMD brand asset (PRD §4.2). Never inline a raw <img> to
 * a /brand path — use this so min-size and clear-space rules stay enforced.
 */
export default function Logo({
  variant = 'primary',
  width = 180,
  clearSpace = false,
  priority = false,
  className,
}: LogoProps) {
  const asset = logoAssets[variant];
  const height = Math.round((asset.height / asset.width) * width);
  const pad = clearSpace ? Math.round(height * LOGO_CLEAR_SPACE_RATIO) : 0;

  if (process.env.NODE_ENV !== 'production' && width < asset.minWidthPx) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Logo] "${variant}" rendered at ${width}px, below brand min-size ${asset.minWidthPx}px.`,
    );
  }

  return (
    <span className={className} style={{ display: 'inline-block', padding: pad }}>
      <Image src={asset.src} alt={asset.alt} width={width} height={height} priority={priority} />
    </span>
  );
}
