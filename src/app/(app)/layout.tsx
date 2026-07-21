import AppShell from "@/components/shell/AppShell";
import { getViewerDesignation, type Designation } from "@/lib/auth/internal-role";

/**
 * Authenticated-shell layout (spec §4B) for the internal rep/exec app. Everything
 * under the (app) route group renders inside AppShell — Dashboard, Pipeline,
 * Prospects, (Deal) Territories, and the internal Proposals index.
 *
 * The (app) route group is URL-transparent: /dashboard, /territories, /proposals
 * keep their paths. Its purpose is structural — it draws a hard boundary so the
 * getViewerDesignation() auth call below NEVER enters the call graph of a public,
 * prospect-facing route (/p/[slug], /login). Those live outside this group under
 * the minimal root layout and never touch this code.
 *
 * Executive-only nav items are gated here via the REUSED getViewerDesignation()
 * (PR3 pattern — no new gate). Fail CLOSED: a transient auth/client failure must
 * degrade to the rep view (null), never a 500 — getViewerDesignation only swallows
 * the query error, not a thrown client/getUser, so guard it here too (belt and
 * suspenders now that the blast radius is structurally contained to internal pages).
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let designation: Designation | null = null;
  try {
    designation = await getViewerDesignation();
  } catch {
    designation = null;
  }
  return <AppShell designation={designation}>{children}</AppShell>;
}
