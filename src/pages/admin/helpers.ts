/* Shared class strings and small utilities for the admin dashboard. */

export const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-stone-100'

export const labelClass = 'block text-sm font-medium text-stone-700'

export const cardClass = 'rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6'

export type Tone = 'emerald' | 'amber' | 'red' | 'stone'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'amber'
export type ButtonSize = 'sm' | 'md'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 disabled:hover:bg-emerald-300',
  secondary:
    'border border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-100',
  danger: 'border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50',
  amber:
    'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-300 disabled:hover:bg-amber-300',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return [
    'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClasses[variant],
    sizeClasses[size],
  ].join(' ')
}

// Error helpers live in lib/errors so member pages share them;
// re-exported here to keep existing admin imports working.
export { describeError, isUniqueViolation } from '../../lib/errors'
export type { QueryError } from '../../lib/errors'

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
