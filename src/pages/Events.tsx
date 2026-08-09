import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { describeError } from '../lib/errors'
import { formatEventRange } from '../lib/format'
import { cleanOptional, cleanText, LIMITS } from '../lib/validate'
import { useLive } from '../lib/useLive'
import type { CoopEvent } from '../lib/types'

const fieldClass =
  'w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

const labelClass = 'mb-1 block text-sm font-medium text-stone-700'

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

/** Community events: members propose them, admins approve, everyone sees where and when. */
export default function Events() {
  const { profile } = useAuth()
  const me = profile?.id ?? null

  const [events, setEvents] = useState<CoopEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [proposalError, setProposalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })

    if (queryError) {
      setError(describeError(queryError, 'We could not load the events.'))
      setLoading(false)
      return
    }

    setError(null)
    setEvents((data as CoopEvent[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // An admin approving a proposal shows up here without a refresh.
  useLive('events-live', [{ table: 'events' }], load)

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const approved = events.filter((event) => event.status === 'approved')
    return {
      upcoming: approved.filter((event) => !isPast(event, now)),
      past: approved.filter((event) => isPast(event, now)).reverse(),
    }
  }, [events])

  const myProposals = useMemo(() => {
    if (!me) return []
    return events
      .filter((event) => event.proposed_by === me && event.status !== 'approved')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [events, me])

  const resetForm = () => {
    setTitle('')
    setStartsAt('')
    setEndsAt('')
    setLocation('')
    setNotes('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!me) return

    setFormSuccess(null)

    const cleanTitle = cleanText(title, LIMITS.eventTitle)
    if (!cleanTitle) {
      setFormError('Give the event a title.')
      return
    }

    const start = new Date(startsAt)
    if (!startsAt || Number.isNaN(start.getTime())) {
      setFormError('Pick a date and time for the event.')
      return
    }

    let endIso: string | null = null
    if (endsAt) {
      const end = new Date(endsAt)
      if (Number.isNaN(end.getTime())) {
        setFormError('The end time does not look like a valid date.')
        return
      }
      if (end.getTime() < start.getTime()) {
        setFormError('The event cannot end before it starts.')
        return
      }
      endIso = end.toISOString()
    }

    setSubmitting(true)
    setFormError(null)

    const { error: insertError } = await supabase.from('events').insert({
      title: cleanTitle,
      starts_at: start.toISOString(),
      ends_at: endIso,
      location: cleanOptional(location, LIMITS.eventLocation),
      notes: cleanOptional(notes, LIMITS.eventNotes),
      status: 'pending',
      proposed_by: me,
    })

    setSubmitting(false)

    if (insertError) {
      setFormError(describeError(insertError, 'We could not send that proposal.'))
      return
    }

    resetForm()
    setFormOpen(false)
    setFormSuccess('Proposal sent. An admin will review it and you will see it below.')
    await load()
  }

  const withdraw = async (event: CoopEvent) => {
    if (!window.confirm(`Withdraw "${event.title}"?`)) return

    setBusyId(event.id)
    setProposalError(null)
    const { error: deleteError } = await supabase.from('events').delete().eq('id', event.id)
    setBusyId(null)

    if (deleteError) {
      setProposalError(describeError(deleteError, 'We could not withdraw that proposal.'))
      return
    }

    setEvents((current) => current.filter((row) => row.id !== event.id))
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Events</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Where and when the co-op gets together — potlucks, repair cafes, skill swaps, and more.
          </p>
        </div>
        {me && (
          <button
            type="button"
            onClick={() => {
              setFormOpen((open) => !open)
              setFormError(null)
              setFormSuccess(null)
            }}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            {formOpen ? 'Close form' : 'Propose an event'}
          </button>
        )}
      </div>

      {formSuccess && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {formSuccess}
        </p>
      )}

      {formOpen && me && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-base font-semibold text-stone-900">Propose an event</h2>
            <p className="mt-1 text-sm text-stone-500">
              An admin reviews every proposal before it goes on the calendar.
            </p>
          </div>

          <div>
            <label htmlFor="event-title" className={labelClass}>
              Title
            </label>
            <input
              id="event-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={LIMITS.eventTitle}
              placeholder="Repair cafe at the community garden"
              className={fieldClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="event-starts" className={labelClass}>
                Date & time
              </label>
              <input
                id="event-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="event-ends" className={labelClass}>
                Ends <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="event-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="event-location" className={labelClass}>
              Location <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="event-location"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={LIMITS.eventLocation}
              placeholder="1234 Olive Ave, Fresno"
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="event-notes" className={labelClass}>
              Notes <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <textarea
              id="event-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={LIMITS.eventNotes}
              rows={3}
              placeholder="What to bring, parking, who to look for..."
              className={`resize-y ${fieldClass}`}
            />
          </div>

          {formError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Send proposal'}
          </button>
        </form>
      )}

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

          {myProposals.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold tracking-tight text-stone-900">
                Your proposals <span className="text-stone-400">({myProposals.length})</span>
              </h2>

              {proposalError && (
                <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {proposalError}
                </p>
              )}

              <ul className="space-y-3">
                {myProposals.map((event) => {
                  const pending = event.status === 'pending'
                  return (
                    <li
                      key={event.id}
                      className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-stone-900">{event.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              pending ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-700'
                            }`}
                          >
                            {pending ? 'Awaiting approval' : 'Not approved'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-stone-500">
                          {formatEventRange(event.starts_at, event.ends_at)}
                          {event.location ? ` · ${event.location}` : ''}
                        </p>
                        {event.notes && (
                          <p className="mt-1.5 whitespace-pre-line text-sm text-stone-500">
                            {event.notes}
                          </p>
                        )}
                        {event.review_note && (
                          <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-600">
                            Note from the admins: {event.review_note}
                          </p>
                        )}
                      </div>

                      {pending && (
                        <button
                          type="button"
                          disabled={busyId === event.id}
                          onClick={() => void withdraw(event)}
                          className="shrink-0 self-start rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyId === event.id ? 'Working...' : 'Withdraw'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
