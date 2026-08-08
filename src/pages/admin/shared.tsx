import type { ReactNode } from 'react'
import { buttonClass } from './helpers'
import type { Tone } from './helpers'

/* ---------- pills ---------- */

const toneClasses: Record<Tone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  stone: 'border-stone-200 bg-stone-100 text-stone-600',
}

export function Pill({ tone = 'stone', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}

/* ---------- filter pills ---------- */

export interface FilterOption<T extends string> {
  id: T
  label: string
  count?: number
}

interface FilterPillsProps<T extends string> {
  options: FilterOption<T>[]
  value: T
  onChange: (id: T) => void
}

export function FilterPills<T extends string>({ options, value, onChange }: FilterPillsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-stone-300 bg-white text-stone-600 hover:border-stone-400 hover:bg-stone-100'
            }`}
          >
            {option.label}
            {typeof option.count === 'number' && (
              <span className={active ? 'ml-1.5 text-emerald-100' : 'ml-1.5 text-stone-400'}>
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- section header ---------- */

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-stone-900">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

/* ---------- loading, error, empty, feedback ---------- */

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 rounded-2xl border border-stone-200 bg-stone-100" />
      ))}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={buttonClass('secondary', 'sm')}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">
      {children}
    </p>
  )
}

export function Feedback({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const classes =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-red-200 bg-red-50 text-red-700'
  return (
    <p className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${classes}`} role="status">
      {message}
    </p>
  )
}
