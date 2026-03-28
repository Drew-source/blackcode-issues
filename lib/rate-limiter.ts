const windowMs = 60 * 1000
const maxRequests = 100

const buckets = new Map<number, { count: number; resetAt: number }>()

export function checkRateLimit(apiKeyId: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let bucket = buckets.get(apiKeyId)

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(apiKeyId, bucket)
  }

  bucket.count++

  if (bucket.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
  }

  return { allowed: true, remaining: maxRequests - bucket.count, resetAt: bucket.resetAt }
}
