import { useCallback, useEffect, useRef, useState } from 'react'
import type { Job, JobProgress } from '@openpet/contracts'
import { requestBackend, useSse } from './useSse.ts'

export function useJob(jobId: string | null): { job: Job | null; progress: JobProgress | null; cancel: () => void } {
  const [job, setJob] = useState<Job | null>(null)
  const refreshGeneration = useRef(0)
  const activeJobId = useRef(jobId)
  activeJobId.current = jobId
  const events = useSse(jobId ? ['jobs'] : [])
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    if (!jobId) { setJob(null); return }
    const requestedJobId = jobId
    try {
      const payload = await requestBackend(`/jobs/${encodeURIComponent(requestedJobId)}`)
      if (refreshGeneration.current !== generation || activeJobId.current !== requestedJobId) return
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
