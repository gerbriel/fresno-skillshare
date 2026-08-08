import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Category, Listing, ListingKind, ListingType } from '../lib/types'

const fieldClass =
  'w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

const typeChoices: { value: ListingType; label: string }[] = [
  { value: 'offering', label: 'I am offering this' },
  { value: 'seeking', label: 'I am looking for this' },
]

const kindChoices: { value: ListingKind; label: string }[] = [
  { value: 'service', label: 'Service' },
  { value: 'good', label: 'Good' },
]

export default function ListingEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const isEdit = !!id

  const [categories, setCategories] = useState<Category[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ListingType>('offering')
  const [kind, setKind] = useState<ListingKind>('service')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<'active' | 'paused'>('active')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setNotFound(false)
      setForbidden(false)

      const { data: categoryRows, error: categoryError } = await supabase
        .from('categories')
        .select('*')
        .order('name')

      if (cancelled) return
      if (categoryError) {
        setError(categoryError.message)
        setLoading(false)
        return
      }
      setCategories((categoryRows ?? []) as Category[])

      if (!id) {
        setLoading(false)
        return
      }

      const { data, error: listingError } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (listingError) {
        setError(listingError.message)
        setLoading(false)
        return
      }
      if (!data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const listing = data as Listing
      if (profile && listing.owner_id !== profile.id && !isAdmin) {
        setForbidden(true)
        setLoading(false)
        return
      }

      setTitle(listing.title)
      setDescription(listing.description ?? '')
      setType(listing.type)
      setKind(listing.kind)
      setCategoryId(listing.category_id ?? '')
      setStatus(listing.status)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, profile, isAdmin])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) return

    const trimmed = title.trim()
    if (!trimmed) {
      setError('Give your listing a title.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      category_id: categoryId || null,
      type,
      kind,
      title: trimmed,
      description: description.trim() || null,
    }

    const { error: saveError } = isEdit
      ? await supabase
          .from('listings')
          .update({ ...payload, status })
          .eq('id', id as string)
      : await supabase.from('listings').insert({ ...payload, owner_id: profile.id })

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    navigate(`/u/${profile.id}`)
  }

  const remove = async () => {
    if (!id || !profile) return
    if (!window.confirm('Delete this listing? This cannot be undone.')) return

    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase.from('listings').delete().eq('id', id)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate(`/u/${profile.id}`)
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-stone-500">Loading.</p>
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-10 text-center">
        <p className="text-base font-semibold text-stone-800">
          This listing belongs to someone else.
        </p>
        <p className="mt-1 text-sm text-stone-500">
          You can only edit listings you posted. Duplicate it from the feed to make it your own.
        </p>
        <Link
          to="/feed"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Back to the feed
        </Link>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
        <p className="text-base font-semibold text-stone-800">We could not find that listing.</p>
        <p className="mt-1 text-sm text-stone-500">It may have been deleted.</p>
        <Link
          to="/feed"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Back to the feed
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          {isEdit ? 'Edit listing' : 'New listing'}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Tell neighbors what you can trade, or what you are hoping to find.
        </p>
      </div>

      <form onSubmit={save} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
        <div>
          <label htmlFor="listing-title" className="block text-sm font-medium text-stone-700">
            Title
          </label>
          <input
            id="listing-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={140}
            placeholder="Weekend plumbing repairs"
            className={`mt-1 ${fieldClass}`}
          />
        </div>

        <div>
          <label htmlFor="listing-description" className="block text-sm font-medium text-stone-700">
            Description
          </label>
          <textarea
            id="listing-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            placeholder="Share the details: what is included, when you are available, what you would like in return."
            className={`mt-1 ${fieldClass}`}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Type</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {typeChoices.map((choice) => (
              <label
                key={choice.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  type === choice.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="listing-type"
                  value={choice.value}
                  checked={type === choice.value}
                  onChange={() => setType(choice.value)}
                  className="accent-emerald-600"
                />
                {choice.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Kind</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {kindChoices.map((choice) => (
              <label
                key={choice.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  kind === choice.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="listing-kind"
                  value={choice.value}
                  checked={kind === choice.value}
                  onChange={() => setKind(choice.value)}
                  className="accent-emerald-600"
                />
                {choice.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="listing-category" className="block text-sm font-medium text-stone-700">
            Category
          </label>
          <select
            id="listing-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={`mt-1 ${fieldClass}`}
          >
            <option value="">Pick a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji ? `${category.emoji} ` : ''}
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {isEdit && (
          <div className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-stone-700">
                {status === 'active' ? 'Active' : 'Paused'}
              </p>
              <p className="text-xs text-stone-500">
                {status === 'active'
                  ? 'Visible in the feed and category pages.'
                  : 'Hidden from the feed until you activate it again.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStatus(status === 'active' ? 'paused' : 'active')}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              {status === 'active' ? 'Pause' : 'Activate'}
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving.' : isEdit ? 'Save changes' : 'Post listing'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            Cancel
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete listing
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
