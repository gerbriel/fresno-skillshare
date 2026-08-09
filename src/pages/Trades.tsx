import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Medal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { describeError } from '../lib/errors'
import { formatDate, timeAgo } from '../lib/format'
import { cleanText, LIMITS } from '../lib/validate'
import { useLive } from '../lib/useLive'
import Avatar from '../components/Avatar'
import type { ProfileLite, TradeClaimWithProfile, TradeStatus, TradeWithProfiles } from '../lib/types'

const TRADE_SELECT =
  '*, proposer:profiles!trades_proposer_id_fkey(id, display_name, avatar_url), partner:profiles!trades_partner_id_fkey(id, display_name, avatar_url)'

const statusPill: Record<TradeStatus, string> = {
  open: 'bg-violet-100 text-violet-800',
  proposed: 'bg-amber-100 text-amber-800',
  accepted: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-stone-200 text-stone-700',
}

const statusLabel: Record<TradeStatus, string> = {
  open: 'Open to anyone',
  proposed: 'Proposed',
  accepted: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
}

const sections: { status: TradeStatus; heading: string }[] = [
  { status: 'open', heading: 'Open to anyone' },
  { status: 'proposed', heading: 'Waiting on response' },
  { status: 'accepted', heading: 'In progress' },
  { status: 'completed', heading: 'Completed' },
  { status: 'declined', heading: 'Declined' },
]

/** Sentinel for "post this to the open board" in the partner dropdown. */
const ANYONE = 'anyone'

const smallButton =
  'rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

export default function Trades() {
  const { profile, isAdmin } = useAuth()
  const me = profile?.id ?? null
  const [searchParams] = useSearchParams()
  const withUserId = searchParams.get('with')

  const [trades, setTrades] = useState<TradeWithProfiles[]>([])
  const [claims, setClaims] = useState<TradeClaimWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [members, setMembers] = useState<ProfileLite[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [partnerId, setPartnerId] = useState('')
  const [title, setTitle] = useState('')
  const [offering, setOffering] = useState('')
  const [needing, setNeeding] = useState('')
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

    setTrades((data ?? []) as unknown as TradeWithProfiles[])

    // RLS scopes this to my own claims plus claims on trades I posted.
    const { data: claimRows } = await supabase
      .from('trade_claims')
      .select('*, claimant:profiles!trade_claims_claimant_id_fkey(id, display_name, avatar_url)')
      .order('created_at', { ascending: true })
    setClaims((claimRows ?? []) as unknown as TradeClaimWithProfile[])

    setLoadError(null)
    setLoading(false)
  }, [me])

  useEffect(() => {
    if (!me) return
    setLoading(true)
    void loadTrades()
  }, [me, loadTrades])

  // The open board is shared: a claim by someone else updates every
  // member's view immediately.
  useLive('trades-live', me ? [{ table: 'trades' }, { table: 'trade_claims' }] : [], loadTrades)

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

  const resetForm = () => {
    setPartnerId('')
    setTitle('')
    setOffering('')
    setNeeding('')
    setFormError(null)
  }

  const submitTrade = async () => {
    if (!me) return
    const cleanTitle = cleanText(title, LIMITS.tradeTitle)
    const cleanOffering = cleanText(offering, LIMITS.tradeOffering)
    const cleanNeeding = cleanText(needing, LIMITS.tradeNeeding)

    if (!partnerId) {
      setFormError('Pick a trade partner, or open it up to anyone.')
      return
    }
    if (!cleanTitle) {
      setFormError('Give the trade a title. This becomes the badge label.')
      return
    }
    if (!cleanOffering) {
      setFormError('Say what you are offering.')
      return
    }
    if (!cleanNeeding) {
      setFormError('Say what you need in return.')
      return
    }

    setSubmitting(true)
    setFormError(null)

    // A null partner posts it to the open board instead of a direct proposal.
    const { error } = await supabase.rpc('create_trade', {
      p_partner_id: partnerId === ANYONE ? null : partnerId,
      p_title: cleanTitle,
      p_offering: cleanOffering,
      p_needing: cleanNeeding,
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

  const claimsByTrade = useMemo(() => {
    const map: Record<string, TradeClaimWithProfile[]> = {}
    for (const claim of claims) {
      const list = map[claim.trade_id]
      if (list) list.push(claim)
      else map[claim.trade_id] = [claim]
    }
    return map
  }, [claims])

  const setTradeError = (tradeId: string, message: string | null) => {
    setTradeErrors((prev) => {
      const next = { ...prev }
      if (message) next[tradeId] = message
      else delete next[tradeId]
      return next
    })
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
    const prompt =
      trade.status === 'open'
        ? 'Take this down from the open board?'
        : 'Cancel this trade proposal?'
    if (!window.confirm(prompt)) return
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

  const claimTrade = async (trade: TradeWithProfiles) => {
    setBusyTradeId(trade.id)
    setTradeError(trade.id, null)
    const { error } = await supabase.rpc('claim_open_trade', { p_trade_id: trade.id })
    setBusyTradeId(null)
    if (error) {
      setTradeError(trade.id, describeError(error, 'Could not claim that trade.'))
      await loadTrades()
      return
    }
    setTradeNotes((prev) => ({
      ...prev,
      [trade.id]: `You claimed this trade. It stays open until ${trade.proposer.display_name} picks a claimant - you will see it move to In progress if that is you.`,
    }))
    await loadTrades()
  }

  const withdrawClaim = async (trade: TradeWithProfiles) => {
    if (!me) return
    setBusyTradeId(trade.id)
    setTradeError(trade.id, null)
    const { error } = await supabase
      .from('trade_claims')
      .delete()
      .eq('trade_id', trade.id)
      .eq('claimant_id', me)
    setBusyTradeId(null)
    if (error) {
      setTradeError(trade.id, describeError(error, 'Could not withdraw your claim.'))
      return
    }
    setTradeNotes((prev) => {
      const next = { ...prev }
      delete next[trade.id]
      return next
    })
    await loadTrades()
  }

  const chooseClaimant = async (trade: TradeWithProfiles, claimant: ProfileLite) => {
    setBusyTradeId(trade.id)
    setTradeError(trade.id, null)
    const { error } = await supabase.rpc('select_trade_claimant', {
      p_trade_id: trade.id,
      p_claimant_id: claimant.id,
    })
    setBusyTradeId(null)
    if (error) {
      setTradeError(trade.id, describeError(error, 'Could not choose that claimant.'))
      return
    }
    setTradeNotes((prev) => ({
      ...prev,
      [trade.id]: `${claimant.display_name} is now your trade partner. Mark the trade completed once the work is done.`,
    }))
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
      [trade.id]: `Trade completed. Both members earned the ${trade.title} badge.`,
    }))
    await loadTrades()
  }

  if (!me) {
    return <p className="py-10 text-center text-sm text-stone-500">Loading your trades...</p>
  }

  const renderTrade = (trade: TradeWithProfiles) => {
    const iAmProposer = trade.proposer_id === me
    // An unclaimed open trade has no counterpart yet.
    const other = iAmProposer ? trade.partner : trade.proposer
    const busy = busyTradeId === trade.id
    const errorMessage = tradeErrors[trade.id]
    const successNote = tradeNotes[trade.id]
    const isOpen = trade.status === 'open'
    const tradeClaims = claimsByTrade[trade.id] ?? []
    const myClaim = me ? tradeClaims.find((claim) => claim.claimant_id === me) : undefined
    // Direct trades: either participant completes. Open-board trades:
    // only the poster. Admins always can.
    const canConfirm =
      trade.status === 'accepted' &&
      (isAdmin || (trade.was_open ? iAmProposer : iAmProposer || trade.partner_id === me))

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
            {other ? (
              <Link
                to={`/u/${other.id}`}
                className="mt-1.5 flex items-center gap-2 text-sm text-stone-600 hover:text-emerald-700"
              >
                <Avatar name={other.display_name} url={other.avatar_url} size="sm" />
                <span>
                  {isOpen ? 'Posted by' : 'with'} {other.display_name}
                </span>
              </Link>
            ) : (
              <p className="mt-1.5 text-sm text-stone-500">
                Waiting for a neighbor to claim this
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill[trade.status]}`}
          >
            {statusLabel[trade.status]}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <span className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
              Offering
            </span>
            <p className="mt-1 text-sm whitespace-pre-line text-stone-700">{trade.offering}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <span className="text-xs font-semibold tracking-wide text-amber-800 uppercase">
              Needs
            </span>
            <p className="mt-1 text-sm whitespace-pre-line text-stone-700">{trade.needing}</p>
          </div>
        </div>

        {isOpen && iAmProposer && tradeClaims.length > 0 && (
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
            <span className="text-xs font-semibold tracking-wide text-violet-800 uppercase">
              {tradeClaims.length === 1 ? '1 neighbor wants this' : `${tradeClaims.length} neighbors want this`}
            </span>
            <ul className="mt-2 space-y-2">
              {tradeClaims.map((claim) => (
                <li key={claim.id} className="flex items-center gap-2">
                  <Link
                    to={`/u/${claim.claimant.id}`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-sm text-stone-700 hover:text-emerald-700"
                  >
                    <Avatar
                      name={claim.claimant.display_name}
                      url={claim.claimant.avatar_url}
                      size="sm"
                    />
                    <span className="truncate">{claim.claimant.display_name}</span>
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void chooseClaimant(trade, claim.claimant)}
                    className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Choose as partner
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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

            {!iAmProposer && isOpen && !myClaim && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void claimTrade(trade)}
                className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Claiming...' : 'Claim this trade'}
              </button>
            )}

            {!iAmProposer && isOpen && myClaim && (
              <>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                  You claimed this
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void withdrawClaim(trade)}
                  className={smallButton}
                >
                  Withdraw claim
                </button>
              </>
            )}

            {iAmProposer && (trade.status === 'proposed' || isOpen) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelTrade(trade)}
                className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isOpen ? 'Take down' : 'Cancel'}
              </button>
            )}

            {canConfirm && (
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
        Say what you are offering and what you need, do the work, your partner confirms completion,
        you earn a badge.
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
              <option value={ANYONE}>Anyone can claim it</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              {partnerId === ANYONE
                ? 'This goes on the open board for every member to see. The first neighbor to claim it becomes your partner, and you confirm the work when it is done.'
                : 'Pick someone specific, or open it up to anyone if you just need the help.'}
            </p>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="trade-offering"
                className="mb-1 block text-sm font-medium text-stone-700"
              >
                What I'm offering
              </label>
              <textarea
                id="trade-offering"
                value={offering}
                onChange={(event) => setOffering(event.target.value)}
                rows={4}
                maxLength={LIMITS.tradeOffering}
                placeholder="Carpentry, a truck, six jars of salsa"
                className="w-full resize-y rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label
                htmlFor="trade-needing"
                className="mb-1 block text-sm font-medium text-stone-700"
              >
                What I need
              </label>
              <textarea
                id="trade-needing"
                value={needing}
                onChange={(event) => setNeeding(event.target.value)}
                rows={4}
                maxLength={LIMITS.tradeNeeding}
                placeholder="Help hauling debris on a Saturday"
                className="w-full resize-y rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </div>
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
