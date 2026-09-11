import { useCallback, useEffect, useState } from 'react'
import type { Job, JobProgress } from '@openpet/contracts'
import { requestBackend, useSse } from './useSse.ts'

export function useJob(jobId: string | null): { job: Job | null; progress: JobProgress | null; cancel: () => void } {
  const [job, setJob] = useState<Job | null>(null)
  const events = useSse(jobId ? ['jobs'] : [])
  const refresh = useCallback(async () => {
    if (!jobId) { setJob(null); return }
    try {
      const payload = await requestBackend(`/jobs/${encodeURIComponent(jobId)}`)
      setJob((payload as { data?: Job }).data ?? payload as Job)
    } catch { /* transport state remains observable through useSse */ }
  }, [jobId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (events.lastEventId) void refresh() }, [events.lastEventId, refresh])

  const cancel = useCallback(() => {
    if (jobId) void requestBackend(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }).then(refresh).catch(() => {})
  }, [jobId, refresh])
  return { job, progress: job?.progress ?? null, cancel }
}
