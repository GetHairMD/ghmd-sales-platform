import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Check, MapPin, ShieldCheck } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import BrandLine from '@/components/brand/BrandLine';
import ScenarioCards from '@/components/ScenarioCards';
import { penetrationScenarios } from '@/lib/territory-sizing';

export const dynamic = 'force-dynamic';

// Public buyer-facing page — never indexed (PRD §3.3).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PageProps {
  params: { prospectId: string };
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default async function ProposalPage({ params }: PageProps) {
  const { prospectId } = params;

  // Service role: public page bypasses RLS, read-only, server-side only.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: prospect } = await admin
    .from('prospects')
    .select('id, full_name, practice_name, specialty')
    .eq('id', prospectId)
    .single();
  if (!prospect) return notFound();

  const { data: deal } = await admin
    .from('deals')
    .select('territory_price, territories ( name, addressable_patients_primary )')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const t = deal?.territories as unknown as
    | { name: string; addressable_patients_primary: number | null }
    | { name: string; addressable_patients_primary: number | null }[]
    | null;
  const territory = Array.isArray(t) ? (t[0] ?? null) : (t ?? null);
  const price = usd(deal?.territory_price ? Number(deal.territory_price) : 179000);
  const addressable = territory?.addressable_patients_primary ?? null;

  return (
    <div className="min-h-screen bg-bg font-body text-text">
      {/* Brand hero — expressive, dark */}
      <header className="bg-black px-6 py-16 text-text-inverse sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 flex flex-col items-start gap-3">
            <Logo variant="white" width={200} priority />
            <BrandLine className="text-text-inverse/70" />
          </div>
          <p className="font-serif text-lg text-text-inverse/70">A protected territory prepared for</p>
          <h1 className="mt-2 font-heading text-4xl font-bold leading-tight sm:text-6xl">
            {prospect.practice_name ?? prospect.full_name}
          </h1>
          {prospect.practice_name && (
            <p className="mt-3 text-xl text-text-inverse/80">{prospect.full_name}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-20 px-6 py-16">
        {/* Executive summary */}
        <section>
          <p className="font-serif text-2xl leading-relaxed text-text sm:text-3xl">
            GetHairMD builds a single, protected hair-restoration territory around your practice —
            with the clinical model, buildout, and support to run it. This is the opportunity in
            {territory ? ` ${territory.name}` : ' your market'}.
          </p>
        </section>

        {/* Why this territory + market opportunity */}
        {territory && (
          <section className="grid gap-8 rounded-xl border border-mist bg-bg-subtle p-8 sm:grid-cols-2">
            <div>
              <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Your territory</p>
              <p className="mt-1 font-heading text-3xl font-bold text-text">{territory.name}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
                <MapPin className="h-4 w-4 text-primary" /> Exclusive 30-minute primary drive-time zone
              </p>
            </div>
            {addressable != null && (
              <div>
                <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Addressable market</p>
                <p className="mt-1 font-heading text-4xl font-bold text-primary">
                  {addressable.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Qualified households in your primary zone likely to seek and finance treatment.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Revenue opportunity — penetration scenarios */}
        {addressable != null && (
          <section>
            <h2 className="font-heading text-2xl font-bold text-text">Projected demand</h2>
            <p className="mt-1 font-serif text-text-muted">
              Customers your territory could support across conservative, base, and upside adoption.
            </p>
            <div className="mt-6">
              <ScenarioCards sizing={penetrationScenarios(addressable)} />
            </div>
          </section>
        )}

        {/* Protected territory map placeholder */}
        <section>
          <h2 className="font-heading text-2xl font-bold text-text">A territory that&apos;s yours alone</h2>
          <div className="mt-4 flex h-56 items-center justify-center rounded-xl border border-dashed border-mist bg-bg-subtle text-sm text-text-muted">
            <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Protected drive-time map</span>
          </div>
        </section>

        {/* The GHMD model */}
        <section>
          <h2 className="font-heading text-2xl font-bold text-text">The GetHairMD model</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              ['Clinical protocol', 'A proven, physician-led hair-restoration protocol and clinical training.'],
              ['Practice buildout', 'Complete setup — space plan, equipment, and launch playbook.'],
              ['Patient acquisition', 'Marketing and intake systems tuned for your territory.'],
              ['Ongoing support', 'Clinical and operational support, plus the physician network.'],
            ].map(([h, b]) => (
              <div key={h} className="rounded-lg border border-mist bg-bg p-5">
                <p className="font-heading text-sm font-semibold uppercase tracking-caps text-text">{h}</p>
                <p className="mt-1.5 text-sm text-text-muted">{b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Required investment */}
        <section className="rounded-xl bg-black px-8 py-12 text-text-inverse">
          <p className="font-heading text-xs uppercase tracking-caps text-text-inverse/60">Required investment</p>
          <p className="mt-2 font-heading text-6xl font-bold">{price}</p>
          <p className="mt-3 max-w-lg font-serif text-text-inverse/70">
            One protected territory, the full GetHairMD model, and launch support. Financing is
            available through our lender partners — your representative will walk you through
            pre-qualification.
          </p>
        </section>

        {/* Launch plan */}
        <section>
          <h2 className="font-heading text-2xl font-bold text-text">Your path to launch</h2>
          <ol className="mt-6 space-y-4">
            {[
              'Reserve your protected territory',
              'Complete financing pre-qualification',
              'Execute the territory agreement',
              'Buildout, training, and clinical onboarding',
              'Open and begin patient acquisition',
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-text-inverse">
                  {i + 1}
                </span>
                <span className="pt-1 text-text">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Support included */}
        <section>
          <h2 className="font-heading text-2xl font-bold text-text">What&apos;s included</h2>
          <ul className="mt-6 space-y-3">
            {[
              'Exclusive protected territory with defined drive-time boundaries',
              'Complete GHMD practice buildout and clinical protocol',
              'Marketing and patient-acquisition system',
              'Ongoing clinical and operational support',
              'GetHairMD brand license and physician-network access',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-text">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA → contract path */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 font-heading text-2xl font-bold text-text">Ready to reserve your territory?</h2>
          <p className="mx-auto mt-2 max-w-lg font-serif text-text-muted">
            Connect with your GetHairMD representative to finalize your territory and review the agreement.
          </p>
          <button
            type="button"
            disabled
            title="Embedded signing arrives in a later phase"
            className="mt-6 inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-accent px-6 py-3 font-heading text-sm font-semibold uppercase tracking-caps text-text opacity-80"
          >
            Review agreement
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[0.625rem]">Coming soon</span>
          </button>
        </section>
      </main>

      <footer className="border-t border-mist bg-bg-subtle px-6 py-8 text-center">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-3">
          <Logo variant="primary" width={120} />
          <p className="text-xs text-text-muted">
            Confidential and intended solely for {prospect.full_name}. © 2026 GetHairMD.
          </p>
        </div>
      </footer>
    </div>
  );
}
