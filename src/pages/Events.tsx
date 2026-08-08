import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'
import { formatEventRange } from '../lib/format'
import type { CoopEvent } from '../lib/types'

/** An event is over once its end (or start, if it has no end) has passed. */
function isPast(event: CoopEvent, now: number): boolean {
  return new Date(event.ends_at ?? event.starts_at).getTime() < now
}

function EventCard({ event, past }: { event: CoopEvent; past: boolean }) {
  return (
    <li
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        past ? 'border-stone-200 opacity-70' : 'border-emerald-200'
      }`}
    >
      <h3 className="text-lg font-bold tracking-tight text-stone-900">{event.title}</h3>
      <p className="mt-2 flex items-start gap-2 text-sm text-stone-600">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        {formatEventRange(event.starts_at, event.ends_at)}
      </p>
      {event.location && (
        <p className="mt-1.5 flex items-start gap-2 text-sm text-stone-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          {event.location}
        </p>
      )}
      {event.notes && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-600">
          {event.notes}
        </p>
      )}
    </li>
  )
}

/** Community events: admins post them, every member sees where and when. */
export default function Events() {
  const [events, setEvents] = useState<CoopEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })

    if (queryError) {
      setError(describeError(queryError, 'We could not load the events.'))
      setLoading(false)
      return
    }

    setEvents((data as CoopEvent[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    return {
      upcoming: events.filter((event) => !isPast(event, now)),
      past: events.filter((event) => isPast(event, now)).reverse(),
    }
  }, [events])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Events</h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Where and when the co-op gets together — potlucks, repair cafes, skill swaps, and more.
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => void load()}
            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-28 rounded-2xl bg-stone-100" />
          <div className="h-28 rounded-2xl bg-stone-100" />
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-lg font-bold tracking-tight text-stone-900">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">
                Nothing on the calendar right now. Check back soon.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {upcoming.map((event) => (
                  <EventCard key={event.id} event={event} past={false} />
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold tracking-tight text-stone-900">
                Past events <span className="text-stone-400">({past.length})</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {past.map((event) => (
                  <EventCard key={event.id} event={event} past />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
