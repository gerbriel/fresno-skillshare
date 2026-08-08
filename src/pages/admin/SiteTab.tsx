import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { SiteSettings } from '../../lib/types'
import { ErrorBlock, Feedback, LoadingBlock, SectionHeader } from './shared'
import { buttonClass, cardClass, describeError, inputClass, labelClass } from './helpers'

const KEYS = ['hero_heading', 'hero_subheading', 'about', 'how_it_works'] as const

const BLANK: SiteSettings = {
  hero_heading: '',
  hero_subheading: '',
  about: '',
  how_it_works: [],
}

interface SettingRow {
  key: string
  value: unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export default function SiteTab() {
  const [form, setForm] = useState<SiteSettings>(BLANK)
  const [original, setOriginal] = useState<SiteSettings>(BLANK)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setFeedback(null)

    const { data, error: queryError } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', KEYS as unknown as string[])

    if (queryError) {
      setError('We could not load the landing page content. Please try again.')
      setLoading(false)
      return
    }

    const rows = (data ?? []) as SettingRow[]
    const byKey = new Map(rows.map((row) => [row.key, row.value]))
    const loaded: SiteSettings = {
      hero_heading: asString(byKey.get('hero_heading')),
      hero_subheading: asString(byKey.get('hero_subheading')),
      about: asString(byKey.get('about')),
      how_it_works: asStringList(byKey.get('how_it_works')),
    }

    setForm(loaded)
    setOriginal(loaded)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setStep = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      how_it_works: current.how_it_works.map((step, i) => (i === index ? value : step)),
    }))
  }

  const addStep = () => {
    setForm((current) => ({ ...current, how_it_works: [...current.how_it_works, ''] }))
  }

  const removeStep = (index: number) => {
    setForm((current) => ({
      ...current,
      how_it_works: current.how_it_works.filter((_, i) => i !== index),
    }))
  }

  const save = async () => {
    setSaving(true)
    setFeedback(null)

    const cleaned: SiteSettings = {
      hero_heading: form.hero_heading.trim(),
      hero_subheading: form.hero_subheading.trim(),
      about: form.about.trim(),
      how_it_works: form.how_it_works.map((step) => step.trim()).filter((step) => step.length > 0),
    }

    const changed = KEYS.filter(
      (key) => JSON.stringify(cleaned[key]) !== JSON.stringify(original[key])
    )

    if (changed.length === 0) {
      setFeedback({ tone: 'success', message: 'Nothing to save. This already matches what is live.' })
      setSaving(false)
      return
    }

    // All changed keys are upserted in one transaction server-side.
    const payload: Record<string, string | string[]> = {}
    for (const key of changed) payload[key] = cleaned[key]

    const { error: writeError } = await supabase.rpc('upsert_site_settings', {
      p_settings: payload,
    })

    if (writeError) {
      setFeedback({
        tone: 'error',
        message: describeError(writeError, 'The changes did not save.'),
      })
      setSaving(false)
      await load()
      return
    }

    setForm(cleaned)
    setOriginal(cleaned)
    setFeedback({
      tone: 'success',
      message: 'Saved. The landing page is updated for everyone who visits.',
    })
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <SectionHeader title="Site content" description="Loading the landing page copy." />
        <LoadingBlock rows={4} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Site content"
        description="This is the copy people read on the public landing page before they join."
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={saving}
            className={buttonClass('secondary', 'sm')}
          >
            Reload
          </button>
        }
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <div className={`${cardClass} space-y-4`}>
        <h3 className="font-semibold text-stone-900">Hero</h3>

        <div>
          <label htmlFor="site-hero-heading" className={labelClass}>
            Heading
          </label>
          <input
            id="site-hero-heading"
            type="text"
            value={form.hero_heading}
            onChange={(event) => setForm({ ...form, hero_heading: event.target.value })}
            placeholder="Trade skills, not dollars."
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="site-hero-subheading" className={labelClass}>
            Subheading
          </label>
          <textarea
            id="site-hero-subheading"
            value={form.hero_subheading}
            onChange={(event) => setForm({ ...form, hero_subheading: event.target.value })}
            rows={3}
            placeholder="One or two sentences about the co-op."
            className={`mt-1.5 resize-y ${inputClass}`}
          />
        </div>
      </div>

      <div className={`${cardClass} space-y-4`}>
        <h3 className="font-semibold text-stone-900">About</h3>
        <div>
          <label htmlFor="site-about" className={labelClass}>
            About the co-op
          </label>
          <textarea
            id="site-about"
            value={form.about}
            onChange={(event) => setForm({ ...form, about: event.target.value })}
            rows={5}
            placeholder="Who you are and how the co-op works."
            className={`mt-1.5 resize-y ${inputClass}`}
          />
        </div>
      </div>

      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-stone-900">How it works</h3>
          <button type="button" onClick={addStep} className={buttonClass('secondary', 'sm')}>
            Add step
          </button>
        </div>

        {form.how_it_works.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
            No steps yet. Add the first one to explain how joining works.
          </p>
        ) : (
          <ol className="space-y-3">
            {form.how_it_works.map((step, index) => (
              <li key={index} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={step}
                  onChange={(event) => setStep(index, event.target.value)}
                  aria-label={`Step ${index + 1}`}
                  placeholder="Describe this step"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  aria-label={`Remove step ${index + 1}`}
                  className={buttonClass('danger', 'sm')}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-stone-400">Empty steps are dropped when you save.</p>
      </div>

      {feedback && <Feedback tone={feedback.tone} message={feedback.message} />}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={buttonClass('primary')}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => {
            setForm(original)
            setFeedback(null)
          }}
          disabled={saving}
          className={buttonClass('secondary')}
        >
          Discard changes
        </button>
      </div>
    </div>
  )
}
