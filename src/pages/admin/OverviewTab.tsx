import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { AdminTabId } from './tabs'
import { ErrorBlock, SectionHeader } from './shared'
import { buttonClass } from './helpers'

interface Stats {
  activeMembers: number
  pendingMembers: number
  pendingRequests: number
  activeListings: number
  completedTrades: number
  totalReviews: number
}

const EMPTY_STATS: Stats = {
  activeMembers: 0,
  pendingMembers: 0,
  pendingRequests: 0,
  activeListings: 0,
  completedTrades: 0,
  totalReviews: 0,
}

interface StatCard {
  key: keyof Stats
  label: string
  hint: string
  jumpTo?: AdminTabId
  jumpLabel?: string
}

const CARDS: StatCard[] = [
  { key: 'activeMembers', label: 'Active members', hint: 'Approved and trading' },
  {
    key: 'pendingMembers',
    label: 'Pending members',
    hint: 'Signed up, waiting on you',
    jumpTo: 'members',
    jumpLabel: 'Review members',
  },
  {
    key: 'pendingRequests',
    label: 'Pending join requests',
    hint: 'Sent from the landing page',
    jumpTo: 'requests',
    jumpLabel: 'Review requests',
  },
  { key: 'activeListings', label: 'Active listings', hint: 'Visible in the feed' },
  { key: 'completedTrades', label: 'Completed trades', hint: 'Confirmed by both sides' },
  { key: 'totalReviews', label: 'Total reviews', hint: 'Ratings left by members' },
]

export default function OverviewTab({ onJump }: { onJump: (tab: AdminTabId) => void }) {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const countOf = async (table: string, column?: string, value?: string) => {
      const base = supabase.from(table).select('id', { count: 'exact', head: true })
      const { count, error: queryError } = column && value ? await base.eq(column, value) : await base
      return { count: count ?? 0, failed: Boolean(queryError) }
    }

    const results = await Promise.all([
      countOf('profiles', 'status', 'active'),
      countOf('profiles', 'status', 'pending'),
      countOf('join_requests', 'status', 'pending'),
      countOf('listings', 'status', 'active'),
      countOf('trades', 'status', 'completed'),
      countOf('reviews'),
    ])

    if (results.some((result) => result.failed)) {
      setError('We could not load the dashboard numbers. Please try again.')
      setLoading(false)
      return
    }

    setStats({
      activeMembers: results[0].count,
      pendingMembers: results[1].count,
      pendingRequests: results[2].count,
      activeListings: results[3].count,
      completedTrades: results[4].count,
      totalReviews: results[5].count,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Overview"
        description="A quick read on the co-op. Anything waiting on you is highlighted in amber."
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={buttonClass('secondary', 'sm')}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <div key={card.key} className="animate-pulse rounded-2xl border border-stone-200 bg-stone-100 p-5">
              <div className="h-4 w-28 rounded-full bg-stone-200" />
              <div className="mt-4 h-9 w-16 rounded-xl bg-stone-200" />
              <div className="mt-3 h-3 w-36 rounded-full bg-stone-200" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => {
            const value = stats[card.key]
            const needsAttention = Boolean(card.jumpTo) && value > 0
            return (
              <div
                key={card.key}
                className={`flex flex-col rounded-2xl border p-5 shadow-sm transition-colors ${
                  needsAttention ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    needsAttention ? 'text-amber-700' : 'text-stone-500'
                  }`}
                >
                  {card.label}
                </p>
                <p
                  className={`mt-2 text-4xl font-bold tracking-tight ${
                    needsAttention ? 'text-amber-800' : 'text-stone-900'
                  }`}
                >
                  {value}
                </p>
                <p className={`mt-1 text-xs ${needsAttention ? 'text-amber-700' : 'text-stone-400'}`}>
                  {card.hint}
                </p>
                {needsAttention && card.jumpTo && (
                  <button
                    type="button"
                    onClick={() => onJump(card.jumpTo as AdminTabId)}
                    className={`mt-4 self-start ${buttonClass('amber', 'sm')}`}
                  >
                    {card.jumpLabel ?? 'Review'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
