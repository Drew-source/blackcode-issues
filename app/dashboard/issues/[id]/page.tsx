'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  MessageSquare,
  Paperclip,
  User2,
  Calendar,
  Tag,
  CheckCircle2,
  Clock,
  Trash2,
} from 'lucide-react'

const STATUSES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
] as const

const PRIORITY_CONFIG = {
  1: { label: 'Urgent', color: 'text-red-500', bg: 'bg-red-500/10' },
  2: { label: 'High', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  3: { label: 'Medium', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  4: { label: 'Low', color: 'text-gray-500', bg: 'bg-gray-500/10' },
  5: { label: 'None', color: 'text-gray-400', bg: 'bg-gray-400/10' },
} as const

interface Issue {
  id: number
  title: string
  description?: string
  status: string
  priority: number
  assignee_id?: number
  assignee_name?: string
  assignee_avatar?: string
  project_id: number
  project_name?: string
  milestone_id?: number
  milestone_name?: string
  comment_count: number
  attachment_count: number
  created_at: string
  updated_at: string
}

interface Comment {
  id: number
  content: string
  user_id: number
  author_name?: string
  author_avatar?: string
  created_at: string
}

export default function IssueDetailPage() {
  const router = useRouter()
  const params = useParams()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [editedStatus, setEditedStatus] = useState('')
  const [editedPriority, setEditedPriority] = useState<number>(3)
  const [editedAssigneeId, setEditedAssigneeId] = useState<number | null>(null)
  const [editedStartDate, setEditedStartDate] = useState<string>('')
  const [editedDueDate, setEditedDueDate] = useState<string>('')
  const [commentContent, setCommentContent] = useState('')

  const issueId = parseInt(params.id as string)

  // Fetch issue
  const { data: issue, isLoading } = useQuery<Issue>({
    queryKey: ['issue', issueId],
    queryFn: async () => {
      const res = await fetch(`/api/issues/${issueId}`)
      if (!res.ok) throw new Error('Failed to fetch issue')
      return res.json()
    },
  })

  // Fetch comments
  const { data: comments = [], refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ['comments', issueId],
    queryFn: async () => {
      const res = await fetch(`/api/issues/${issueId}/comments`)
      if (!res.ok) return []
      return res.json()
    },
  })

  // Fetch project members for assignee dropdown
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', issue?.project_id],
    queryFn: async () => {
      if (!issue?.project_id) return []
      const res = await fetch(`/api/projects/${issue.project_id}/members`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!issue?.project_id,
  })

  // Initialize edit state
  if (issue && !isEditing && editedTitle === '') {
    setEditedTitle(issue.title)
    setEditedDescription(issue.description || '')
    setEditedStatus(issue.status)
    setEditedPriority(issue.priority)
    setEditedAssigneeId(issue.assignee_id || null)
    setEditedStartDate((issue as any).start_date ? (issue as any).start_date.split('T')[0] : '')
    setEditedDueDate((issue as any).due_date ? (issue as any).due_date.split('T')[0] : '')
  }

  const updateIssue = useMutation({
    mutationFn: async (data: Partial<Issue>) => {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update issue')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] })
      queryClient.invalidateQueries({ queryKey: ['all-issues'] })
      queryClient.invalidateQueries({ queryKey: ['kanban', issue?.project_id] })
      setIsEditing(false)
      toast.success('Issue updated!')
    },
    onError: () => {
      toast.error('Failed to update issue')
    },
  })

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Failed to create comment')
      return res.json()
    },
    onSuccess: () => {
      refetchComments()
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] })
      setCommentContent('')
      toast.success('Comment added!')
    },
    onError: () => {
      toast.error('Failed to create comment')
    },
  })

  const handleSave = () => {
    updateIssue.mutate({
      title: editedTitle,
      description: editedDescription,
      status: editedStatus,
      priority: editedPriority,
      assignee_id: editedAssigneeId ?? undefined,
      start_date: editedStartDate || null,
      due_date: editedDueDate || null,
    } as any)
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="h-8 bg-card rounded-lg animate-pulse mb-4" />
          <div className="h-64 bg-card rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto text-center py-24">
          <h2 className="text-xl font-semibold mb-2">Issue not found</h2>
          <Link href="/dashboard/issues" className="text-primary hover:underline">
            Back to all issues
          </Link>
        </div>
      </div>
    )
  }

  const priority = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG]
  const status = STATUSES.find((s) => s.id === issue.status)

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/issues"
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-muted-foreground">#{issue.id}</span>
                  {isEditing ? (
                    <input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="px-3 py-1 bg-background border border-input rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                  ) : (
                    <h1 className="text-2xl font-bold">{issue.title}</h1>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <Link
                    href={`/dashboard/${issue.project_id}`}
                    className="hover:text-primary"
                  >
                    {issue.project_name || `Project #${issue.project_id}`}
                  </Link>
                  {' • '}
                  Created {formatDistanceToNow(new Date(issue.created_at))} ago
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setEditedTitle(issue.title)
                      setEditedDescription(issue.description || '')
                      setEditedStatus(issue.status)
                      setEditedPriority(issue.priority)
                      setEditedAssigneeId(issue.assignee_id || null)
                      setEditedStartDate((issue as any).start_date ? (issue as any).start_date.split('T')[0] : '')
                      setEditedDueDate((issue as any).due_date ? (issue as any).due_date.split('T')[0] : '')
                    }}
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateIssue.isPending || !editedTitle.trim()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save size={16} />
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="md:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-sm font-semibold mb-3">Description</h2>
              {isEditing ? (
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={6}
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {issue.description || 'No description provided.'}
                </p>
              )}
            </div>

            {/* Comments */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-sm font-semibold mb-4">
                Comments ({comments.length})
              </h2>

              <div className="space-y-4 mb-6">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    {comment.author_avatar ? (
                      <Image
                        src={comment.author_avatar}
                        alt={comment.author_name || 'User'}
                        width={32}
                        height={32}
                        className="rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {comment.author_name?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {comment.author_name || 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at))} ago
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div className="space-y-2">
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={3}
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (commentContent.trim()) {
                        createCommentMutation.mutate(commentContent.trim())
                      }
                    }}
                    disabled={!commentContent.trim() || createCommentMutation.isPending}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createCommentMutation.isPending ? 'Posting...' : 'Post comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status */}
            <div className="bg-card rounded-lg border border-border p-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Status
              </label>
              {isEditing ? (
                <select
                  value={editedStatus}
                  onChange={(e) => setEditedStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`status-badge status-${issue.status}`}>
                  {status?.label || issue.status}
                </span>
              )}
            </div>

            {/* Priority */}
            <div className="bg-card rounded-lg border border-border p-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Priority
              </label>
              {isEditing ? (
                <select
                  value={editedPriority}
                  onChange={(e) => setEditedPriority(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={1}>Urgent</option>
                  <option value={2}>High</option>
                  <option value={3}>Medium</option>
                  <option value={4}>Low</option>
                </select>
              ) : (
                priority && (
                  <span
                    className={`inline-block text-xs px-2 py-1 rounded-full ${priority.bg} ${priority.color}`}
                  >
                    {priority.label}
                  </span>
                )
              )}
            </div>

            {/* Assignee */}
            <div className="bg-card rounded-lg border border-border p-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Assignee
              </label>
              {isEditing ? (
                <select
                  value={editedAssigneeId || ''}
                  onChange={(e) =>
                    setEditedAssigneeId(e.target.value ? parseInt(e.target.value) : null)
                  }
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Unassigned</option>
                  {members.map((m: any) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              ) : issue.assignee_avatar ? (
                <div className="flex items-center gap-2">
                  <Image
                    src={issue.assignee_avatar}
                    alt={issue.assignee_name || 'Assignee'}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="text-sm">{issue.assignee_name}</span>
                </div>
              ) : issue.assignee_name ? (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-xs font-medium">
                    {issue.assignee_name.charAt(0)}
                  </div>
                  <span className="text-sm">{issue.assignee_name}</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              )}
            </div>

            {/* Start Date */}
            <div className="bg-card rounded-lg border border-border p-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Start Date
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={editedStartDate}
                  onChange={(e) => setEditedStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (issue as any).start_date ? (
                <p className="text-sm">
                  {new Date((issue as any).start_date).toLocaleDateString()}
                </p>
              ) : (
                <span className="text-sm text-muted-foreground">Not set</span>
              )}
            </div>

            {/* Due Date */}
            <div className="bg-card rounded-lg border border-border p-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Due Date
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={editedDueDate}
                  onChange={(e) => setEditedDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (issue as any).due_date ? (
                <p className="text-sm">
                  {new Date((issue as any).due_date).toLocaleDateString()}
                </p>
              ) : (
                <span className="text-sm text-muted-foreground">Not set</span>
              )}
            </div>

            {/* Milestone */}
            {issue.milestone_name && (
              <div className="bg-card rounded-lg border border-border p-4">
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Milestone
                </label>
                <span className="text-sm">{issue.milestone_name}</span>
              </div>
            )}

            {/* Dates */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Created
                </label>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(issue.created_at))} ago
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Updated
                </label>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(issue.updated_at))} ago
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

