import type { Job } from '@openpet/contracts'

export function shouldRefreshOnSseState(previous: string, current: string): boolean {
  return current === 'open' && previous !== 'open'
}

export function canRetryJob(job: Pick<Job, 'status' | 'attempt' | 'maxAttempts'>): boolean {
  return (job.status === 'failed' || job.status === 'interrupted') &&
    Number.isInteger(job.attempt) &&
    Number.isInteger(job.maxAttempts) &&
    job.attempt < job.maxAttempts
}
