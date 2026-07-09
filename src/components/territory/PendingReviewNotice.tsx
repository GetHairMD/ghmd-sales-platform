/**
 * Rep-facing "pending internal review" state (brief §C). Shown for a territory that has no
 * displayable number yet and no approved v3 boundary — deliberately exposes NO addressable
 * number, NO boundary, NO map, NO minutes, so a rep cannot screenshot a not-yet-approved
 * territory to a prospect.
 */
export default function PendingReviewNotice() {
  return (
    <div className="rounded-xl border border-mist bg-bg p-8 text-center">
      <p className="font-heading text-lg font-semibold text-text">Pending internal review</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
        This territory is being reviewed internally. Its market details and boundary will
        appear here once the review is complete.
      </p>
    </div>
  )
}
