import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CategoryIcon } from '../components/CategoryIcon'
import { describeError } from '../lib/errors'
import type { Category, ListingType } from '../lib/types'

interface CountRow {
  category_id: string
  listing_type: ListingType
  n: number
}

interface Counts {
  offering: number
  seeking: number
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, Counts>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const [categoryResult, countResult] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        // Aggregated in the database; the client never downloads listing rows.
        supabase.rpc('category_counts'),
      ])

      if (cancelled) return

      const failure = categoryResult.error ?? countResult.error
      if (failure) {
        setError(describeError(failure, 'We could not load the categories.'))
        setLoading(false)
        return
      }

      const tally: Record<string, Counts> = {}
      for (const row of (countResult.data ?? []) as unknown as CountRow[]) {
        const entry = tally[row.category_id] ?? { offering: 0, seeking: 0 }
        if (row.listing_type === 'offering') entry.offering += row.n
        else entry.seeking += row.n
        tally[row.category_id] = entry
      }

      setCategories((categoryResult.data ?? []) as Category[])
      setCounts(tally)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Categories</h1>
        <p className="mt-1 text-sm text-stone-500">
          Browse what neighbors offer and what they are looking for.
        </p>
      </div>

      {loading && <p className="py-10 text-center text-sm text-stone-500">Loading categories.</p>}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-base font-semibold text-stone-800">No categories yet.</p>
          <p className="mt-1 text-sm text-stone-500">
            An admin can add categories from the admin dashboard.
          </p>
        </div>
      )}

      {!loading && !error && categories.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const entry = counts[category.id] ?? { offering: 0, seeking: 0 }
            return (
              <Link
                key={category.id}
                to={`/categories/${category.slug}`}
                className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all hover:border-stone-300 hover:shadow-md"
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"
                  aria-hidden
                >
                  <CategoryIcon name={category.icon} className="h-6 w-6" />
                </span>
                <h2 className="mt-4 text-base font-semibold tracking-tight text-stone-900">
                  {category.name}
                </h2>
                {category.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
                    {category.description}
                  </p>
                )}
                <p className="mt-5 text-xs font-medium text-stone-500">
                  <span className="text-emerald-700">{entry.offering} offerings</span>
                  {' · '}
                  <span className="text-amber-700">{entry.seeking} seeking</span>
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
