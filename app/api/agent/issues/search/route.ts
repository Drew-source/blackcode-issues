import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { parseNaturalLanguageQuery, executeNLSearch } from '@/lib/nl-search'

export async function GET(req: Request) {
  return withAgentAuth(req, async () => {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')

    if (!q || q.trim().length === 0) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'q query parameter is required', suggestion: 'Example: ?q=blocked high priority issues in Project Alpha' }
      }, { status: 400 })
    }

    const parsed = parseNaturalLanguageQuery(q)
    const issues = await executeNLSearch(parsed)

    return NextResponse.json({
      ok: true,
      data: {
        query: q,
        parsed_filters: parsed,
        issues,
        count: issues.length,
      }
    })
  })
}
