import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ListingCard from '../components/ListingCard'
import { describeError } from '../lib/errors'
import { FEED_PAGE_SIZE, LISTING_SELECT } from '../lib/queries'
import { useDebouncedValue } from '../lib/useDebounce'
import type { Category, ListingWithRelations } from '../lib/types'

type TypeFilter = 'all' | 'offering' | 'seeking'
type KindFilter = 'all' | 'service' | 'good'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

function Segmented<T extends string>(props: {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={props.value === option.value}
          onClick={() => props.onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            props.value === option.value
              ? 'bg-emerald-600 text-white'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Commas and parens would break out of the PostgREST .or() filter expression.
function sanitize(term: string): string {
  return term.replace(/[,()%\\]/g, ' ').trim()
}

export default function Feed() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search.trim())
  const [type, setType] = useState<TypeFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [categoryId, setCategoryId] = useState('all')

  const [categories, setCategories] = useState<Category[]>([])
  const [listings, setListings] = useState<ListingWithRelations[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('categories')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setCategories((data ?? []) as Category[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(
    async (pageIndex: number) => {
      if (pageIndex === 0) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      let request = supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(pageIndex * FEED_PAGE_SIZE, (pageIndex + 1) * FEED_PAGE_SIZE - 1)

      if (type !== 'all') request = request.eq('type', type)
      if (kind !== 'all') request = request.eq('kind', kind)
      if (categoryId !== 'all') request = request.eq('category_id', categoryId)

      const term = sanitize(query)
      if (term) request = request.or(`title.ilike.%${term}%,description.ilike.%${term}%`)

      const { data, error: fetchError } = await request
      if (fetchError) {
        setError(describeError(fetchError, 'We could not load the feed.'))
        if (pageIndex === 0) setListings([])
      } else {
        const rows = (data ?? []) as unknown as ListingWithRelations[]
        setListings((prev) => {
          if (pageIndex === 0) return rows
          // New posts shift offsets between pages; drop rows already shown.
          const seen = new Set(prev.map((listing) => listing.id))
          return [...prev, ...rows.filter((row) => !seen.has(row.id))]
        })
        setHasMore(rows.length === FEED_PAGE_SIZE)
        setPage(pageIndex)
      }
      setLoading(false)
      setLoadingMore(false)
    },
    [query, type, kind, categoryId]
  )

  useEffect(() => {
    load(0)
  }, [load])

  const hasFilters = query !== '' || type !== 'all' || kind !== 'all' || categoryId !== 'all'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Community feed</h1>
        <button
          type="button"
          onClick={() => navigate('/listings/new')}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          New listing
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search listings by title or description"
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Filter by type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All' },
              { value: 'offering', label: 'Offerings' },
              { value: 'seeking', label: 'Seeking' },
            ]}
          />
          <Segmented
            label="Filter by kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All' },
              { value: 'service', label: 'Services' },
              { value: 'good', label: 'Goods' },
            ]}
          />
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="py-10 text-center text-sm text-stone-500">Loading listings.</p>}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-base font-semibold text-stone-800">
            {hasFilters ? 'No listings match these filters.' : 'The feed is empty.'}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {hasFilters
              ? 'Try a broader search or clear a filter.'
              : 'Be the first neighbor to post. Share a skill you can offer or something you are looking for.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/listings/new')}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Post the first listing
          </button>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onChanged={() => load(0)} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => load(page + 1)}
                disabled={loadingMore}
                className="rounded-lg border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
