import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, SquarePen, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { describeError } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { MESSAGES_PAGE_SIZE } from '../lib/queries'
import { cleanText, LIMITS } from '../lib/validate'
import { useLive } from '../lib/useLive'
import Avatar from '../components/Avatar'
import type { Message, ProfileLite, Role, ThreadWithProfiles } from '../lib/types'

const THREAD_SELECT =
  '*, a:profiles!message_threads_a_id_fkey(id, display_name, avatar_url), b:profiles!message_threads_b_id_fkey(id, display_name, avatar_url)'

/** A message shown in the pane; pending/failed exist only client-side. */
interface LocalMessage extends Message {
  pending?: boolean
  failed?: boolean
}

/** ProfileLite plus the role, so the picker can group admins separately. */
interface MemberRow extends ProfileLite {
  role: Role
}

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

function MemberPickerRow(props: { member: MemberRow; onSelect: (userId: string) => void }) {
  const { member, onSelect } = props
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(member.id)}
        className="flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-left transition-colors hover:bg-emerald-50"
      >
        <Avatar name={member.display_name} url={member.avatar_url} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
          {member.display_name}
        </span>
        {member.role === 'admin' && (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            Admin
          </span>
        )}
      </button>
    </li>
  )
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

  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [hasEarlier, setHasEarlier] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Members I have blocked. Only my own direction is visible (RLS hides the rest).
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [blockBusy, setBlockBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [startNonce, setStartNonce] = useState(0)
  const [memberQuery, setMemberQuery] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const membersLoadedRef = useRef(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Prepending history must not yank the view back to the bottom.
  const stickToBottomRef = useRef(true)

  const loadThreads = useCallback(async () => {
    if (!me) return
    const { data, error } = await supabase
      .from('message_threads')
      .select(THREAD_SELECT)
      .order('last_message_at', { ascending: false })
      .limit(100)
    if (error) {
      setThreadsError(describeError(error, 'We could not load your conversations.'))
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

  // A conversation someone else starts with me shows up without a refresh.
  useLive('messages-threads', me ? [{ table: 'message_threads' }] : [], loadThreads)

  // Who I have blocked, loaded once so the composer and header can react to it.
  useEffect(() => {
    if (!me) return
    let cancelled = false
    const loadBlocks = async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', me)
      if (cancelled || error) return
      setBlockedIds(new Set((data ?? []).map((row) => row.blocked_id as string)))
    }
    void loadBlocks()
    return () => {
      cancelled = true
    }
  }, [me])

  // The directory is fetched the first time the picker opens, then filtered
  // client-side so typing costs no queries.
  useEffect(() => {
    if (!me || !pickerOpen || membersLoadedRef.current) return
    let cancelled = false
    setMembersLoading(true)
    setMembersError(null)

    const loadMembers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .eq('status', 'active')
        .neq('id', me)
        .order('display_name')
      if (cancelled) return
      if (error) {
        setMembersError(describeError(error, 'We could not load the member directory.'))
      } else {
        membersLoadedRef.current = true
        setMembers((data ?? []) as MemberRow[])
      }
      setMembersLoading(false)
    }
    void loadMembers()

    return () => {
      cancelled = true
    }
  }, [me, pickerOpen])

  // "?to={userId}" means open the direct thread with this member, creating it if needed.
  // startNonce is a dependency so re-picking the same member after a failure retries,
  // even though the search param has not changed.
  useEffect(() => {
    if (!me || !toUserId) {
      setStartError(null)
      return
    }
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
        setStartError(describeError(findError, 'Could not open that conversation.'))
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
          setStartError(describeError(insertError, 'Could not start that conversation.'))
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
  }, [me, toUserId, startNonce, navigate, loadThreads])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === threadId) ?? null,
    [threads, threadId]
  )

  // The other member of a direct thread (never for a broadcast), plus whether I've blocked them.
  const activeOther = useMemo(
    () => (me && activeThread && !activeThread.is_broadcast ? otherPerson(activeThread, me) : null),
    [me, activeThread]
  )
  const otherBlocked = activeOther ? blockedIds.has(activeOther.id) : false

  const matchedMembers = useMemo(() => {
    const term = memberQuery.trim().toLowerCase()
    const rows = term
      ? members.filter((member) => member.display_name.toLowerCase().includes(term))
      : members
    return {
      admins: rows.filter((member) => member.role === 'admin'),
      others: rows.filter((member) => member.role !== 'admin'),
    }
  }, [members, memberQuery])

  // Hand off to the "?to=" effect above rather than repeating find-or-create here.
  const startConversation = (userId: string) => {
    setPickerOpen(false)
    setMemberQuery('')
    setStartNonce((nonce) => nonce + 1)
    navigate(`/messages?to=${userId}`)
  }

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
      // Newest window only; older history loads on demand.
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE)
      if (cancelled) return
      if (error) {
        setMessagesError(describeError(error, 'We could not load this conversation.'))
      } else {
        const rows = ((data ?? []) as Message[]).reverse()
        stickToBottomRef.current = true
        setMessages(rows)
        setHasEarlier(rows.length === MESSAGES_PAGE_SIZE)
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
    if (!stickToBottomRef.current) {
      stickToBottomRef.current = true
      return
    }
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, threadId, messagesLoading])

  const loadEarlier = async () => {
    const oldest = messages[0]
    if (!threadId || !oldest || loadingEarlier) return
    setLoadingEarlier(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE)
    if (error) {
      setMessagesError(describeError(error, 'We could not load earlier messages.'))
    } else {
      const rows = ((data ?? []) as Message[]).reverse()
      stickToBottomRef.current = false
      setMessages((prev) => [...rows, ...prev])
      setHasEarlier(rows.length === MESSAGES_PAGE_SIZE)
    }
    setLoadingEarlier(false)
  }

  // Optimistic send: the message appears immediately, then is confirmed
  // by the insert (or marked failed with a retry affordance).
  const send = async (bodyOverride?: string, retryId?: string) => {
    const body = cleanText(bodyOverride ?? draft, LIMITS.messageBody)
    if (!me || !threadId || !body || sending) return
    setSending(true)
    setSendError(null)
    if (!bodyOverride) setDraft('')

    const tempId = `pending-${crypto.randomUUID()}`
    const optimistic: LocalMessage = {
      id: tempId,
      thread_id: threadId,
      sender_id: me,
      body,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setMessages((prev) => [...prev.filter((message) => message.id !== retryId), optimistic])

    const { data, error } = await supabase
      .from('messages')
      .insert({ thread_id: threadId, sender_id: me, body })
      .select('*')
      .single()
    setSending(false)

    if (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === tempId ? { ...message, pending: false, failed: true } : message
        )
      )
      // A block in either direction is enforced by RLS (code 42501). If they
      // blocked me, show a friendly line rather than a raw permission error.
      const blocked =
        (error as { code?: string }).code === '42501' ||
        /row-level security|policy/i.test((error as { message?: string }).message ?? '')
      setSendError(
        blocked
          ? 'You can no longer message this member.'
          : describeError(error, 'Your message was not sent.')
      )
      return
    }
    const saved = data as Message
    setMessages((prev) => {
      const withoutTemp = prev.filter((message) => message.id !== tempId)
      return withoutTemp.some((message) => message.id === saved.id)
        ? withoutTemp
        : [...withoutTemp, saved]
    })
    void loadThreads()
  }

  // Block or unblock the other member. Blocking stops messages in both
  // directions; the confirm guards against an accidental block.
  const toggleBlock = async () => {
    if (!me || !activeOther || blockBusy) return
    const otherId = activeOther.id
    const alreadyBlocked = blockedIds.has(otherId)
    if (
      !alreadyBlocked &&
      !window.confirm(
        `Block ${activeOther.display_name}? You will not be able to message each other until you unblock them.`
      )
    ) {
      return
    }
    setBlockBusy(true)
    setSendError(null)
    if (alreadyBlocked) {
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', me)
        .eq('blocked_id', otherId)
      if (error) {
        setSendError(describeError(error, 'We could not unblock this member.'))
      } else {
        setBlockedIds((prev) => {
          const next = new Set(prev)
          next.delete(otherId)
          return next
        })
      }
    } else {
      const { error } = await supabase.from('blocks').insert({ blocker_id: me, blocked_id: otherId })
      if (error) {
        setSendError(describeError(error, 'We could not block this member.'))
      } else {
        setBlockedIds((prev) => new Set(prev).add(otherId))
      }
    }
    setBlockBusy(false)
  }

  // Share this conversation with admins for review, or undo that sharing.
  const toggleReport = async () => {
    if (!me || !activeThread || reportBusy) return
    const threadRowId = activeThread.id
    const share = !activeThread.reported_by
    setReportBusy(true)
    setSendError(null)
    const { error } = await supabase.rpc('report_thread', {
      p_thread_id: threadRowId,
      p_report: share,
    })
    if (error) {
      setSendError(describeError(error, 'We could not update sharing for this conversation.'))
    } else {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadRowId
            ? {
                ...thread,
                reported_by: share ? me : null,
                reported_at: share ? new Date().toISOString() : null,
              }
            : thread
        )
      )
    }
    setReportBusy(false)
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
          <div className="flex items-start gap-2 border-b border-stone-200 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-stone-900">Messages</h1>
              <p className="text-xs text-stone-500">Your conversations and co-op news</p>
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              aria-expanded={pickerOpen}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              {pickerOpen ? <X className="h-3.5 w-3.5" /> : <SquarePen className="h-3.5 w-3.5" />}
              {pickerOpen ? 'Close' : 'New message'}
            </button>
          </div>

          {pickerOpen && (
            <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-stone-400" />
                <input
                  type="search"
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="Search members by name"
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pr-3 pl-8 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto">
                {membersLoading ? (
                  <p className="py-4 text-center text-xs text-stone-500">Loading members...</p>
                ) : membersError ? (
                  <p className="py-4 text-center text-xs text-red-600">{membersError}</p>
                ) : matchedMembers.admins.length === 0 && matchedMembers.others.length === 0 ? (
                  <p className="py-4 text-center text-xs text-stone-500">
                    {members.length === 0
                      ? 'No other active members yet.'
                      : 'No members match that name.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {matchedMembers.admins.length > 0 && (
                      <div>
                        <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
                          Co-op admins
                        </p>
                        <ul className="space-y-1">
                          {matchedMembers.admins.map((member) => (
                            <MemberPickerRow
                              key={member.id}
                              member={member}
                              onSelect={startConversation}
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                    {matchedMembers.others.length > 0 && (
                      <div>
                        <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
                          Members
                        </p>
                        <ul className="space-y-1">
                          {matchedMembers.others.map((member) => (
                            <MemberPickerRow
                              key={member.id}
                              member={member}
                              onSelect={startConversation}
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              <p className="px-4 py-6 text-sm text-stone-500">Loading conversations...</p>
            ) : threadsError ? (
              <p className="px-4 py-6 text-sm text-red-600">{threadsError}</p>
            ) : threads.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-stone-700">No conversations yet</p>
                <p className="mt-1 text-xs text-stone-500">
                  Use New message to reach any member or a co-op admin.
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

              {activeThread && !activeThread.is_broadcast && (
                <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => void toggleBlock()}
                    disabled={blockBusy}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      otherBlocked
                        ? 'border-stone-200 text-stone-600 hover:bg-white'
                        : 'border-red-200 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {otherBlocked ? 'Unblock' : 'Block'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleReport()}
                    disabled={reportBusy}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      activeThread.reported_by
                        ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'border-stone-200 text-stone-600 hover:bg-white'
                    }`}
                  >
                    {activeThread.reported_by
                      ? 'Shared with admin — Undo'
                      : 'Share with admin for review'}
                  </button>
                  <p className="w-full text-[11px] text-stone-400 sm:ml-auto sm:w-auto">
                    Sharing lets an admin read this conversation to help with a problem.
                  </p>
                </div>
              )}

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
                  <>
                    {hasEarlier && (
                      <div className="flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => void loadEarlier()}
                          disabled={loadingEarlier}
                          className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingEarlier ? 'Loading...' : 'Load earlier messages'}
                        </button>
                      </div>
                    )}
                    {messages.map((message) => {
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
                            } ${message.pending ? 'opacity-60' : ''} ${
                              message.failed ? 'bg-red-600' : ''
                            }`}
                          >
                            <p>{message.body}</p>
                            {message.failed ? (
                              <button
                                type="button"
                                onClick={() => void send(message.body, message.id)}
                                className="mt-1 text-[10px] font-semibold text-red-100 underline"
                              >
                                Not sent. Tap to retry
                              </button>
                            ) : (
                              <p
                                className={`mt-1 text-[10px] ${
                                  mine ? 'text-emerald-100' : 'text-stone-400'
                                }`}
                              >
                                {message.pending ? 'Sending...' : timeAgo(message.created_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              <div className="border-t border-stone-200 p-3">
                {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
                {otherBlocked ? (
                  <p className="rounded-xl bg-stone-50 px-3 py-2 text-center text-xs text-stone-500">
                    You blocked this member. Unblock to message them.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={2}
                      maxLength={LIMITS.messageBody}
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
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
