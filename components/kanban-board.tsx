'use client'

import { useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Paperclip,
  Search,
  Filter,
  Undo2,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Issue as IssueType, Project as ProjectType, KanbanData } from '@/types'

// Status configuration
const STATUSES = [
  { id: 'backlog', label: 'Backlog', color: 'gray' },
  { id: 'todo', label: 'To Do', color: 'blue' },
  { id: 'in_progress', label: 'In Progress', color: 'amber' },
  { id: 'blocked', label: 'Blocked', color: 'red' },
  { id: 'in_review', label: 'In Review', color: 'purple' },
  { id: 'done', label: 'Done', color: 'green' },
] as const

const PRIORITY_CONFIG = {
  1: { label: 'Urgent', color: 'text-red-500', bg: 'bg-red-500/10' },
  2: { label: 'High', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  3: { label: 'Medium', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  4: { label: 'Low', color: 'text-gray-500', bg: 'bg-gray-500/10' },
  5: { label: 'None', color: 'text-gray-400', bg: 'bg-gray-400/10' },
} as const

// Re-export types for local use
type Issue = IssueType
type Project = ProjectType

interface User {
  name?: string | null
  email?: string | null
  image?: string | null
}

export function KanbanBoard({
  project,
  initialKanban,
  user,
}: {
  project: Project
  initialKanban: KanbanData
  user: User
}) {
  const [kanban, setKanban] = useState<KanbanData>(initialKanban)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewIssue, setShowNewIssue] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const queryClient = useQueryClient()

  const updateIssueStatus = useMutation({
    mutationFn: async ({ issueId, status }: { issueId: number; status: string }) => {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update issue')
      return res.json()
    },
    onError: () => {
      toast.error('Failed to update issue')
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ['kanban', project.id] })
    },
  })

  const createIssue = useMutation({
    mutationFn: async (data: { title: string; status: string }) => {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          project_id: project.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to create issue')
      return res.json()
    },
    onSuccess: (newIssue, variables) => {
      setKanban((prev) => ({
        ...prev,
        [variables.status]: [...(prev[variables.status] || []), newIssue],
      }))
      setShowNewIssue(null)
      toast.success('Issue created!')
    },
    onError: () => {
      toast.error('Failed to create issue')
    },
  })

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result

    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const issueId = parseInt(draggableId)
    const sourceStatus = source.droppableId
    const destStatus = destination.droppableId

    // Optimistic update
    setKanban((prev) => {
      const newKanban = { ...prev }
      const sourceItems = [...(newKanban[sourceStatus] || [])]
      const destItems = sourceStatus === destStatus ? sourceItems : [...(newKanban[destStatus] || [])]
      
      const [movedItem] = sourceItems.splice(source.index, 1)
      movedItem.status = destStatus
      destItems.splice(destination.index, 0, movedItem)

      newKanban[sourceStatus] = sourceItems
      if (sourceStatus !== destStatus) {
        newKanban[destStatus] = destItems
      }

      return newKanban
    })

    // Update server
    if (sourceStatus !== destStatus) {
      updateIssueStatus.mutate({ issueId, status: destStatus })
    }
  }, [updateIssueStatus])

  // Filter issues by search query
  const filterIssues = (issues: Issue[]) => {
    if (!searchQuery) return issues
    const query = searchQuery.toLowerCase()
    return issues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(query) ||
        issue.id.toString().includes(query)
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-xl font-bold">{project.name}</h1>
                <p className="text-sm text-muted-foreground">
                  #{project.id} • {Object.values(kanban).flat().length} issues
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Filters */}
              <button className="flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm hover:bg-secondary transition-colors">
                <Filter size={16} />
                Filters
              </button>

              {/* Rollback */}
              <button className="flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm hover:bg-secondary transition-colors text-muted-foreground">
                <Undo2 size={16} />
                Undo
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Kanban board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="p-6">
          <div className="flex gap-6 overflow-x-auto pb-6">
            {STATUSES.map((status) => (
              <Column
                key={status.id}
                status={status}
                issues={filterIssues(kanban[status.id] || [])}
                onNewIssue={() => setShowNewIssue(status.id)}
                showNewIssue={showNewIssue === status.id}
                onCancelNewIssue={() => setShowNewIssue(null)}
                onCreateIssue={(title) =>
                  createIssue.mutate({ title, status: status.id })
                }
                isCreating={createIssue.isPending}
                onSelectIssue={setSelectedIssue}
              />
            ))}
          </div>
        </div>
      </DragDropContext>

      {/* Issue detail modal */}
      <AnimatePresence>
        {selectedIssue && (
          <IssueDetailModal
            issue={selectedIssue}
            onClose={() => setSelectedIssue(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Column({
  status,
  issues,
  onNewIssue,
  showNewIssue,
  onCancelNewIssue,
  onCreateIssue,
  isCreating,
  onSelectIssue,
}: {
  status: typeof STATUSES[number]
  issues: Issue[]
  onNewIssue: () => void
  showNewIssue: boolean
  onCancelNewIssue: () => void
  onCreateIssue: (title: string) => void
  isCreating: boolean
  onSelectIssue: (issue: Issue) => void
}) {
  const [newTitle, setNewTitle] = useState('')

  const colorClasses = {
    gray: 'bg-gray-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
  }

  return (
    <div className="flex-shrink-0 w-80">
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colorClasses[status.color]}`} />
          <span className="font-medium">{status.label}</span>
          <span className="text-sm text-muted-foreground ml-1">
            {issues.length}
          </span>
        </div>
        <button
          onClick={onNewIssue}
          className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={status.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`kanban-column transition-colors ${
              snapshot.isDraggingOver ? 'bg-primary/5 border-primary/20 border-2 border-dashed' : ''
            }`}
          >
            {/* New issue form */}
            <AnimatePresence>
              {showNewIssue && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-3"
                >
                  <div className="bg-card rounded-lg border border-primary p-3 shadow-lg">
                    <textarea
                      autoFocus
                      placeholder="Issue title..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && newTitle.trim()) {
                          e.preventDefault()
                          onCreateIssue(newTitle.trim())
                          setNewTitle('')
                        }
                        if (e.key === 'Escape') {
                          onCancelNewIssue()
                          setNewTitle('')
                        }
                      }}
                      className="w-full bg-transparent resize-none focus:outline-none text-sm"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => {
                          onCancelNewIssue()
                          setNewTitle('')
                        }}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (newTitle.trim()) {
                            onCreateIssue(newTitle.trim())
                            setNewTitle('')
                          }
                        }}
                        disabled={!newTitle.trim() || isCreating}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                      >
                        {isCreating ? '...' : 'Create'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Issues */}
            {issues.map((issue, index) => (
              <Draggable
                key={issue.id}
                draggableId={issue.id.toString()}
                index={index}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <IssueCard
                      issue={issue}
                      isDragging={snapshot.isDragging}
                      onClick={() => onSelectIssue(issue)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

function IssueCard({
  issue,
  isDragging,
  onClick,
}: {
  issue: Issue
  isDragging: boolean
  onClick: () => void
}) {
  const priority = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG]

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`kanban-card mb-3 ${isDragging ? 'shadow-xl ring-2 ring-primary' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-muted-foreground font-mono">
          #{issue.id}
        </span>
        {priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}>
            {priority.label}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm mb-3 line-clamp-2">{issue.title}</h4>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {issue.comment_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {issue.comment_count}
            </span>
          )}
          {issue.attachment_count > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={12} />
              {issue.attachment_count}
            </span>
          )}
        </div>

        {/* Assignee */}
        {issue.assignee_avatar ? (
          <Image
            src={issue.assignee_avatar}
            alt={issue.assignee_name || 'Assignee'}
            width={20}
            height={20}
            className="rounded-full"
            title={issue.assignee_name}
          />
        ) : issue.assignee_name ? (
          <div
            className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center text-[10px] font-medium"
            title={issue.assignee_name}
          >
            {issue.assignee_name.charAt(0)}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

function IssueDetailModal({
  issue,
  onClose,
}: {
  issue: Issue
  onClose: () => void
}) {
  const priority = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG]
  const status = STATUSES.find((s) => s.id === issue.status)

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-card border-l border-border shadow-2xl z-50 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/80 backdrop-blur border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-muted-foreground">
              #{issue.id}
            </span>
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">{issue.title}</h1>

          {/* Properties */}
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`status-badge status-${issue.status}`}>
                {status?.label}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Priority</span>
              {priority && (
                <span className={`text-sm ${priority.color}`}>
                  {priority.label}
                </span>
              )}
            </div>

            {issue.assignee_name && (
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Assignee</span>
                <div className="flex items-center gap-2">
                  {issue.assignee_avatar && (
                    <Image
                      src={issue.assignee_avatar}
                      alt={issue.assignee_name}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  )}
                  <span className="text-sm">{issue.assignee_name}</span>
                </div>
              </div>
            )}

            {issue.milestone_name && (
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Milestone</span>
                <span className="text-sm">{issue.milestone_name}</span>
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(issue.created_at))} ago
              </span>
            </div>
          </div>

          {/* Description */}
          {issue.description && (
            <div className="mb-8">
              <h3 className="text-sm font-medium mb-2">Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {issue.description}
              </p>
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="text-sm font-medium mb-4">
              Comments ({issue.comment_count})
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
              Comments will appear here
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}

