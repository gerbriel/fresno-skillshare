import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import type { ListingWithRelations } from '../../lib/types'
import { EmptyBlock, ErrorBlock, Feedback, LoadingBlock, Pill, SectionHeader } from './shared'
import { buttonClass, describeError, inputClass } from './helpers'

const LIMIT = 100

const SELECT =
  '*, owner:profiles!listings_owner_id_fkey(id, display_name, avatar_url), category:categories(*)'

export default function ListingsTab() {
  const [listings, setListings] = useState<ListingWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError(null)

    const base = supabase
      .from('listings')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    const trimmed = term.trim()
    const { data, error: queryError } = trimmed
      ? await base.ilike('title', `%${trimmed}%`)
      : await base

    if (queryError) {
      setError('We could not load the listings. Please try again.')
      setLoading(false)
      return
    }

    setListings((data ?? []) as unknown as ListingWithRelations[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => setAppliedSearch(search), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    void load(appliedSearch)
  }, [load, appliedSearch])

  const toggleStatus = async (listing: ListingWithRelations) => {
    const nextStatus = listing.status === 'active' ? 'paused' : 'active'
    setBusyId(listing.id)
    setActionError(null)

    const { error: updateError } = await supabase
      .from('listings')
      .update({ status: nextStatus })
      .eq('id', listing.id)

    if (updateError) {
      setActionError(describeError(updateError, 'We could not change that listing.'))
      setBusyId(null)
      return
    }

    setListings((current) =>
      current.map((item) => (item.id === listing.id ? { ...item, status: nextStatus } : item))
    )
    setBusyId(null)
  }

  const handleDelete = async (listing: ListingWithRelations) => {
    const ok = window.confirm(`Delete "${listing.title}"? This cannot be undone.`)
    if (!ok) return

    setBusyId(listing.id)
    setActionError(null)
    const { error: deleteError } = await supabase.from('listings').delete().eq('id', listing.id)

    if (deleteError) {
      setActionError(describeError(deleteError, 'We could not delete that listing.'))
      setBusyId(null)
      return
    }

    setListings((current) => current.filter((item) => item.id !== listing.id))
    setBusyId(null)
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Listings"
        description="Every listing in the co-op, including paused ones. Pause anything that does not belong, delete anything that should not exist."
        action={
          <button
            type="button"
            onClick={() => void load(appliedSearch)}
            disabled={loading}
            className={buttonClass('secondary', 'sm')}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div>
        <label htmlFor="listing-search" className="sr-only">
          Search listings by title
        </label>
        <input
          id="listing-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search titles..."
          className={inputClass}
        />
      </div>

      {actionError && <Feedback tone="error" message={actionError} />}
      {error && <ErrorBlock message={error} onRetry={() => void load(appliedSearch)} />}

      {loading ? (
        <LoadingBlock rows={4} />
      ) : listings.length === 0 ? (
        <EmptyBlock>
          {appliedSearch.trim()
            ? `No listings match "${appliedSearch.trim()}".`
            : 'No listings yet. They will show up here as members post them.'}
        </EmptyBlock>
      ) : (
        <>
          <ul className="space-y-3">
            {listings.map((listing) => {
              const busy = busyId === listing.id
              const paused = listing.status === 'paused'
              return (
                <li
                  key={listing.id}
                  className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-900">{listing.title}</p>
                      <Pill tone={paused ? 'amber' : 'emerald'}>{paused ? 'Paused' : 'Active'}</Pill>
                      <Pill tone="stone">{listing.type === 'offering' ? 'Offering' : 'Seeking'}</Pill>
                      {listing.category && (
                        <Pill tone="stone">
                          {listing.category.emoji ?? '🔁'} {listing.category.name}
                        </Pill>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-stone-400">
                      {listing.owner ? (
                        <>
                          by{' '}
                          <Link
                            to={`/u/${listing.owner.id}`}
                            className="font-medium text-stone-500 hover:text-emerald-700 hover:underline underline-offset-2"
                          >
                            {listing.owner.display_name}
                          </Link>
                        </>
                      ) : (
                        'by a former member'
                      )}
                      {' '}
                      &middot; posted {formatDate(listing.created_at)}
                    </p>
                    {listing.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-stone-500">{listing.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleStatus(listing)}
                      className={buttonClass('secondary', 'sm')}
                    >
                      {busy ? 'Working...' : paused ? 'Activate' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(listing)}
                      className={buttonClass('danger', 'sm')}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {listings.length === LIMIT && (
            <p className="text-center text-xs text-stone-400">
              Showing the {LIMIT} newest listings. Use the search box to find older ones.
            </p>
          )}
        </>
      )}
    </div>
  )
}
