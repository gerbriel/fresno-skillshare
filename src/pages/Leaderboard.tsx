import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import RankBadge from '../components/RankBadge'
import type { LeaderboardRow } from '../lib/types'

/** Community credit standings, drawn from the leaderboard view. */
export default function Leaderboard() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('leaderboard')
      .select('*')
      .order('score', { ascending: false })
      .order('display_name', { ascending: true })
      .limit(50)
    if (fetchError) {
      setError(fetchError.message)
      setRows([])
    } else {
      setRows((data as LeaderboardRow[] | null) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
          Community credit
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">Leaderboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">
          Standing is earned, not bought. Credit comes from completed trades, the reviews members
          leave you, the vouches you collect, and the badges you have been awarded.
        </p>
      </header>

      {loading && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="flex items-center gap-4 border-b border-stone-100 px-4 py-4 last:border-b-0"
            >
              <div className="h-5 w-5 animate-pulse rounded bg-stone-100" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-stone-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 animate-pulse rounded bg-stone-100" />
                <div className="h-3 w-64 animate-pulse rounded bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">The board could not be loaded. {error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-sm text-stone-500">
            No members on the board yet. The first completed trade puts someone here.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <ol>
            {rows.map((row, index) => {
              const position = index + 1
              const isMe = profile?.id === row.id
              return (
                <li
                  key={row.id}
                  className={`flex items-center gap-4 border-b border-stone-100 px-4 py-4 last:border-b-0 ${
                    isMe ? 'bg-emerald-50/50' : ''
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-right text-sm tabular-nums ${
                      position <= 3 ? 'font-bold text-amber-600' : 'text-stone-400'
                    }`}
                  >
                    {position}
                  </span>

                  <Avatar name={row.display_name} url={row.avatar_url} size="md" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/u/${row.id}`}
                        className="truncate font-semibold text-stone-900 hover:text-emerald-700"
                      >
                        {row.display_name}
                      </Link>
                      <RankBadge completedTrades={row.completed_trades} />
                      {isMe && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          You
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      <span className="font-semibold text-amber-600">{row.score} credit</span>
                      {' · '}
                      <span className="text-amber-500">★</span>
                      {Number(row.avg_rating).toFixed(1)} ({row.review_count})
                      {' · '}
                      {row.completed_trades} trades
                      {' · '}
                      {row.vouch_count} vouches
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-600">
        Want on the board? Complete trades, earn reviews, and get vouched for.
      </div>
    </div>
  )
}
