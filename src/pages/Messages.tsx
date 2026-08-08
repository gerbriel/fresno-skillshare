import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../lib/format'
import Avatar from '../components/Avatar'
import type { Message, ProfileLite, ThreadWithProfiles } from '../lib/types'

const THREAD_SELECT =
  '*, a:profiles!message_threads_a_id_fkey(id, display_name, avatar_url), b:profiles!message_threads_b_id_fkey(id, display_name, avatar_url)'

function otherPerson(thread: ThreadWithProfiles, me: string): ProfileLite {
  return thread.a_id === me ? thread.b : thread.a
}

function threadUnread(thread: ThreadWithProfiles, me: string): boolean {
  return thread.a_id === me ? thread.a_unread : thread.b_unread
}

/** A newsletter blast lands in my inbox as a broadcast thread started by the admin. */
function isNewsletterToMe(thread: ThreadWithProfiles, me: string): boolean {
  return thread.is_broadcast && thread.a_id !== me
}

export default function Messages() {
  const { profile } = useAuth()
  const me = profile?.id ?? null
  const { threadId } = useParams<{ threadId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toUserId = searchParams.get('to')

  const [threads, setThreads] = useState<ThreadWithProfiles[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadsError, setThreadsError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  const loadThreads = useCallback(async () => {
    if (!me) return
    const { data, error } = await supabase
      .from('message_threads')
      .select(THREAD_SELECT)
      .order('last_message_at', { ascending: false })
    if (error) {
      setThreadsError(error.message)
    } else {
      setThreadsError(null)
      setThreads((data ?? []) as unknown as ThreadWithProfiles[])
    }
    setThreadsLoading(false)
  }, [me])

  useEffect(() => {
    if (!me) return
    setThreadsLoading(true)
    void loadThreads()
  }, [me, loadThreads])

  // "?to={userId}" means open the direct thread with this member, creating it if needed.
  useEffect(() => {
    if (!me || !toUserId) return
    let cancelled = false

    const openDirectThread = async () => {
      setStartError(null)
      if (toUserId === me) {
        setStartError('You cannot start a conversation with yourself.')
        return
      }

      const { data: existing, error: findError } = await supabase
        .from('message_threads')
        .select('id')
        .or(`and(a_id.eq.${me},b_id.eq.${toUserId}),and(a_id.eq.${toUserId},b_id.eq.${me})`)
        .eq('is_broadcast', false)
        .order('last_message_at', { ascending: false })
        .limit(1)
      if (cancelled) return
      if (findError) {
        setStartError(findError.message)
        return
      }

      let id: string | undefined = existing?.[0]?.id
      if (!id) {
        const { data: created, error: insertError } = await supabase
          .from('message_threads')
          .insert({ a_id: me, b_id: toUserId })
          .select('id')
          .single()
        if (cancelled) return
        if (insertError) {
          setStartError(insertError.message)
          return
        }
        id = created?.id as string | undefined
        await loadThreads()
        if (cancelled) return
      }

      if (!id) {
        setStartError('Could not open that conversation.')
        return
      }
      navigate(`/messages/${id}`, { replace: true })
    }

    void openDirectThread()
    return () => {
      cancelled = true
    }
  }, [me, toUserId, navigate, loadThreads])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === threadId) ?? null,
    [threads, threadId]
  )

  // Load the open conversation and listen for new messages in it.
  useEffect(() => {
    if (!me || !threadId) {
      setMessages([])
      setMessagesError(null)
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    setMessagesError(null)
    setSendError(null)
    setDraft('')

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        setMessagesError(error.message)
      } else {
        setMessages((data ?? []) as Message[])
      }
      setMessagesLoading(false)
    }
    void loadMessages()

    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const incoming = payload.new as Message
          setMessages((prev) =>
            prev.some((message) => message.id === incoming.id) ? prev : [...prev, incoming]
          )
          void loadThreads()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [me, threadId, loadThreads])

  // Clear my unread flag whenever the open thread is marked unread for me.
  useEffect(() => {
    if (!me || !activeThread) return
    const iAmA = activeThread.a_id === me
    if (iAmA ? !activeThread.a_unread : !activeThread.b_unread) return

    const patch = iAmA ? { a_unread: false } : { b_unread: false }
    const threadRowId = activeThread.id
    let cancelled = false

    const markRead = async () => {
      const { error } = await supabase
        .from('message_threads')
        .update(patch)
        .eq('id', threadRowId)
      if (cancelled || error) return
      setThreads((prev) =>
        prev.map((thread) => (thread.id === threadRowId ? { ...thread, ...patch } : thread))
      )
    }
    void markRead()

    return () => {
      cancelled = true
    }
  }, [me, activeThread])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, threadId, messagesLoading])

  const send = async () => {
    const body = draft.trim()
    if (!me || !threadId || !body || sending) return
    setSending(true)
    setSendError(null)
    setDraft('')

    const { data, error } = await supabase
      .from('messages')
      .insert({ thread_id: threadId, sender_id: me, body })
      .select('*')
      .single()
    setSending(false)

    if (error) {
      setSendError(error.message)
      setDraft(body)
      return
    }
    const saved = data as Message
    setMessages((prev) =>
      prev.some((message) => message.id === saved.id) ? prev : [...prev, saved]
    )
    void loadThreads()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  if (!me) {
    return <p className="py-10 text-center text-sm text-stone-500">Loading your inbox...</p>
  }

  const paneClass =
    'h-[70vh] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm'

  return (
    <div className="space-y-3">
      {startError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {startError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {/* thread list */}
        <aside className={`${paneClass} ${threadId ? 'hidden md:flex' : 'flex'}`}>
          <div className="border-b border-stone-200 px-4 py-3">
            <h1 className="text-base font-semibold text-stone-900">Messages</h1>
            <p className="text-xs text-stone-500">Your conversations and co-op news</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              <p className="px-4 py-6 text-sm text-stone-500">Loading conversations...</p>
            ) : threadsError ? (
              <p className="px-4 py-6 text-sm text-red-600">{threadsError}</p>
            ) : threads.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-stone-700">No conversations yet</p>
                <p className="mt-1 text-xs text-stone-500">
                  Start a conversation from a member's profile or a listing.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {threads.map((thread) => {
                  const other = otherPerson(thread, me)
                  const unread = threadUnread(thread, me)
                  const newsletter = isNewsletterToMe(thread, me)
                  const selected = thread.id === threadId
                  return (
                    <li key={thread.id}>
                      <Link
                        to={`/messages/${thread.id}`}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                          selected ? 'bg-emerald-50' : 'hover:bg-stone-50'
                        }`}
                      >
                        <Avatar name={other.display_name} url={other.avatar_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`truncate text-sm ${
                                unread ? 'font-bold text-stone-900' : 'font-medium text-stone-700'
                              }`}
                            >
                              {newsletter ? thread.subject ?? 'Co-op news' : other.display_name}
                            </span>
                            {newsletter && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Newsletter
                              </span>
                            )}
                            {unread && (
                              <span
                                className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                                aria-label="Unread"
                              />
                            )}
                          </div>
                          <p
                            className={`truncate text-xs ${
                              unread ? 'font-semibold text-stone-700' : 'text-stone-500'
                            }`}
                          >
                            {thread.last_message_preview ?? 'No messages yet'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-stone-400">
                            {timeAgo(thread.last_message_at)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* conversation */}
        <section className={`md:col-span-2 ${paneClass} ${threadId ? 'flex' : 'hidden md:flex'}`}>
          {!threadId ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-medium text-stone-700">No conversation selected</p>
                <p className="mt-1 text-xs text-stone-500">
                  Pick a thread on the left to read and reply.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate('/messages')}
                  className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 md:hidden"
                >
                  Back
                </button>

                {activeThread ? (
                  <>
                    <Link
                      to={`/u/${otherPerson(activeThread, me).id}`}
                      className="flex min-w-0 items-center gap-2 text-stone-800 hover:text-emerald-700"
                    >
                      <Avatar
                        name={otherPerson(activeThread, me).display_name}
                        url={otherPerson(activeThread, me).avatar_url}
                        size="sm"
                      />
                      <span className="truncate text-sm font-semibold">
                        {otherPerson(activeThread, me).display_name}
                      </span>
                    </Link>
                    {activeThread.is_broadcast && (
                      <span className="min-w-0 truncate text-xs text-stone-500">
                        {activeThread.subject ?? 'Co-op news'}
                      </span>
                    )}
                    {isNewsletterToMe(activeThread, me) && (
                      <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Newsletter
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-stone-500">
                    {threadsLoading ? 'Loading conversation...' : 'Conversation not found'}
                  </span>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-stone-50 px-4 py-4">
                {messagesLoading ? (
                  <p className="text-sm text-stone-500">Loading messages...</p>
                ) : messagesError ? (
                  <p className="text-sm text-red-600">{messagesError}</p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-stone-500">
                    No messages yet. Say hello.
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_id === me
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                            mine
                              ? 'bg-emerald-600 text-white'
                              : 'border border-stone-200 bg-white text-stone-800'
                          }`}
                        >
                          <p>{message.body}</p>
                          <p
                            className={`mt-1 text-[10px] ${
                              mine ? 'text-emerald-100' : 'text-stone-400'
                            }`}
                          >
                            {timeAgo(message.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="border-t border-stone-200 p-3">
                {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="Write a message. Enter to send, Shift plus Enter for a new line."
                    className="flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={sending || !draft.trim()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? 'Sending' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
          </section>
      </div>
    </div>
  )
}
