import { Star } from 'lucide-react'
import type { Score } from '../lib/types'

interface StarsProps {
  value: number
  size?: 'sm' | 'md'
  showNumber?: boolean
}

/** Read-only star row. */
export function Stars({ value, size = 'md', showNumber = false }: StarsProps) {
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const text = size === 'sm' ? 'text-xs' : 'text-base'
  return (
    <span className={`inline-flex items-center gap-1 ${text}`}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden
            className={`${icon} fill-current ${
              n <= Math.round(value) ? 'text-amber-500' : 'text-stone-300'
            }`}
          />
        ))}
      </span>
      {showNumber && <span className="font-medium text-stone-600">{value.toFixed(1)}</span>}
    </span>
  )
}

interface StarInputProps {
  value: Score | null
  onChange: (value: Score) => void
  label?: string
  size?: 'sm' | 'md'
}

/** Clickable star input for review forms. */
export function StarInput({ value, onChange, label, size = 'md' }: StarInputProps) {
  const icon = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-32 text-sm text-stone-600">{label}</span>}
      <div className="flex" role="radiogroup" aria-label={label ?? 'Rating'}>
        {([1, 2, 3, 4, 5] as Score[]).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={`px-0.5 transition-colors ${
              value !== null && n <= value ? 'text-amber-500' : 'text-stone-300 hover:text-amber-300'
            }`}
          >
            <Star aria-hidden className={`${icon} fill-current`} />
          </button>
        ))}
      </div>
    </div>
  )
}
