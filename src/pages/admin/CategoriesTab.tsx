import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Category } from '../../lib/types'
import { EmptyBlock, ErrorBlock, Feedback, LoadingBlock, SectionHeader } from './shared'
import {
  buttonClass,
  cardClass,
  describeError,
  inputClass,
  isUniqueViolation,
  labelClass,
  slugify,
} from './helpers'

interface EditDraft {
  emoji: string
  name: string
  description: string
}

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [emoji, setEmoji] = useState('🔁')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ emoji: '🔁', name: '', description: '' })
  const [rowError, setRowError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true })

    if (queryError) {
      setError('We could not load the categories. Please try again.')
      setLoading(false)
      return
    }

    setCategories((data ?? []) as Category[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const newSlug = slugify(name)
  const draftSlug = slugify(draft.name)

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Give the category a name.')
      setFormSuccess(null)
      return
    }
    if (!newSlug) {
      setFormError('That name needs at least one letter or number so we can build a link for it.')
      setFormSuccess(null)
      return
    }

    setCreating(true)
    setFormError(null)
    setFormSuccess(null)

    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({
        name: trimmedName,
        slug: newSlug,
        description: description.trim().length > 0 ? description.trim() : null,
        emoji: emoji.trim().length > 0 ? emoji.trim() : '🔁',
      })
      .select('*')
      .single()

    if (insertError) {
      setFormError(
        isUniqueViolation(insertError)
          ? 'A category with that name or link already exists.'
          : describeError(insertError, 'We could not create that category.')
      )
      setCreating(false)
      return
    }

    setCategories((current) =>
      [...current, data as Category].sort((a, b) => a.name.localeCompare(b.name))
    )
    setName('')
    setDescription('')
    setEmoji('🔁')
    setFormSuccess(`Added ${trimmedName}.`)
    setCreating(false)
  }

  const startEdit = (category: Category) => {
    setRowError(null)
    setEditingId(category.id)
    setDraft({
      emoji: category.emoji ?? '🔁',
      name: category.name,
      description: category.description ?? '',
    })
  }

  const saveEdit = async (category: Category) => {
    const trimmedName = draft.name.trim()
    if (!trimmedName || !draftSlug) {
      setRowError('A category needs a name with at least one letter or number.')
      return
    }

    setBusyId(category.id)
    setRowError(null)

    const patch = {
      name: trimmedName,
      slug: draftSlug,
      description: draft.description.trim().length > 0 ? draft.description.trim() : null,
      emoji: draft.emoji.trim().length > 0 ? draft.emoji.trim() : '🔁',
    }

    const { error: updateError } = await supabase
      .from('categories')
      .update(patch)
      .eq('id', category.id)

    if (updateError) {
      setRowError(
        isUniqueViolation(updateError)
          ? 'A category with that name or link already exists.'
          : describeError(updateError, 'We could not save that category.')
      )
      setBusyId(null)
      return
    }

    setCategories((current) =>
      current
        .map((item) => (item.id === category.id ? { ...item, ...patch } : item))
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    setEditingId(null)
    setBusyId(null)
  }

  const handleDelete = async (category: Category) => {
    const ok = window.confirm(
      `Delete ${category.name}? Listings in it keep working, they just end up without a category.`
    )
    if (!ok) return

    setBusyId(category.id)
    setRowError(null)
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', category.id)

    if (deleteError) {
      setRowError(describeError(deleteError, 'We could not delete that category.'))
      setBusyId(null)
      return
    }

    setCategories((current) => current.filter((item) => item.id !== category.id))
    if (editingId === category.id) setEditingId(null)
    setBusyId(null)
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Categories"
        description="Categories organize the feed. The link is built from the name automatically."
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={buttonClass('secondary', 'sm')}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <form onSubmit={handleCreate} className={`${cardClass} space-y-4`}>
        <h3 className="font-semibold text-stone-900">New category</h3>

        <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
          <div>
            <label htmlFor="category-emoji" className={labelClass}>
              Emoji
            </label>
            <input
              id="category-emoji"
              type="text"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              maxLength={4}
              className={`mt-1.5 text-center text-lg ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="category-name" className={labelClass}>
              Name
            </label>
            <input
              id="category-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Home and Repairs"
              className={`mt-1.5 ${inputClass}`}
            />
            <p className="mt-1.5 text-xs text-stone-400">
              Link preview: <span className="font-mono text-stone-500">/categories/{newSlug || '...'}</span>
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="category-description" className={labelClass}>
            Description <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <textarea
            id="category-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="Handyman work, plumbing, electrical, painting"
            className={`mt-1.5 resize-y ${inputClass}`}
          />
        </div>

        {formError && <Feedback tone="error" message={formError} />}
        {formSuccess && <Feedback tone="success" message={formSuccess} />}

        <button type="submit" disabled={creating} className={buttonClass('primary')}>
          {creating ? 'Adding...' : 'Add category'}
        </button>
      </form>

      {rowError && <Feedback tone="error" message={rowError} />}
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingBlock rows={4} />
      ) : categories.length === 0 ? (
        <EmptyBlock>No categories yet. Add the first one above.</EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {categories.map((category) => {
            const busy = busyId === category.id
            const editing = editingId === category.id

            if (editing) {
              return (
                <li
                  key={category.id}
                  className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
                >
                  <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                    <input
                      type="text"
                      value={draft.emoji}
                      onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
                      maxLength={4}
                      aria-label="Emoji"
                      className={`text-center text-lg ${inputClass}`}
                    />
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      aria-label="Name"
                      className={inputClass}
                    />
                  </div>
                  <textarea
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    rows={2}
                    aria-label="Description"
                    placeholder="Description (optional)"
                    className={`resize-y ${inputClass}`}
                  />
                  <p className="text-xs text-stone-400">
                    Link preview:{' '}
                    <span className="font-mono text-stone-500">/categories/{draftSlug || '...'}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveEdit(category)}
                      className={buttonClass('primary', 'sm')}
                    >
                      {busy ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              )
            }

            return (
              <li
                key={category.id}
                className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="text-2xl leading-none" aria-hidden>
                    {category.emoji ?? '🔁'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">{category.name}</p>
                    <p className="font-mono text-xs text-stone-400">/categories/{category.slug}</p>
                    {category.description && (
                      <p className="mt-1 text-sm text-stone-500">{category.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(category)}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(category)}
                    className={buttonClass('danger', 'sm')}
                  >
                    {busy ? 'Working...' : 'Delete'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
