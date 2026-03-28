import { NextResponse } from 'next/server'
import { authenticateApiKey } from './api-auth'
import { checkRateLimit } from './rate-limiter'

export async function withAgentAuth(req: Request, handler: (agent: any) => Promise<NextResponse>): Promise<NextResponse> {
  const start = Date.now()

  const agent = await authenticateApiKey(req)
  if (!agent) {
    return NextResponse.json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key', suggestion: 'Use Bearer token with a valid bc_agent_ key' }
    }, { status: 401 })
  }

  const rateCheck = checkRateLimit(agent.id)
  if (!rateCheck.allowed) {
    const res = NextResponse.json({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests', suggestion: `Wait ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)}s` }
    }, { status: 429 })
    res.headers.set('X-RateLimit-Remaining', '0')
    res.headers.set('X-RateLimit-Reset', String(Math.ceil(rateCheck.resetAt / 1000)))
    return res
  }

  const response = await handler(agent)
  response.headers.set('X-RateLimit-Remaining', String(rateCheck.remaining))
  response.headers.set('X-Response-Time', `${Date.now() - start}ms`)

  return response
}
