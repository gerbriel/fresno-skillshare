import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'
import { formatDate } from '../lib/format'
import type { Newsletter, Poll, PollOption } from '../lib/types'

const COLLAPSE_AT = 400

interface PollData {
  poll: Poll
  options: PollOption[]
  counts: Record<string, number>
  myOptionId: string | null
}

function PollWidget({ data, onVote }: { data: PollData; onVote: (optionId: string) => void }) {
  const { poll, options, counts, myOptionId } = data
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
      <p className="text-sm font-semibold text-stone-900">{poll.question}</p>
      <ul className="mt-3 space-y-2">
        {options.map((option) => {
          const n = counts[option.id] ?? 0
          const pct = total > 0 ? Math.round((n / total) * 100) : 0
          const mine = myOptionId === option.id
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onVote(option.id)}
                aria-pressed={mine}
                className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors ${
                  mine
                    ? 'border-emerald-500 bg-white'
                    : 'border-stone-200 bg-white hover:border-emerald-300'
                }`}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-emerald-100"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-stone-800">
                    {mine && <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
                    {option.label}
                  </span>
                  <span className="tabular-nums text-stone-500">
                    {pct}% ({n})
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-stone-500">
        {total === 0
          ? 'Be the first to vote.'
          : `${total} ${total === 1 ? 'vote' : 'votes'} so far.`}
        {myOptionId && ' Tap another option to change your vote.'}
      </p>
    </div>
  )
}

function NewsletterCard({
  newsletter,
  poll,
  onVote,
}: {
  newsletter: Newsletter
  poll: PollData | undefined
  onVote: (optionId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const long = newsletter.body.length > COLLAPSE_AT
  const body = long && !expanded ? `${newsletter.body.slice(0, COLLAPSE_AT).trimEnd()}...` : newsletter.body

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">{newsletter.subject}</h2>
      <p className="mt-0.5 text-xs text-stone-500">
        {newsletter.sent_at ? formatDate(newsletter.sent_at) : 'Not sent yet'}
      </p>
      <p className="mt-3 text-sm whitespace-pre-line text-stone-700">{body}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-3 text-sm font-semibold text-emerald-700 hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      {poll && <PollWidget data={poll} onVote={onVote} />}
    </article>
  )
}

export default function Newsletters() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [pollsByNewsletter, setPollsByNewsletter] = useState<Record<string, PollData>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('newsletters')
      .select('*')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(50)

    if (fetchError) {
      setError(describeError(fetchError, 'We could not load the newsletters.'))
      setLoading(false)
      return
    }

    const rows = (data ?? []) as Newsletter[]
    setError(null)
    setNewsletters(rows)
    setLoading(false)

    if (rows.length === 0) {
      setPollsByNewsletter({})
      return
    }

    // Polls, their options, aggregate counts, and my own votes.
    const newsletterIds = rows.map((row) => row.id)
    const { data: pollRows } = await supabase
      .from('polls')
      .select('*')
      .in('newsletter_id', newsletterIds)

    const polls = (pollRows ?? []) as Poll[]
    if (polls.length === 0) {
      setPollsByNewsletter({})
      return
    }

    const pollIds = polls.map((poll) => poll.id)
    const [optionsResult, countsResult, myVotesResult] = await Promise.all([
      supabase.from('poll_options').select('*').in('poll_id', pollIds),
      supabase.rpc('poll_results_multi', { p_poll_ids: pollIds }),
      supabase.from('poll_votes').select('poll_id, option_id').in('poll_id', pollIds),
    ])

    const options = (optionsResult.data ?? []) as PollOption[]
    const countRows = (countsResult.data ?? []) as { poll_id: string; option_id: string; votes: number }[]
    const myVotes = (myVotesResult.data ?? []) as { poll_id: string; option_id: string }[]

    const byNewsletter: Record<string, PollData> = {}
    for (const poll of polls) {
      if (!poll.newsletter_id) continue
      const pollOptions = options
        .filter((option) => option.poll_id === poll.id)
        .sort((a, b) => a.position - b.position)
      const counts: Record<string, number> = {}
      for (const row of countRows) {
        if (row.poll_id === poll.id) counts[row.option_id] = Number(row.votes)
      }
      const myVote = myVotes.find((vote) => vote.poll_id === poll.id)
      byNewsletter[poll.newsletter_id] = {
        poll,
        options: pollOptions,
        counts,
        myOptionId: myVote?.option_id ?? null,
      }
    }
    setPollsByNewsletter(byNewsletter)
  }, [])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const vote = async (newsletterId: string, optionId: string) => {
    const current = pollsByNewsletter[newsletterId]
    if (!current || current.myOptionId === optionId) return

    // Optimistic: move my vote to the new option and adjust counts.
    setPollsByNewsletter((prev) => {
      const entry = prev[newsletterId]
      if (!entry) return prev
      const counts = { ...entry.counts }
      if (entry.myOptionId) counts[entry.myOptionId] = Math.max(0, (counts[entry.myOptionId] ?? 0) - 1)
      counts[optionId] = (counts[optionId] ?? 0) + 1
      return { ...prev, [newsletterId]: { ...entry, counts, myOptionId: optionId } }
    })

    const { error: voteError } = await supabase.rpc('cast_vote', {
      p_poll_id: current.poll.id,
      p_option_id: optionId,
    })
    // Reconcile with the server either way (rolls back on error).
    if (voteError) setError(describeError(voteError, 'We could not record your vote.'))
    await load()
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Co-op news</h1>
        <p className="mt-1 text-sm text-stone-600">
          Every newsletter also lands in your{' '}
          <Link to="/messages" className="font-medium text-emerald-700 hover:underline">
            Messages
          </Link>{' '}
          inbox, so you can reply privately to the admin right there.
        </p>
      </header>

      {loading ? (
        <p className="py-10 text-center text-sm text-stone-500">Loading news...</p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : newsletters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-stone-700">No news yet</p>
          <p className="mt-1 text-sm text-stone-500">
            When an admin sends the first newsletter, it will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {newsletters.map((newsletter) => (
            <NewsletterCard
              key={newsletter.id}
              newsletter={newsletter}
              poll={pollsByNewsletter[newsletter.id]}
              onVote={(optionId) => void vote(newsletter.id, optionId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
