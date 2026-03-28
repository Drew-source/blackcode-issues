'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, RotateCcw, ExternalLink, FileText } from 'lucide-react'
import { useState } from 'react'

interface ReviewPanelProps {
  issueId: number
  taskhiveTaskId: number
}

export function ReviewPanel({ issueId, taskhiveTaskId }: ReviewPanelProps) {
  const queryClient = useQueryClient()
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [revisionNotes, setRevisionNotes] = useState('')

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ['taskhive-deliverables', issueId],
    queryFn: async () => {
      const res = await fetch(`/api/issues/${issueId}/taskhive-deliverables`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ deliverableId, action, notes }: { deliverableId: number; action: string; notes?: string }) => {
      const res = await fetch(`/api/issues/${issueId}/taskhive-deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliverable_id: deliverableId, action, revision_notes: notes }),
      })
      if (!res.ok) throw new Error('Failed to submit review')
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['taskhive-deliverables', issueId] })
      toast.success(`Deliverable ${vars.action === 'accept' ? 'accepted' : 'returned for revision'}`)
      setRejectingId(null)
      setRevisionNotes('')
    },
    onError: () => toast.error('Failed to submit review'),
  })

  if (isLoading) return <div className="text-sm text-zinc-400">Loading submissions...</div>
  if (deliverables.length === 0) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-zinc-50 border-b">
        <h3 className="text-sm font-medium text-zinc-900">TaskHive Submissions</h3>
      </div>
      <div className="divide-y">
        {deliverables.map((d: any, idx: number) => (
          <div key={d.id} className="p-4 space-y-3">
            {/* Header: submission number + status */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Submission #{deliverables.length - idx}</span>
              <StatusBadge status={d.status} />
            </div>

            {/* Content */}
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{d.content}</p>

            {/* GitHub link */}
            {d.github_url && (
              <a href={d.github_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ExternalLink className="w-3 h-3" /> View on GitHub
              </a>
            )}

            {/* Artifacts */}
            {d.artifacts && d.artifacts.length > 0 && (
              <div className="text-sm text-zinc-500">
                {d.artifacts.map((a: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1 mr-3">
                    <FileText className="w-3 h-3" /> {a.filename}
                  </span>
                ))}
              </div>
            )}

            {/* Auto-review */}
            {d.auto_review_result && (
              <div className={`text-xs px-2 py-1 rounded inline-block ${
                d.auto_review_result === 'pass' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                Auto-Review: {d.auto_review_result.toUpperCase()}
                {d.auto_review_scores && (
                  <span className="ml-2">
                    (C:{d.auto_review_scores.completeness} Q:{d.auto_review_scores.quality}
                    {' '}A:{d.auto_review_scores.adherence} Cl:{d.auto_review_scores.clarity})
                  </span>
                )}
              </div>
            )}

            {/* Actions for pending submissions */}
            {d.status === 'pending_review' && (
              <div className="pt-2 space-y-2">
                {rejectingId === d.taskhive_deliverable_id ? (
                  <div className="space-y-2">
                    <textarea
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      placeholder="Revision notes..."
                      className="w-full text-sm border rounded p-2 h-20"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => reviewMutation.mutate({ deliverableId: d.taskhive_deliverable_id, action: 'reject', notes: revisionNotes })}
                        className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                        Reject
                      </button>
                      <button onClick={() => reviewMutation.mutate({ deliverableId: d.taskhive_deliverable_id, action: 'revision', notes: revisionNotes })}
                        className="text-xs px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600">
                        Request Revision
                      </button>
                      <button onClick={() => { setRejectingId(null); setRevisionNotes('') }}
                        className="text-xs px-3 py-1 border rounded hover:bg-zinc-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => reviewMutation.mutate({ deliverableId: d.taskhive_deliverable_id, action: 'accept' })}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700">
                      <Check className="w-3 h-3" /> Accept
                    </button>
                    <button onClick={() => setRejectingId(d.taskhive_deliverable_id)}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 border border-zinc-300 rounded hover:bg-zinc-50">
                      <RotateCcw className="w-3 h-3" /> Request Changes
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-amber-100 text-amber-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    revision_requested: 'bg-purple-100 text-purple-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || 'bg-zinc-100 text-zinc-800'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
