'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'

export function SyncHealthBanner() {
  const { data } = useQuery({
    queryKey: ['sync-health'],
    queryFn: async () => {
      const res = await fetch('/api/sync-health')
      if (!res.ok) return null
      return res.json()
    },
    refetchInterval: 60000,
  })

  if (!data?.metrics?.dead_count || data.metrics.dead_count === 0) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-red-800">
          {data.metrics.dead_count} sync {data.metrics.dead_count === 1 ? 'entry has' : 'entries have'} permanently failed
        </p>
        <p className="text-xs text-red-600 mt-0.5">
          These issues failed to sync to TaskHive after max retries. Check the sync queue for details.
        </p>
      </div>
    </div>
  )
}
