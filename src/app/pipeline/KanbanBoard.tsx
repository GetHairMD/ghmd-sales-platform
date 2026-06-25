'use client'
import { useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const STAGES = [
  { id: 1, label: 'New Lead' },
  { id: 2, label: 'Contacted' },
  { id: 3, label: 'Discovery Call' },
  { id: 4, label: 'Proposal Sent' },
  { id: 5, label: 'LOI Signed' },
  { id: 6, label: 'FDD Delivered' },
  { id: 7, label: 'Agreement Signed' },
]

type Prospect = {
  id: string
  full_name: string
  email: string | null
  stage: number
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

      // Optimistic update
      setProspects((all) =>
        all.map((p) => (p.id === prospectId ? { ...p, stage: newStage } : p))
      )

      const supabase = createClient()
      const { error } = await supabase
        .from('prospects')
        .update({ stage: newStage, stage_updated_at: new Date().toISOString() })
        .eq('id', prospectId)

      if (error) {
        // Revert on failure
        setProspects((all) =>
          all.map((p) => (p.id === prospectId ? { ...p, stage: prev.stage } : p))
        )
        console.error('Stage update failed:', error.message)
      }
    },
    [prospects]
  )

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh]">
        {STAGES.map((stage) => {
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
                      {cards.map((p, index) => (
                        <Draggable key={p.id} draggableId={p.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`bg-white rounded-md p-2 shadow-sm text-sm cursor-grab select-none transition-shadow ${
                                snapshot.isDragging ? 'shadow-lg ring-2 ring-[#4681A3]/30 rotate-1' : ''
                              }`}
                            >
                              <Link
                                href={`/prospects/${p.id}`}
                                className="font-medium text-gray-900 hover:text-[#4681A3] block truncate leading-tight"
                                onClick={(e) => snapshot.isDragging && e.preventDefault()}
                              >
                                {p.full_name}
                              </Link>
                              {p.email && (
                                <p className="text-xs text-gray-400 truncate mt-0.5">{p.email}</p>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
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
