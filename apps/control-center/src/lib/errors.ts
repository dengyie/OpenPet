export const messageFromError = (error: unknown, fallback: string): string => (
  error instanceof Error && error.message ? error.message : fallback
)
