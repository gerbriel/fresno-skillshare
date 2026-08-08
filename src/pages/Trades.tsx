import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Medal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { describeError } from '../lib/errors'
import { formatDate, timeAgo } from '../lib/format'
import { cleanText, LIMITS } from '../lib/validate'
import Avatar from '../components/Avatar'
import type { ProfileLite, TradeStatus, TradeTask, TradeWithProfiles } from '../lib/types'

const TRADE_SELECT =
  '*, proposer:profiles!trades_proposer_id_fkey(id, display_name, avatar_url), partner:profiles!trades_partner_id_fkey(id, display_name, avatar_url)'

const statusPill: Record<TradeStatus, string> = {
  proposed: 'bg-amber-100 text-amber-800',
  accepted: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-stone-200 text-stone-700',
}

const statusLabel: Record<TradeStatus, string> = {
  proposed: 'Proposed',
  accepted: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
}

const sections: { status: TradeStatus; heading: string }[] = [
  { status: 'proposed', heading: 'Waiting on response' },
  { status: 'accepted', heading: 'In progress' },
  { status: 'completed', heading: 'Completed' },
  { status: 'declined', heading: 'Declined' },
]

const smallButton =
  'rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

export default function Trades() {
  const { profile } = useAuth()
  const me = profile?.id ?? null
  const [searchParams] = useSearchParams()
  const withUserId = searchParams.get('with')

  const [trades, setTrades] = useState<TradeWithProfiles[]>([])
  const [tasks, setTasks] = useState<TradeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [members, setMembers] = useState<ProfileLite[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [partnerId, setPartnerId] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [taskDraft, setTaskDraft] = useState('')
  const [taskList, setTaskList] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [busyTradeId, setBusyTradeId] = useState<string | null>(null)
  const [tradeErrors, setTradeErrors] = useState<Record<string, string>>({})
  const [tradeNotes, setTradeNotes] = useState<Record<string, string>>({})

  const loadTrades = useCallback(async () => {
    if (!me) return
    const { data, error } = await supabase
      .from('trades')
      .select(TRADE_SELECT)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setLoadError(describeError(error, 'We could not load your trades.'))
      setLoading(false)
      return
    }

    const rows = (data ?? []) as unknown as TradeWithProfiles[]
    setTrades(rows)
    setLoadError(null)

    if (rows.length === 0) {
      setTasks([])
      setLoading(false)
      return
    }

    const { data: taskRows, error: taskError } = await supabase
      .from('trade_tasks')
      .select('*')
      .in(
        'trade_id',
        rows.map((trade) => trade.id)
      )
      .order('created_at', { ascending: true })

    if (taskError) {
      setLoadError(describeError(taskError, 'We could not load the trade tasks.'))
    } else {
      setTasks((taskRows ?? []) as TradeTask[])
    }
    setLoading(false)
  }, [me])

  useEffect(() => {
    if (!me) return
    setLoading(true)
    void loadTrades()
  }, [me, loadTrades])

  useEffect(() => {
    if (!me) return
    let cancelled = false
    const loadMembers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('status', 'active')
        .neq('id', me)
        .order('display_name', { ascending: true })
      if (cancelled) return
      if (error) {
        setMembersError(describeError(error, 'We could not load the member list.'))
      } else {
        setMembersError(null)
        setMembers((data ?? []) as ProfileLite[])
      }
    }
    void loadMembers()
    return () => {
      cancelled = true
    }
  }, [me])

  // "?with={userId}" opens the proposal form already pointed at that member.
  useEffect(() => {
    if (!withUserId) return
    setPartnerId(withUserId)
    setFormOpen(true)
  }, [withUserId])

  const tasksByTrade = useMemo(() => {
    const map: Record<string, TradeTask[]> = {}
    for (const task of tasks) {
      const list = map[task.trade_id]
      if (list) list.push(task)
      else map[task.trade_id] = [task]
    }
    return map
  }, [tasks])

  const addTask = () => {
    const value = cleanText(taskDraft, LIMITS.tradeTaskTitle)
    if (!value) return
    if (taskList.length >= LIMITS.tradeTaskCount) {
      setFormError(`A trade can have at most ${LIMITS.tradeTaskCount} tasks.`)
      return
    }
    setTaskList((prev) => [...prev, value])
    setTaskDraft('')
  }

  const resetForm = () => {
    setPartnerId('')
    setTitle('')
    setNotes('')
    setTaskDraft('')
    setTaskList([])
    setFormError(null)
  }

  const submitTrade = async () => {
    if (!me) return
    const trimmedTitle = title.trim()
    if (!partnerId) {
      setFormError('Pick a trade partner.')
      return
    }
    if (!trimmedTitle) {
      setFormError('Give the trade a title. This becomes the badge label.')
      return
    }
    if (taskList.length === 0) {
      setFormError('Add at least one task.')
      return
    }

    setSubmitting(true)
    setFormError(null)

    // One transaction server-side: the trade and its tasks land together
    // or not at all.
    const { error } = await supabase.rpc('create_trade_with_tasks', {
      p_partner_id: partnerId,
      p_title: trimmedTitle,
      p_notes: notes.trim() || null,
      p_tasks: taskList,
    })
    setSubmitting(false)

    if (error) {
      setFormError(describeError(error, 'Could not create that trade.'))
      return
    }

    resetForm()
    setFormOpen(false)
    await loadTrades()
  }

  const setTradeError = (tradeId: string, message: string | null) => {
    setTradeErrors((prev) => {
      const next = { ...prev }
      if (message) next[tradeId] = message
      else delete next[tradeId]
      return next
    })
  }

  const toggleTask = async (task: TradeTask) => {
    const nextDone = !task.done
    const completedAt = nextDone ? new Date().toISOString() : null
    setTasks((prev) =>
      prev.map((row) =>
        row.id === task.id ? { ...row, done: nextDone, completed_at: completedAt } : row
      )
    )
    const { error } = await supabase
      .from('trade_tasks')
      .update({ done: nextDone, completed_at: completedAt })
      .eq('id', task.id)
    if (error) {
      setTradeError(task.trade_id, describeError(error, 'Could not update that task.'))
      setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)))
    } else {
      setTradeError(task.trade_id, null)
    }
  }

  const changeStatus = async (trade: TradeWithProfiles, status: TradeStatus) => {
    setBusyTradeId(trade.id)
    setTradeError(trade.id, null)
    const { error } = await supabase.from('trades').update({ status }).eq('id', trade.id)
    setBusyTradeId(null)
    if (error) {
      setTradeError(trade.id, describeError(error, 'Could not update the trade.'))
      return
    }
    await loadTrades()
  }

  const cancelTrade = async (trade: TradeWithProfiles) => {
    if (!window.confirm('Cancel this trade proposal?')) return
    setBusyTradeId(trade.id)
    setTradeError(trade.id, null)
    const { error } = await supabase.from('trades').delete().eq('id', trade.id)
    setBusyTradeId(null)
    if (error) {
      setTradeError(trade.id, describeError(error, 'Could not cancel the trade.'))
      return
    }
    await loadTrades()
  }

  const confirmCompletion = async (trade: TradeWithProfiles) => {
    setBusyTradeId(trade.id)
    setTradeError(trade.id, null)
    const { error } = await supabase.rpc('confirm_trade_completion', { p_trade_id: trade.id })
    setBusyTradeId(null)
    if (error) {
      setTradeError(trade.id, describeError(error, 'Could not confirm completion.'))
      return
    }
    setTradeNotes((prev) => ({
      ...prev,
      [trade.id]: `Trade completed. ${trade.proposer.display_name} earned the ${trade.title} badge.`,
    }))
    await loadTrades()
  }

  if (!me) {
    return <p className="py-10 text-center text-sm text-stone-500">Loading your trades...</p>
  }

  const renderTrade = (trade: TradeWithProfiles) => {
    const iAmProposer = trade.proposer_id === me
    const other = iAmProposer ? trade.partner : trade.proposer
    const tradeTasks = tasksByTrade[trade.id] ?? []
    const doneCount = tradeTasks.filter((task) => task.done).length
    const allDone = tradeTasks.length > 0 && doneCount === tradeTasks.length
    const canToggle = trade.status === 'accepted'
    const busy = busyTradeId === trade.id
    const errorMessage = tradeErrors[trade.id]
    const successNote = tradeNotes[trade.id]

    return (
      <article
        key={trade.id}
        className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-stone-900">
              {trade.status === 'completed' && (
                <Medal className="mr-1 inline h-4 w-4 text-amber-600" aria-hidden />
              )}
              {trade.title}
            </h3>
            <Link
              to={`/u/${other.id}`}
              className="mt-1.5 flex items-center gap-2 text-sm text-stone-600 hover:text-emerald-700"
            >
              <Avatar name={other.display_name} url={other.avatar_url} size="sm" />
              <span>with {other.display_name}</span>
            </Link>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill[trade.status]}`}
          >
            {statusLabel[trade.status]}
          </span>
        </div>

        {trade.notes && <p className="text-sm whitespace-pre-line text-stone-600">{trade.notes}</p>}

        <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
              Tasks
            </span>
            <span className="text-xs text-stone-500">
              {doneCount} of {tradeTasks.length} tasks done
            </span>
          </div>
          {tradeTasks.length === 0 ? (
            <p className="text-xs text-stone-500">No tasks on this trade.</p>
          ) : (
            <ul className="space-y-1.5">
              {tradeTasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={task.done}
                    disabled={!canToggle}
                    onChange={() => void toggleTask(task)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-emerald-600 accent-emerald-600 disabled:cursor-not-allowed"
                  />
                  <span
                    className={`text-sm ${
                      task.done ? 'text-stone-400 line-through' : 'text-stone-700'
                    }`}
                  >
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        {successNote && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {successNote}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <span className="text-xs text-stone-400">
            {trade.status === 'completed' && trade.completed_at
              ? `Completed ${formatDate(trade.completed_at)}`
              : timeAgo(trade.created_at)}
          </span>

          <span className="ml-auto flex flex-wrap gap-2">
            {!iAmProposer && trade.status === 'proposed' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus(trade, 'accepted')}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus(trade, 'declined')}
                  className={smallButton}
                >
                  Decline
                </button>
              </>
            )}

            {iAmProposer && trade.status === 'proposed' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelTrade(trade)}
                className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            )}

            {!iAmProposer && trade.status === 'accepted' && allDone && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmCompletion(trade)}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm completion
              </button>
            )}
          </span>
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Trades</h1>
          <p className="text-sm text-stone-600">Track what you owe and what you are owed.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormOpen((open) => !open)
            setFormError(null)
          }}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          {formOpen ? 'Close form' : 'Propose a trade'}
        </button>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Propose a trade, check off the tasks as you go, your partner confirms completion, you earn a
        badge.
      </div>

      {formOpen && (
        <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-stone-900">New trade</h2>

          <div>
            <label htmlFor="trade-partner" className="mb-1 block text-sm font-medium text-stone-700">
              Trade partner
            </label>
            <select
              id="trade-partner"
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Pick a member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                </option>
              ))}
            </select>
            {membersError && <p className="mt-1 text-xs text-red-600">{membersError}</p>}
          </div>

          <div>
            <label htmlFor="trade-title" className="mb-1 block text-sm font-medium text-stone-700">
              Title
            </label>
            <input
              id="trade-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={LIMITS.tradeTitle}
              placeholder="Garden bed build for guitar lessons"
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1 text-xs text-stone-500">
              This becomes the badge label when the trade is completed.
            </p>
          </div>

          <div>
            <label htmlFor="trade-notes" className="mb-1 block text-sm font-medium text-stone-700">
              Notes
            </label>
            <textarea
              id="trade-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={LIMITS.tradeNotes}
              placeholder="Anything your partner should know about timing, materials, or location."
              className="w-full resize-y rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-stone-700">Tasks</span>
            <div className="flex gap-2">
              <input
                value={taskDraft}
                onChange={(event) => setTaskDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTask()
                  }
                }}
                maxLength={LIMITS.tradeTaskTitle}
                placeholder="Add a step, for example: buy lumber"
                className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={addTask}
                disabled={!taskDraft.trim()}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add task
              </button>
            </div>

            {taskList.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {taskList.map((taskTitle, index) => (
                  <li
                    key={`${taskTitle}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-1.5 text-sm text-stone-700"
                  >
                    <span className="flex-1">{taskTitle}</span>
                    <button
                      type="button"
                      onClick={() => setTaskList((prev) => prev.filter((_, i) => i !== index))}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submitTrade()}
              disabled={submitting}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Sending proposal' : 'Send proposal'}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm()
                setFormOpen(false)
              }}
              disabled={submitting}
              className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-stone-500">Loading trades...</p>
      ) : loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {loadError}
        </p>
      ) : trades.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-stone-700">No trades yet</p>
          <p className="mt-1 text-sm text-stone-500">
            Propose one to a neighbor and start building your badge shelf.
          </p>
        </div>
      ) : (
        sections.map((section) => {
          const rows = trades.filter((trade) => trade.status === section.status)
          if (rows.length === 0) return null
          return (
            <section key={section.status} className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
                {section.heading} ({rows.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2">{rows.map(renderTrade)}</div>
            </section>
          )
        })
      )}
    </div>
  )
}
