interface ScarcityBannerProps {
  territoryName: string | null
}

/**
 * Section 5 — full-width SUNLIGHTS urgency strip, placed immediately after the
 * Territory Analysis. Exact copy per spec (note the en-dash in "2–3").
 */
export default function ScarcityBanner({ territoryName }: ScarcityBannerProps) {
  const territory = territoryName?.trim() || 'chosen'
  return (
    <div className="w-full bg-accent px-6 py-6 text-text">
      <p className="mx-auto max-w-3xl text-center font-serif text-lg">
        {`Most physicians reach a decision within 2–3 conversations. Your ${territory} territory is currently available — we cannot hold it without a signed agreement.`}
      </p>
    </div>
  )
}
