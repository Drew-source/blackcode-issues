'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { format, formatDistanceToNow, startOfDay, isSameDay } from 'date-fns'
import {
  Calendar,
  MessageSquare,
  Paperclip,
  ArrowLeft,
  Search,
  Filter,
  LayoutGrid,
  List,
} from 'lucide-react'

const PRIORITY_CONFIG = {
  1: { label: 'Urgent', color: 'text-red-500', bg: 'bg-red-500/10' },
  2: { label: 'High', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  3: { label: 'Medium', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  4: { label: 'Low', color: 'text-gray-500', bg: 'bg-gray-500/10' },
  5: { label: 'None', color: 'text-gray-400', bg: 'bg-gray-400/10' },
} as const

const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-gray-500',
  todo: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  blocked: 'bg-red-500',
  in_review: 'bg-purple-500',
  done: 'bg-green-500',
}

interface Issue {
  id: number
  title: string
  description?: string
  status: string
  priority: number
  assignee_id?: number
  assignee_name?: string
  assignee_avatar?: string
  comment_count: number
  attachment_count: number
  created_at: string
  updated_at: string
}

interface Project {
  id: number
  name: string
  description?: string
}

interface User {
  name?: string | null
  email?: string | null
  image?: string | null
}

export function TimelineView({
  project,
  issues,
  user,
  view = 'timeline',
  onViewChange,
}: {
  project: Project
  issues: Issue[]
  user: User
  view?: 'kanban' | 'timeline'
  onViewChange?: (view: 'kanban' | 'timeline') => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at')

  // Filter issues
  const filteredIssues = issues.filter((issue) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        issue.title.toLowerCase().includes(query) ||
        issue.id.toString().includes(query)
      )
    }
    return true
  })

  // Sort issues
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    const aDate = new Date(a[sortBy])
    const bDate = new Date(b[sortBy])
    return bDate.getTime() - aDate.getTime() // Most recent first
  })

  // Group issues by day
  const issuesByDay = sortedIssues.reduce((acc, issue) => {
    const date = startOfDay(new Date(issue[sortBy]))
    const dateKey = format(date, 'yyyy-MM-dd')
    if (!acc[dateKey]) {
      acc[dateKey] = {
        date,
        issues: [],
      }
    }
    acc[dateKey].issues.push(issue)
    return acc
  }, {} as Record<string, { date: Date; issues: Issue[] }>)

  const dayGroups = Object.values(issuesByDay).sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
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
                  #{project.id} • Timeline view
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Toggle */}
            {onViewChange && (
              <div className="flex items-center gap-1 bg-background border border-input rounded-lg p-1">
                <button
                  onClick={() => onViewChange('kanban')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    view === 'kanban'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <LayoutGrid size={16} className="inline mr-1.5" />
                  Kanban
                </button>
                <button
                  onClick={() => onViewChange('timeline')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    view === 'timeline'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <List size={16} className="inline mr-1.5" />
                  Timeline
                </button>
              </div>
            )}

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'created_at' | 'updated_at')}
              className="px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="created_at">Sort by Created</option>
              <option value="updated_at">Sort by Updated</option>
            </select>
          </div>
        </div>
      </header>

      {/* Timeline */}
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          {dayGroups.length === 0 ? (
            <div className="text-center py-24">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-2xl mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No issues found</h2>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search' : 'Create your first issue to get started'}
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-8">
                {dayGroups.map((group, groupIndex) => {
                  const isToday = isSameDay(group.date, new Date())
                  const isYesterday = isSameDay(
                    group.date,
                    new Date(Date.now() - 24 * 60 * 60 * 1000)
                  )

                  let dateLabel = format(group.date, 'MMMM d, yyyy')
                  if (isToday) dateLabel = 'Today'
                  else if (isYesterday) dateLabel = 'Yesterday'

                  return (
                    <div key={format(group.date, 'yyyy-MM-dd')} className="relative">
                      {/* Date header */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-card border-2 border-border rounded-full flex items-center justify-center flex-shrink-0 relative z-10">
                          <Calendar className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold">{dateLabel}</h2>
                          <p className="text-sm text-muted-foreground">
                            {group.issues.length} issue{group.issues.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Issues */}
                      <div className="ml-20 space-y-3">
                        {group.issues.map((issue, issueIndex) => {
                          const priority =
                            PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG]

                          return (
                            <motion.div
                              key={issue.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: (groupIndex * 0.1) + (issueIndex * 0.05) }}
                              className="relative"
                            >
                              {/* Timeline dot */}
                              <div className="absolute -left-12 top-4 w-3 h-3 rounded-full bg-primary border-2 border-background" />

                              {/* Issue card */}
                              <Link href={`/dashboard/issues/${issue.id}`}>
                                <div className="bg-card rounded-lg border border-border p-4 hover:border-primary/50 hover:shadow-md transition-all">
                                  <div className="flex items-start justify-between gap-4 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-mono text-muted-foreground">
                                          #{issue.id}
                                        </span>
                                        <div
                                          className={`w-2 h-2 rounded-full ${
                                            STATUS_COLORS[issue.status] || 'bg-gray-500'
                                          }`}
                                        />
                                        {priority && (
                                          <span
                                            className={`text-xs px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}
                                          >
                                            {priority.label}
                                          </span>
                                        )}
                                      </div>
                                      <h3 className="font-medium text-sm mb-1 line-clamp-1">
                                        {issue.title}
                                      </h3>
                                      {issue.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                          {issue.description}
                                        </p>
                                      )}
                                    </div>
                                    {issue.assignee_avatar && (
                                      <Image
                                        src={issue.assignee_avatar}
                                        alt={issue.assignee_name || 'Assignee'}
                                        width={32}
                                        height={32}
                                        className="rounded-full flex-shrink-0"
                                        title={issue.assignee_name}
                                      />
                                    )}
                                  </div>

                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                                    <span className="ml-auto">
                                      {sortBy === 'created_at'
                                        ? `Created ${formatDistanceToNow(new Date(issue.created_at))} ago`
                                        : `Updated ${formatDistanceToNow(new Date(issue.updated_at))} ago`}
                                    </span>
                                  </div>
                                </div>
                              </Link>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

