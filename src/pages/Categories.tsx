import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Category, ListingType } from '../lib/types'

interface CountRow {
  category_id: string | null
  type: ListingType
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

      const [categoryResult, listingResult] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('listings').select('category_id, type').eq('status', 'active'),
      ])

      if (cancelled) return

      const failure = categoryResult.error ?? listingResult.error
      if (failure) {
        setError(failure.message)
        setLoading(false)
        return
      }

      const tally: Record<string, Counts> = {}
      for (const row of (listingResult.data ?? []) as unknown as CountRow[]) {
        if (!row.category_id) continue
        const entry = tally[row.category_id] ?? { offering: 0, seeking: 0 }
        if (row.type === 'offering') entry.offering += 1
        else entry.seeking += 1
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
          We could not load the categories. {error}
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
                className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="text-4xl" aria-hidden>
                  {category.emoji ?? '🔁'}
                </span>
                <h2 className="mt-3 text-base font-semibold text-stone-900">{category.name}</h2>
                {category.description && (
                  <p className="mt-1 text-sm text-stone-600">{category.description}</p>
                )}
                <p className="mt-4 text-xs font-medium text-stone-500">
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
