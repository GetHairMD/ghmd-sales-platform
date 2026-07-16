import 'server-only'
import type { Designation } from '@/lib/auth/internal-role'

/**
 * CONCEALED navigation (spec §4D) — exec-only destinations whose EXISTENCE must
 * be hidden from non-executives, not merely access-denied.
 *
 * ⚠ WHY THIS IS NOT AN `execOnly` ENTRY IN nav-items.ts — INTENTIONAL DIVERGENCE,
 * DO NOT "FIX" FOR CONSISTENCY: nav-items.ts is imported by CLIENT components
 * (Sidebar, BottomTabBar), so everything in NAV_ITEMS — label and href included —
 * ships in the JS bundle of EVERY viewer. For Territory Scouting that is fine:
 * its requirement is access denial (403), and a rep discovering the string
 * "territory-scouting" in a bundle learns nothing they can use. §4D's requirement
 * is CONCEALMENT OF EXISTENCE: "a rep with devtools open should find nothing."
 * An entry here reaches the client ONLY as a serialized prop from the
 * server-rendered (app) layout, and only when the viewer is an executive — for a
 * rep the prop is an empty array and neither label nor href appears anywhere in
 * the HTML, the RSC payload, or any loaded chunk.
 *
 * The `import 'server-only'` guard makes accidental client import a BUILD error,
 * not a silent leak. Pinned by rep-command-center tests (nav concealment block).
 */

/** Serializable-only shape (crosses the server→client boundary as a prop). */
export interface ConcealedNavItem {
  label: string
  href: string
  /** Key into Sidebar's generic icon map (never the icon component itself). */
  iconKey: 'gauge'
}

const CONCEALED_EXEC_ITEMS: ConcealedNavItem[] = [
  // Rep Command Center (spec §4D, decision #169): executive-only management view;
  // the route itself 404s non-executives (see its page.tsx).
  { label: 'Rep Command Center', href: '/rep-command-center', iconKey: 'gauge' },
]

/**
 * The concealed items `designation` may see. Executives get the list; everyone
 * else — reps, unauthenticated, not-allow-listed — gets [] (fail closed, same
 * rule as navItemsFor). Call ONLY from server components.
 */
export function concealedNavItemsFor(designation: Designation | null): ConcealedNavItem[] {
  return designation === 'executive' ? CONCEALED_EXEC_ITEMS : []
}
