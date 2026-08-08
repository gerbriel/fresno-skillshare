import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'
import { formatDate } from '../lib/format'
import type { Newsletter } from '../lib/types'

const COLLAPSE_AT = 400

function NewsletterCard({ newsletter }: { newsletter: Newsletter }) {
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
    </article>
  )
}

export default function Newsletters() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('newsletters')
        .select('*')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      if (fetchError) {
        setError(describeError(fetchError, 'We could not load the newsletters.'))
      } else {
        setError(null)
        setNewsletters((data ?? []) as Newsletter[])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

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
            <NewsletterCard key={newsletter.id} newsletter={newsletter} />
          ))}
        </div>
      )}
    </div>
  )
}
