import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { formatEventRange } from '../../lib/format'
import { cleanOptional, cleanText, LIMITS } from '../../lib/validate'
import type { CoopEvent } from '../../lib/types'
import { EmptyBlock, ErrorBlock, Feedback, LoadingBlock, Pill, SectionHeader } from './shared'
import { buttonClass, cardClass, describeError, inputClass, labelClass } from './helpers'

/* datetime-local inputs speak local wall-clock time; the database
   speaks timestamptz. These convert between the two. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

interface Draft {
  title: string
  location: string
  notes: string
  startsAt: string
  endsAt: string
}

const EMPTY_DRAFT: Draft = { title: '', location: '', notes: '', startsAt: '', endsAt: '' }

/** Validates a draft; returns the insert/update payload or an error message. */
function draftToPayload(draft: Draft): { payload?: Record<string, unknown>; error?: string } {
  const title = cleanText(draft.title, LIMITS.eventTitle)
  if (!title) return { error: 'Give the event a title.' }

  const startsAt = fromLocalInput(draft.startsAt)
  if (!startsAt) return { error: 'Pick a date and time for the event.' }

  const endsAt = fromLocalInput(draft.endsAt)
  if (draft.endsAt && !endsAt) return { error: 'The end time does not look like a valid date.' }
  if (endsAt && endsAt < startsAt) return { error: 'The event cannot end before it starts.' }

  return {
    payload: {
      title,
      location: cleanOptional(draft.location, LIMITS.eventLocation),
      notes: cleanOptional(draft.notes, LIMITS.eventNotes),
      starts_at: startsAt,
      ends_at: endsAt,
    },
  }
}

function DraftFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string
  draft: Draft
  onChange: (draft: Draft) => void
}) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-title`} className={labelClass}>
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          maxLength={LIMITS.eventTitle}
          placeholder="Repair cafe at the community garden"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-starts`} className={labelClass}>
            Starts
          </label>
          <input
            id={`${idPrefix}-starts`}
            type="datetime-local"
            value={draft.startsAt}
            onChange={(event) => onChange({ ...draft, startsAt: event.target.value })}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-ends`} className={labelClass}>
            Ends <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-ends`}
            type="datetime-local"
            value={draft.endsAt}
            onChange={(event) => onChange({ ...draft, endsAt: event.target.value })}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-location`} className={labelClass}>
          Location <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <input
          id={`${idPrefix}-location`}
          type="text"
          value={draft.location}
          onChange={(event) => onChange({ ...draft, location: event.target.value })}
          maxLength={LIMITS.eventLocation}
          placeholder="1234 Olive Ave, Fresno"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-notes`} className={labelClass}>
          Notes <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          value={draft.notes}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          maxLength={LIMITS.eventNotes}
          rows={3}
          placeholder="What to bring, parking, who to look for..."
          className={`mt-1.5 resize-y ${inputClass}`}
        />
      </div>
    </>
  )
}

export default function EventsTab() {
  const [events, setEvents] = useState<CoopEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)
  const [rowError, setRowError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })

    if (queryError) {
      setError('We could not load the events. Please try again.')
      setLoading(false)
      return
    }

    setEvents((data as CoopEvent[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sortByStart = (list: CoopEvent[]) =>
    [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { payload, error: validationError } = draftToPayload(draft)
    if (!payload) {
      setFormError(validationError ?? 'Check the event details.')
      setFormSuccess(null)
      return
    }

    setCreating(true)
    setFormError(null)
    setFormSuccess(null)

    const { data, error: insertError } = await supabase
      .from('events')
      .insert(payload)
      .select('*')
      .single()

    if (insertError) {
      setFormError(describeError(insertError, 'We could not create that event.'))
      setCreating(false)
      return
    }

    setEvents((current) => sortByStart([...current, data as CoopEvent]))
    setDraft(EMPTY_DRAFT)
    setFormSuccess('Event published. Every member can see it on the Events page.')
    setCreating(false)
  }

  const startEdit = (item: CoopEvent) => {
    setRowError(null)
    setEditingId(item.id)
    setEditDraft({
      title: item.title,
      location: item.location ?? '',
      notes: item.notes ?? '',
      startsAt: toLocalInput(item.starts_at),
      endsAt: toLocalInput(item.ends_at),
    })
  }

  const saveEdit = async (item: CoopEvent) => {
    const { payload, error: validationError } = draftToPayload(editDraft)
    if (!payload) {
      setRowError(validationError ?? 'Check the event details.')
      return
    }

    setBusyId(item.id)
    setRowError(null)

    const { data, error: updateError } = await supabase
      .from('events')
      .update(payload)
      .eq('id', item.id)
      .select('*')
      .single()

    if (updateError) {
      setRowError(describeError(updateError, 'We could not save that event.'))
      setBusyId(null)
      return
    }

    setEvents((current) =>
      sortByStart(current.map((row) => (row.id === item.id ? (data as CoopEvent) : row)))
    )
    setEditingId(null)
    setBusyId(null)
  }

  const handleDelete = async (item: CoopEvent) => {
    const ok = window.confirm(`Delete "${item.title}"? Members will no longer see it.`)
    if (!ok) return

    setBusyId(item.id)
    setRowError(null)
    const { error: deleteError } = await supabase.from('events').delete().eq('id', item.id)

    if (deleteError) {
      setRowError(describeError(deleteError, 'We could not delete that event.'))
      setBusyId(null)
      return
    }

    setEvents((current) => current.filter((row) => row.id !== item.id))
    if (editingId === item.id) setEditingId(null)
    setBusyId(null)
  }

  const now = Date.now()

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Events"
        description="Publish where and when the co-op gets together. Every member sees these on the Events page."
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

      <form onSubmit={handleCreate} className={`${cardClass} space-y-4`}>
        <h3 className="font-semibold text-stone-900">New event</h3>

        <DraftFields idPrefix="event-new" draft={draft} onChange={setDraft} />

        {formError && <Feedback tone="error" message={formError} />}
        {formSuccess && <Feedback tone="success" message={formSuccess} />}

        <button type="submit" disabled={creating} className={buttonClass('primary')}>
          {creating ? 'Publishing...' : 'Publish event'}
        </button>
      </form>

      {rowError && <Feedback tone="error" message={rowError} />}
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingBlock rows={3} />
      ) : events.length === 0 ? (
        <EmptyBlock>No events yet. Publish the first one above.</EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {events.map((item) => {
            const busy = busyId === item.id
            const over = new Date(item.ends_at ?? item.starts_at).getTime() < now

            if (editingId === item.id) {
              return (
                <li
                  key={item.id}
                  className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
                >
                  <DraftFields idPrefix={`event-${item.id}`} draft={editDraft} onChange={setEditDraft} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveEdit(item)}
                      className={buttonClass('primary', 'sm')}
                    >
                      {busy ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              )
            }

            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-900">{item.title}</p>
                    <Pill tone={over ? 'stone' : 'emerald'}>{over ? 'Past' : 'Upcoming'}</Pill>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {formatEventRange(item.starts_at, item.ends_at)}
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                  {item.notes && (
                    <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-stone-500">
                      {item.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(item)}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(item)}
                    className={buttonClass('danger', 'sm')}
                  >
                    {busy ? 'Working...' : 'Delete'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
