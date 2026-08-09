/* Input limits mirroring the CHECK constraints in
   supabase/migrations/00002_production_hardening.sql. The database is
   the real boundary; these keep honest users inside it and give
   friendlier feedback than a constraint violation. */

export const LIMITS = {
  displayName: 80,
  bio: 1000,
  location: 120,
  avatarUrl: 500,
  joinName: 120,
  email: 320,
  joinMessage: 2000,
  inviteNote: 500,
  categoryName: 60,
  categoryDescription: 500,
  categoryIcon: 40,
  listingTitle: 140,
  listingDescription: 5000,
  tradeTitle: 140,
  tradeOffering: 2000,
  tradeNeeding: 2000,
  eventTitle: 140,
  eventLocation: 200,
  eventNotes: 5000,
  messageBody: 8000,
  reviewBody: 4000,
  newsletterSubject: 200,
  newsletterBody: 20000,
} as const

// All C0/C1 control characters except tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/** Trim, strip non-printing control characters, cap length. */
export function cleanText(value: string, max: number): string {
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max)
}

/** cleanText, but an empty result becomes null (for nullable columns). */
export function cleanOptional(value: string, max: number): string | null {
  const cleaned = cleanText(value, max)
  return cleaned === '' ? null : cleaned
}

export function isValidEmail(value: string): boolean {
  return value.length <= LIMITS.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

/** Returns the URL if it parses as http(s), otherwise null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/** Escape % and _ so user input matches literally inside ilike patterns. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
