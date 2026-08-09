import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/format'
import type { Message, ThreadWithProfiles } from '../../lib/types'
import Avatar from '../../components/Avatar'
import { EmptyBlock, ErrorBlock, Feedback, LoadingBlock, Pill, SectionHeader } from './shared'
import { buttonClass, describeError } from './helpers'

export default function ReportsTab() {
  const [threads, setThreads] = useState<ThreadWithProfiles[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>({})
  const [messagesLoading, setMessagesLoading] = useState<string | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('message_threads')
      .select(
        '*, a:profiles!message_threads_a_id_fkey(id, display_name, avatar_url), b:profiles!message_threads_b_id_fkey(id, display_name, avatar_url)'
      )
      .not('reported_by', 'is', null)
      .order('reported_at', { ascending: false })
      .limit(100)

    if (queryError) {
      setError('We could not load the shared conversations. Please try again.')
      setLoading(false)
      return
    }

    setThreads((data ?? []) as unknown as ThreadWithProfiles[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (threadId: string) => {
    if (openId === threadId) {
      setOpenId(null)
      return
    }
    setOpenId(threadId)
    setMessagesError(null)
    if (messagesByThread[threadId]) return

    setMessagesLoading(threadId)
    const { data, error: queryError } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(500)

    if (queryError) {
      setMessagesError(describeError(queryError, 'We could not load this conversation.'))
      setMessagesLoading(null)
      return
    }

    setMessagesByThread((current) => ({ ...current, [threadId]: (data ?? []) as Message[] }))
    setMessagesLoading(null)
  }

  const senderName = (thread: ThreadWithProfiles, senderId: string) => {
    if (senderId === thread.a?.id) return thread.a.display_name
    if (senderId === thread.b?.id) return thread.b.display_name
    return 'Member'
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Shared conversations"
        description="Conversations a member has shared with the admin team so someone can step in and help resolve an issue. You can read the full thread here."
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
        <LoadingBlock rows={3} />
      ) : threads.length === 0 ? (
        <EmptyBlock>No conversations have been shared for review.</EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {threads.map((thread) => {
            const open = openId === thread.id
            const messages = messagesByThread[thread.id]
            const messagesBusy = messagesLoading === thread.id
            return (
              <li
                key={thread.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={thread.a?.display_name ?? 'Member'}
                          url={thread.a?.avatar_url}
                          size="sm"
                        />
                        <span className="font-semibold text-stone-900">
                          {thread.a?.display_name ?? 'Member'}
                        </span>
                      </div>
                      <span className="text-sm text-stone-400">and</span>
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={thread.b?.display_name ?? 'Member'}
                          url={thread.b?.avatar_url}
                          size="sm"
                        />
                        <span className="font-semibold text-stone-900">
                          {thread.b?.display_name ?? 'Member'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Pill tone="amber">Shared for review</Pill>
                      {thread.reported_at && (
                        <span className="text-xs text-stone-400">
                          Shared {timeAgo(thread.reported_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggle(thread.id)}
                    className={buttonClass('secondary', 'sm')}
                  >
                    {open ? 'Hide conversation' : 'View conversation'}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 rounded-xl bg-stone-50 p-4">
                    {messagesError && <Feedback tone="error" message={messagesError} />}
                    {messagesBusy ? (
                      <LoadingBlock rows={3} />
                    ) : !messages ? null : messages.length === 0 ? (
                      <p className="text-center text-sm text-stone-500">
                        This conversation has no messages.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {messages.map((message) => (
                          <li key={message.id}>
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-sm font-semibold text-stone-800">
                                {senderName(thread, message.sender_id)}
                              </span>
                              <span className="text-xs text-stone-400">
                                {timeAgo(message.created_at)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                              {message.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
