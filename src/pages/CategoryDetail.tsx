import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ListingCard from '../components/ListingCard'
import Avatar from '../components/Avatar'
import type { Category, ListingWithRelations, ProfileLite } from '../lib/types'

const LISTING_SELECT =
  '*, owner:profiles!listings_owner_id_fkey(id, display_name, avatar_url), category:categories(*)'

type TypeFilter = 'all' | 'offering' | 'seeking'

const typeOptions: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'offering', label: 'Offerings' },
  { value: 'seeking', label: 'Seeking' },
]

export default function CategoryDetail() {
  const { slug } = useParams<{ slug: string }>()

  const [category, setCategory] = useState<Category | null>(null)
  const [listings, setListings] = useState<ListingWithRelations[]>([])
  const [type, setType] = useState<TypeFilter>('all')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError(null)
    setNotFound(false)

    const { data: categoryRow, error: categoryError } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (categoryError) {
      setError(categoryError.message)
      setLoading(false)
      return
    }
    if (!categoryRow) {
      setNotFound(true)
      setCategory(null)
      setListings([])
      setLoading(false)
      return
    }

    const found = categoryRow as Category
    setCategory(found)

    const { data, error: listingError } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .eq('category_id', found.id)
      .order('created_at', { ascending: false })

    if (listingError) {
      setError(listingError.message)
      setListings([])
    } else {
      setListings((data ?? []) as unknown as ListingWithRelations[])
    }
    setLoading(false)
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(
    () => (type === 'all' ? listings : listings.filter((listing) => listing.type === type)),
    [listings, type]
  )

  const members = useMemo(() => {
    const seen = new Map<string, ProfileLite>()
    for (const listing of visible) {
      if (listing.owner && !seen.has(listing.owner.id)) seen.set(listing.owner.id, listing.owner)
    }
    return [...seen.values()]
  }, [visible])

  if (loading) {
    return <p className="py-10 text-center text-sm text-stone-500">Loading category.</p>
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
        <p className="text-base font-semibold text-stone-800">We could not find that category.</p>
        <p className="mt-1 text-sm text-stone-500">It may have been renamed or removed.</p>
        <Link
          to="/categories"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Back to categories
        </Link>
      </div>
    )
  }

  if (error && !category) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        We could not load this category. {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/categories" className="text-sm font-medium text-stone-500 hover:text-emerald-700">
          Back to categories
        </Link>
        <div className="mt-3 flex items-start gap-3">
          <span className="text-4xl" aria-hidden>
            {category?.emoji ?? '🔁'}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">{category?.name}</h1>
            {category?.description && (
              <p className="mt-1 text-sm text-stone-600">{category.description}</p>
            )}
          </div>
        </div>
      </div>

      <div
        className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5"
        role="group"
        aria-label="Filter by type"
      >
        {typeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={type === option.value}
            onClick={() => setType(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              type === option.value
                ? 'bg-emerald-600 text-white'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We could not load the listings. {error}
        </div>
      )}

      {!error && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-base font-semibold text-stone-800">Nothing here yet.</p>
          <p className="mt-1 text-sm text-stone-500">
            No active listings in this category. Post one and start the exchange.
          </p>
          <Link
            to="/listings/new"
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            New listing
          </Link>
        </div>
      )}

      {!error && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onChanged={load} />
          ))}
        </div>
      )}

      {members.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-base font-semibold text-stone-900">Members in this category</h2>
          <p className="mt-1 text-sm text-stone-500">
            Neighbors posting here. Reach out to whoever fits what you need.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {members.map((member) => (
              <Link
                key={member.id}
                to={`/u/${member.id}`}
                className="flex items-center gap-2 rounded-full border border-stone-200 py-1 pl-1 pr-3 text-sm font-medium text-stone-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <Avatar name={member.display_name} url={member.avatar_url} size="sm" />
                {member.display_name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
