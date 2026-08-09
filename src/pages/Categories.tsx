import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CategoryIcon } from '../components/CategoryIcon'
import { IconPicker } from '../components/IconPicker'
import { describeError, isUniqueViolation } from '../lib/errors'
import { cleanOptional, cleanText, LIMITS } from '../lib/validate'
import { slugify } from './admin/helpers'
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
  const { profile } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, Counts>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('repeat')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [categoryResult, countResult] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      // Aggregated in the database; the client never downloads listing rows.
      supabase.rpc('category_counts'),
    ])

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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!profile) return

    const trimmedName = cleanText(name, LIMITS.categoryName)
    const slug = slugify(trimmedName)
    if (!trimmedName || !slug) {
      setFormError('Give the category a name.')
      return
    }

    setSaving(true)
    setFormError(null)
    setFormNotice(null)

    const { error: insertError } = await supabase.from('categories').insert({
      name: trimmedName,
      slug,
      description: cleanOptional(description, LIMITS.categoryDescription),
      icon,
      created_by: profile.id,
    })
    setSaving(false)

    if (insertError) {
      setFormError(
        isUniqueViolation(insertError)
          ? 'A category with that name already exists.'
          : describeError(insertError, 'We could not add that category.')
      )
      return
    }

    setName('')
    setDescription('')
    setIcon('repeat')
    setFormOpen(false)
    setFormNotice(
      `Added "${trimmedName}". An admin will review it before it appears for everyone.`
    )
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Categories</h1>
          <p className="mt-1 text-sm text-stone-500">
            Browse what neighbors offer and what they are looking for.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormOpen((open) => !open)
            setFormError(null)
            setFormNotice(null)
          }}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          {formOpen ? 'Close' : 'Add a category'}
        </button>
      </div>

      {formNotice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {formNotice}
        </p>
      )}

      {formOpen && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="category-name" className="block text-sm font-medium text-stone-700">
                Name
              </label>
              <input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={LIMITS.categoryName}
                placeholder="Bike repair"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div>
              <label
                htmlFor="category-description"
                className="block text-sm font-medium text-stone-700"
              >
                Description <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="category-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={LIMITS.categoryDescription}
                placeholder="Tune-ups, flats, brake adjustments"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>

          <IconPicker value={icon} onChange={setIcon} />

          {formError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {saving ? 'Adding...' : 'Add category'}
          </button>
        </form>
      )}

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
            Be the first: add one with the button above.
          </p>
        </div>
      )}

      {!loading && !error && categories.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const entry = counts[category.id] ?? { offering: 0, seeking: 0 }
            const isPending = category.approved === false

            const content = (
              <>
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"
                  aria-hidden
                >
                  <CategoryIcon name={category.icon} className="h-6 w-6" />
                </span>
                <div className="mt-4 flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-stone-900">
                    {category.name}
                  </h2>
                  {isPending && (
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      Pending approval
                    </span>
                  )}
                </div>
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
              </>
            )

            if (isPending) {
              return (
                <div
                  key={category.id}
                  className="flex h-full cursor-default flex-col rounded-2xl border border-dashed border-stone-300 bg-white p-6 opacity-70 shadow-sm"
                >
                  {content}
                </div>
              )
            }

            return (
              <Link
                key={category.id}
                to={`/categories/${category.slug}`}
                className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all hover:border-stone-300 hover:shadow-md"
              >
                {content}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
