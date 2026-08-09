import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/format'
import type { ContactMessage } from '../../lib/types'
import {
  EmptyBlock,
  ErrorBlock,
  Feedback,
  FilterPills,
  LoadingBlock,
  Pill,
  SectionHeader,
} from './shared'
import type { FilterOption } from './shared'
import { buttonClass, describeError } from './helpers'

type MessageFilter = 'all' | ContactMessage['status']

export default function ContactTab() {
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MessageFilter>('new')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (queryError) {
      setError('We could not load the contact messages. Please try again.')
      setLoading(false)
      return
    }

    setMessages((data ?? []) as ContactMessage[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(
    () =>
      messages.reduce(
        (acc, message) => {
          acc[message.status] += 1
          return acc
        },
        { new: 0, read: 0 } as Record<ContactMessage['status'], number>
      ),
    [messages]
  )

  const filterOptions: FilterOption<MessageFilter>[] = [
    { id: 'new', label: 'New', count: counts.new },
    { id: 'read', label: 'Read', count: counts.read },
    { id: 'all', label: 'All', count: messages.length },
  ]

  const visible = useMemo(
    () => (filter === 'all' ? messages : messages.filter((message) => message.status === filter)),
    [messages, filter]
  )

  const setStatus = async (message: ContactMessage, status: ContactMessage['status']) => {
    setBusyId(message.id)
    setActionError(null)
    const { error: updateError } = await supabase
      .from('contact_messages')
      .update({ status })
      .eq('id', message.id)
    if (updateError) {
      setActionError(describeError(updateError, 'That change did not save.'))
      setBusyId(null)
      return
    }
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, status } : item))
    )
    setBusyId(null)
  }

  const remove = async (message: ContactMessage) => {
    if (!window.confirm(`Delete the message from ${message.name}? This cannot be undone.`)) return
    setBusyId(message.id)
    setActionError(null)
    const { error: deleteError } = await supabase
      .from('contact_messages')
      .delete()
      .eq('id', message.id)
    if (deleteError) {
      setActionError(describeError(deleteError, 'We could not delete that message.'))
      setBusyId(null)
      return
    }
    setMessages((current) => current.filter((item) => item.id !== message.id))
    setBusyId(null)
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Contact messages"
        description="Notes sent from the landing page contact form. Reply by email, then mark them read."
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

      <FilterPills options={filterOptions} value={filter} onChange={setFilter} />

      {actionError && <Feedback tone="error" message={actionError} />}
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingBlock rows={3} />
      ) : visible.length === 0 ? (
        <EmptyBlock>
          {filter === 'all' ? 'No contact messages yet.' : `No ${filter} messages right now.`}
        </EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {visible.map((message) => {
            const busy = busyId === message.id
            return (
              <li
                key={message.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-900">{message.name}</p>
                      <Pill tone={message.status === 'new' ? 'amber' : 'stone'}>
                        {message.status === 'new' ? 'New' : 'Read'}
                      </Pill>
                    </div>
                    <a
                      href={`mailto:${message.email}`}
                      className="mt-1 block break-all text-sm text-emerald-700 underline-offset-2 hover:underline"
                    >
                      {message.email}
                    </a>
                  </div>
                  <span className="whitespace-nowrap text-xs text-stone-400">
                    {timeAgo(message.created_at)}
                  </span>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-600">
                  {message.message}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`mailto:${message.email}`} className={buttonClass('primary', 'sm')}>
                    Reply by email
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void setStatus(message, message.status === 'new' ? 'read' : 'new')
                    }
                    className={buttonClass('secondary', 'sm')}
                  >
                    {busy ? 'Working...' : message.status === 'new' ? 'Mark read' : 'Mark unread'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(message)}
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
