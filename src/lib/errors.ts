/* Maps Supabase/PostgREST errors to copy that is safe to show users.
   Raw error.message can leak constraint names, policy text, and other
   database internals. Exceptions we raise ourselves (rate limits, RPC
   validation) use errcode P0001 and are written for end users, so those
   pass through unchanged. */

export interface QueryError {
  message?: string
  code?: string
}

const FRIENDLY: Record<string, string> = {
  '23505': 'That already exists.',
  '23514': 'Part of what you entered is too long or not allowed.',
  '23503': 'That item no longer exists.',
  '42501': 'You do not have permission to do that.',
}

export function describeError(error: QueryError | null | undefined, fallback: string): string {
  if (!error) return fallback
  if (error.code === 'P0001' && error.message) return error.message
  const friendly = error.code ? FRIENDLY[error.code] : undefined
  if (friendly) return `${fallback} ${friendly}`
  if ((error.message ?? '').toLowerCase().includes('fetch')) {
    return `${fallback} Check your connection and try again.`
  }
  return fallback
}

export function isUniqueViolation(error: QueryError | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' || (error.message ?? '').toLowerCase().includes('duplicate key')
}
