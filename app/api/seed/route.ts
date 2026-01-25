import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// POST /api/seed - Seed mock data for testing
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Create mock projects
    const projectNames = [
      { name: 'Frontend Redesign', description: 'Complete UI/UX overhaul with new design system' },
      { name: 'API v2', description: 'RESTful API redesign with GraphQL support' },
      { name: 'Mobile App', description: 'iOS and Android native applications' },
      { name: 'Infrastructure', description: 'Cloud infrastructure and DevOps improvements' },
      { name: 'Documentation', description: 'Technical documentation and API reference' },
    ]

    const createdProjects: number[] = []
    
    for (const proj of projectNames) {
      const result = await sql`
        INSERT INTO projects (name, description, owner_id)
        VALUES (${proj.name}, ${proj.description}, ${userId})
        ON CONFLICT DO NOTHING
        RETURNING id
      `
      if (result[0]?.id) {
        createdProjects.push(result[0].id as number)
        // Add user as project member
        await sql`
          INSERT INTO project_members (project_id, user_id, role)
          VALUES (${result[0].id}, ${userId}, 'owner')
          ON CONFLICT DO NOTHING
        `
      }
    }

    // Get all projects including existing ones
    const allProjects = await sql`SELECT id FROM projects`
    const projectIds = allProjects.map((p: any) => p.id)

    if (projectIds.length === 0) {
      return NextResponse.json({ error: 'No projects to seed issues into' }, { status: 400 })
    }

    // Create milestones
    const milestoneNames = [
      { name: 'Q1 2026 Release', due: '2026-03-31' },
      { name: 'Q2 2026 Release', due: '2026-06-30' },
      { name: 'Beta Launch', due: '2026-02-15' },
      { name: 'MVP Complete', due: '2026-01-31' },
    ]

    const createdMilestones: number[] = []
    for (const ms of milestoneNames) {
      for (const projectId of projectIds.slice(0, 3)) {
        const result = await sql`
          INSERT INTO milestones (project_id, name, due_date)
          VALUES (${projectId}, ${ms.name}, ${ms.due})
          ON CONFLICT DO NOTHING
          RETURNING id
        `
        if (result[0]?.id) {
          createdMilestones.push(result[0].id as number)
        }
      }
    }

    // Get all milestones
    const allMilestones = await sql`SELECT id, project_id FROM milestones`

    // Create mock issues
    const issueTemplates = [
      // Backlog
      { title: 'Research competitor features', status: 'backlog', priority: 4 },
      { title: 'Define API versioning strategy', status: 'backlog', priority: 3 },
      { title: 'Create wireframes for dashboard', status: 'backlog', priority: 3 },
      { title: 'Plan database migration', status: 'backlog', priority: 2 },
      { title: 'Review security audit findings', status: 'backlog', priority: 1 },
      
      // To Do
      { title: 'Set up CI/CD pipeline', status: 'todo', priority: 2 },
      { title: 'Configure monitoring alerts', status: 'todo', priority: 2 },
      { title: 'Write unit tests for auth module', status: 'todo', priority: 3 },
      { title: 'Design new onboarding flow', status: 'todo', priority: 3 },
      { title: 'Create API documentation', status: 'todo', priority: 3 },
      
      // In Progress
      { title: 'Implement user authentication', status: 'in_progress', priority: 1 },
      { title: 'Build dashboard components', status: 'in_progress', priority: 2 },
      { title: 'Optimize database queries', status: 'in_progress', priority: 2 },
      { title: 'Integrate payment gateway', status: 'in_progress', priority: 1 },
      { title: 'Refactor legacy code', status: 'in_progress', priority: 3 },
      
      // Blocked
      { title: 'Deploy to production', status: 'blocked', priority: 1, description: 'Waiting for security review' },
      { title: 'External API integration', status: 'blocked', priority: 2, description: 'Awaiting API keys from vendor' },
      { title: 'Mobile push notifications', status: 'blocked', priority: 3, description: 'Blocked by iOS certificate issue' },
      
      // In Review
      { title: 'New feature: Dark mode', status: 'in_review', priority: 3 },
      { title: 'Performance improvements', status: 'in_review', priority: 2 },
      { title: 'Bug fix: Login issues', status: 'in_review', priority: 1 },
      { title: 'Update dependencies', status: 'in_review', priority: 4 },
      
      // Done
      { title: 'Initial project setup', status: 'done', priority: 2 },
      { title: 'Configure development environment', status: 'done', priority: 2 },
      { title: 'Create database schema', status: 'done', priority: 1 },
      { title: 'Implement basic routing', status: 'done', priority: 3 },
      { title: 'Set up error handling', status: 'done', priority: 2 },
    ]

    let issuesCreated = 0
    
    for (const template of issueTemplates) {
      // Assign to random project
      const projectId = projectIds[Math.floor(Math.random() * projectIds.length)]
      
      // Maybe assign to a milestone
      const projectMilestones = allMilestones.filter((m: any) => m.project_id === projectId)
      const milestoneId = projectMilestones.length > 0 && Math.random() > 0.5
        ? projectMilestones[Math.floor(Math.random() * projectMilestones.length)].id
        : null

      await sql`
        INSERT INTO issues (
          project_id, 
          title, 
          description, 
          status, 
          priority, 
          milestone_id,
          reporter_id,
          assignee_id
        )
        VALUES (
          ${projectId},
          ${template.title},
          ${template.description || `Description for: ${template.title}`},
          ${template.status},
          ${template.priority},
          ${milestoneId},
          ${userId},
          ${Math.random() > 0.3 ? userId : null}
        )
      `
      issuesCreated++
    }

    // Add some comments to random issues
    const allIssues = await sql`SELECT id FROM issues ORDER BY RANDOM() LIMIT 15`
    const comments = [
      'Looking good! Ready for review.',
      'Can we discuss this in the standup?',
      'I have some concerns about the approach.',
      'Great progress on this!',
      'Need more details on the requirements.',
      'This might take longer than estimated.',
      'Found a potential edge case we should handle.',
      'Updated the implementation based on feedback.',
    ]

    for (const issue of allIssues) {
      const numComments = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < numComments; i++) {
        const comment = comments[Math.floor(Math.random() * comments.length)]
        await sql`
          INSERT INTO comments (issue_id, user_id, content)
          VALUES (${issue.id}, ${userId}, ${comment})
        `
      }
    }

    return NextResponse.json({
      success: true,
      created: {
        projects: createdProjects.length,
        milestones: createdMilestones.length,
        issues: issuesCreated,
      },
    })
  } catch (error) {
    console.error('Failed to seed data:', error)
    return NextResponse.json(
      { error: 'Failed to seed data', details: String(error) },
      { status: 500 }
    )
  }
}
