'use client'
import { useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  PIPELINE_STAGES,
  requiresFundingPrequalConfirm,
  showPrequalSkippedBadge,
  isDealStatus,
  type DealStatus,
} from '@/lib/pipeline-stages'

type Prospect = {
  id: string
  full_name: string
  email: string | null
  stage: number
  deal_status: DealStatus
  funding_prequal_cleared: boolean
  skipped_funding_prequal: boolean
}

export default function KanbanBoard({ initialProspects }: { initialProspects: Prospect[] }) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination) return
      const prospectId = result.draggableId
      const newStage = parseInt(result.destination.droppableId, 10)
      const prev = prospects.find((p) => p.id === prospectId)
      if (!prev || prev.stage === newStage) return

      // Soft funding gate: advancing to Contract Sent (8)+ without cleared pre-qual is
      // allowed but must be confirmed and flags the record. Never a hard block.
      let markSkipped = prev.skipped_funding_prequal
      if (requiresFundingPrequalConfirm(newStage, prev.funding_prequal_cleared)) {
        const proceed = window.confirm('Funding pre-qual not cleared. Advance anyway?')
        if (!proceed) return
        markSkipped = true
      }

      // Optimistic update
      setProspects((all) =>
        all.map((p) =>
          p.id === prospectId ? { ...p, stage: newStage, skipped_funding_prequal: markSkipped } : p,
        ),
      )

      const supabase = createClient()
      const { error } = await supabase
        .from('prospects')
        .update({
          stage: newStage,
          stage_updated_at: new Date().toISOString(),
          ...(markSkipped !== prev.skipped_funding_prequal
            ? { skipped_funding_prequal: markSkipped }
            : {}),
        })
        .eq('id', prospectId)

      if (error) {
        // Revert on failure
        setProspects((all) =>
          all.map((p) =>
            p.id === prospectId
              ? { ...p, stage: prev.stage, skipped_funding_prequal: prev.skipped_funding_prequal }
              : p,
          ),
        )
        console.error('Stage update failed:', error.message)
      }
    },
    [prospects],
  )

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh]">
        {PIPELINE_STAGES.map((stage) => {
          const cards = prospects.filter((p) => p.stage === stage.id)
          return (
            <div key={stage.id} className="flex-shrink-0 w-44">
              <div className="bg-gray-100 rounded-lg p-3 h-full">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-gray-600 mb-1">
                  {stage.label}
                </h3>
                <p className="text-xs text-gray-400 mb-3">{cards.length} prospect{cards.length !== 1 ? 's' : ''}</p>
                <Droppable droppableId={String(stage.id)}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-12 rounded space-y-2 transition-colors ${
                        snapshot.isDraggingOver ? 'bg-blue-50' : ''
                      }`}
                    >
                      {cards.map((p, index) => {
                        const status: DealStatus = isDealStatus(p.deal_status) ? p.deal_status : 'active'
                        const lost = status === 'lost'
                        const stalled = status === 'stalled'
                        const prequalSkipped = showPrequalSkippedBadge(p.stage, p.skipped_funding_prequal)
                        return (
                          <Draggable key={p.id} draggableId={p.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`rounded-md p-2 shadow-sm text-sm cursor-grab select-none transition-shadow ${
                                  snapshot.isDragging ? 'shadow-lg ring-2 ring-[#4681A3]/30 rotate-1' : ''
                                } ${
                                  lost
                                    ? 'bg-gray-100 opacity-60'
                                    : stalled
                                    ? 'bg-white border-l-4 border-amber-400'
                                    : 'bg-white'
                                }`}
                              >
                                <Link
                                  href={`/prospects/${p.id}`}
                                  className={`font-medium block truncate leading-tight hover:text-[#4681A3] ${
                                    lost ? 'text-gray-500 line-through' : 'text-gray-900'
                                  }`}
                                  onClick={(e) => snapshot.isDragging && e.preventDefault()}
                                >
                                  {p.full_name}
                                </Link>
                                {p.email && (
                                  <p className="text-xs text-gray-400 truncate mt-0.5">{p.email}</p>
                                )}
                                {prequalSkipped && (
                                  <span className="inline-block mt-1 bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide">
                                    PRE-QUAL SKIPPED
                                  </span>
                                )}
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
