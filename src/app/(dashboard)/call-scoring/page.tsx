import ZoomEmbed from '@/components/call-scoring/ZoomEmbed'

export default function CallScoringPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Call Scoring</h1>
          <p className="text-sm text-muted-foreground mt-1">Join your live GHMD training session below.</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <ZoomEmbed />
        </div>
      </div>
    </div>
  )
}
