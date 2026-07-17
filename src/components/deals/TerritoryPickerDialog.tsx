'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import {
  addTerritoryDeal,
  listPickerTerritories,
  type PickerTerritory,
} from '@/app/(app)/prospects/[id]/deal-actions';

/**
 * §5 — Territory picker: status = 'available' territories only (drafts and sold
 * are excluded — and re-enforced by create_territory_deal() at the database, so
 * this list is presentation, not the control). A territory that is available but
 * already carries an ACTIVE deal from a DIFFERENT prospect renders a visible,
 * NON-BLOCKING "contested" badge — still selectable (no exclusivity rule exists
 * in the system today; inventing one is out of scope, brief §5).
 *
 * Search is a simple client-side filter over the fetched list — the TopBar
 * search pattern's tokenless subset, not a fourth from-scratch search backend.
 */
export default function TerritoryPickerDialog({
  prospectId,
  onClose,
}: {
  prospectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [territories, setTerritories] = useState<PickerTerritory[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listPickerTerritories(prospectId).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error ?? 'Could not load territories.');
      else setTerritories(res.territories ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [prospectId]);

  const filtered = useMemo(() => {
    if (!territories) return [];
    const q = query.trim().toLowerCase();
    if (!q) return territories;
    return territories.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.state ?? '').toLowerCase().includes(q),
    );
  }, [territories, query]);

  function onSelect(territoryId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addTerritoryDeal(prospectId, territoryId);
      if (!res.ok) {
        setError(res.error ?? 'Could not add the territory deal.');
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-shadow/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add a territory deal"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-lg border border-mist bg-bg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-mist p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-heading text-sm font-bold uppercase tracking-caps text-text">
              Add territory
            </p>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search available territories…"
            className="mt-3 w-full rounded-md border border-mist bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {error && <p className="p-2 text-sm text-warning">{error}</p>}
          {territories === null && !error && (
            <p className="p-2 text-sm text-text-muted">Loading available territories…</p>
          )}
          {territories !== null && filtered.length === 0 && (
            <p className="p-2 text-sm text-text-muted">No available territories match.</p>
          )}
          <ul className="space-y-1">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onSelect(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-mist disabled:opacity-50"
                >
                  <span className="min-w-0 truncate">
                    {t.name}
                    {t.state && <span className="ml-1 text-text-muted">· {t.state}</span>}
                  </span>
                  {t.contested && (
                    <span
                      className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 font-heading text-[0.625rem] uppercase tracking-caps text-shadow"
                      title="Another prospect already has an active deal on this territory. It is still selectable — no exclusivity rule exists pre-close."
                    >
                      Active deal in progress
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
