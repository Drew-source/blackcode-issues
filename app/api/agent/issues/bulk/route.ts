import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { createIssue, updateIssue, logTransaction, updateSyncStatus } from '@/lib/db'
import { enqueueSyncEvent, processSyncQueue, isSyncReady } from '@/lib/sync'

export async function POST(req: Request) {
  return withAgentAuth(req, async (agent) => {
    const body = await req.json()
    const { operation, issues } = body

    if (!operation || !['create', 'update', 'close'].includes(operation)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid operation', suggestion: 'Valid operations: create, update, close' }
      }, { status: 400 })
    }

    if (!Array.isArray(issues) || issues.length === 0) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'issues must be a non-empty array', suggestion: 'Provide an array of issue objects' }
      }, { status: 400 })
    }

    if (issues.length > 50) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Too many issues (${issues.length})`, suggestion: 'Max 50 issues per request. Split into batches.' }
      }, { status: 400 })
    }

    const results: any[] = []
    const errors: any[] = []
    let needsSync = false

    if (operation === 'create') {
      for (let i = 0; i < issues.length; i++) {
        try {
          const item = issues[i]
          if (!item.project_id || !item.title) {
            errors.push({ index: i, error: 'project_id and title are required' })
            continue
          }

          const issue = await createIssue({
            project_id: item.project_id,
            title: item.title,
            description: item.description,
            status: item.status,
            priority: item.priority,
            assignee_id: item.assignee_id,
            milestone_id: item.milestone_id,
            reporter_id: agent.user_id,
            internal_only: item.internal_only,
            due_date: item.due_date,
            payment_amount: item.payment_amount,
            payment_currency: item.payment_currency,
            payment_details: item.payment_details,
            requirements: item.requirements,
          })

          if (issue) {
            await logTransaction({
              user_id: agent.user_id,
              operation_type: 'INSERT',
              table_name: 'issues',
              record_id: issue.id,
              new_data: issue,
            })

            if (!issue.internal_only) {
              if (isSyncReady(issue as any)) {
                const plainDescription = issue.description
                  ? issue.description.replace(/<[^>]*>/g, '').trim()
                  : ''

                await enqueueSyncEvent(issue.id, 'issue_created', {
                  title: issue.title,
                  description: plainDescription || issue.title,
                  requirements: issue.requirements || undefined,
                  payment_amount: issue.payment_amount,
                  payment_currency: issue.payment_currency,
                  payment_details: issue.payment_details || undefined,
                  deadline: issue.due_date || null,
                  project_id: issue.project_id,
                })
                needsSync = true
              } else {
                await updateSyncStatus(issue.id, 'pending_fields')
              }
            }

            results.push(issue)
          }
        } catch (e: any) {
          errors.push({ index: i, error: e.message || 'Unknown error' })
        }
      }
    } else if (operation === 'update') {
      for (let i = 0; i < issues.length; i++) {
        try {
          const item = issues[i]
          if (!item.id) {
            errors.push({ index: i, error: 'id is required for update' })
            continue
          }

          const issue = await updateIssue(item.id, {
            title: item.title,
            description: item.description,
            status: item.status,
            priority: item.priority,
            assignee_id: item.assignee_id,
            milestone_id: item.milestone_id,
            start_date: item.start_date,
            due_date: item.due_date,
            internal_only: item.internal_only,
            payment_amount: item.payment_amount,
            payment_currency: item.payment_currency,
            payment_details: item.payment_details,
            requirements: item.requirements,
          })

          if (issue) {
            await logTransaction({
              user_id: agent.user_id,
              operation_type: 'UPDATE',
              table_name: 'issues',
              record_id: item.id,
              new_data: issue,
            })

            // Check for pending_fields → pending transition
            if (!issue.internal_only && issue.taskhive_sync_status === 'pending_fields' && isSyncReady(issue as any)) {
              const plainDescription = issue.description
                ? issue.description.replace(/<[^>]*>/g, '').trim()
                : ''

              await enqueueSyncEvent(issue.id, 'issue_created', {
                title: issue.title,
                description: plainDescription || issue.title,
                requirements: issue.requirements || undefined,
                payment_amount: issue.payment_amount,
                payment_currency: issue.payment_currency,
                payment_details: issue.payment_details || undefined,
                deadline: issue.due_date || null,
                project_id: issue.project_id,
              })
              await updateSyncStatus(issue.id, 'pending')
              needsSync = true
            }

            results.push(issue)
          } else {
            errors.push({ index: i, error: `Issue ${item.id} not found` })
          }
        } catch (e: any) {
          errors.push({ index: i, error: e.message || 'Unknown error' })
        }
      }
    } else if (operation === 'close') {
      for (let i = 0; i < issues.length; i++) {
        try {
          const item = issues[i]
          const id = typeof item === 'number' ? item : item.id
          if (!id) {
            errors.push({ index: i, error: 'id is required for close' })
            continue
          }

          const issue = await updateIssue(id, { status: 'done' })

          if (issue) {
            await logTransaction({
              user_id: agent.user_id,
              operation_type: 'UPDATE',
              table_name: 'issues',
              record_id: id,
              new_data: issue,
            })
            results.push(issue)
          } else {
            errors.push({ index: i, error: `Issue ${id} not found` })
          }
        } catch (e: any) {
          errors.push({ index: i, error: e.message || 'Unknown error' })
        }
      }
    }

    if (needsSync) {
      processSyncQueue().catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      data: {
        operation,
        processed: results.length,
        failed: errors.length,
        results,
        errors,
      }
    })
  })
}
