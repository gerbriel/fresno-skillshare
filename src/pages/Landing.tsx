import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, HeartHandshake, MapPin, Sprout } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../lib/useLive'
import { formatEventRange } from '../lib/format'
import { cleanOptional, cleanText, isValidEmail, LIMITS } from '../lib/validate'
import type { CoopEvent, SiteSettings } from '../lib/types'

const SETTING_KEYS: string[] = ['hero_heading', 'hero_subheading', 'about', 'how_it_works']

const FALLBACK: SiteSettings = {
  hero_heading: 'Trade skills, not dollars.',
  hero_subheading:
    'Fresno Skillshare is an invite-only co-op where neighbors trade goods and services directly. No money, just mutual help and community credit.',
  about:
    'We are a Fresno community cooperative. Members list what they can offer and what they are looking for, then trade directly with each other. Reputation is built through reviews, vouches, and completed trades.',
  how_it_works: [
    'Get invited by a member or request to join.',
    'List the goods or services you offer and what you are seeking.',
    'Browse the feed, match with a neighbor, and propose a trade.',
    'Complete the trade, confirm it together, and earn badges.',
    'Review and vouch for each other to build community credit.',
  ],
}

interface SettingRow {
  key: string
  value: unknown
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function asStringList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (items.length > 0) return items
  }
  return fallback
}

type SubmitState = 'idle' | 'sending' | 'sent'

export default function Landing() {
  const { session, isActive, loading: authLoading } = useAuth()

  const [content, setContent] = useState<SiteSettings>(FALLBACK)
  const [contentLoading, setContentLoading] = useState(true)
  const [contentError, setContentError] = useState<string | null>(null)

  const [events, setEvents] = useState<CoopEvent[]>([])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  // Honeypot: humans never see or fill this field; bots that do are
  // quietly accepted without writing anything.
  const [website, setWebsite] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const joinRef = useRef<HTMLDivElement | null>(null)

  const loadContent = useCallback(async () => {
    setContentLoading(true)
    setContentError(null)
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', SETTING_KEYS)

    if (error) {
      setContentError('We could not load the latest page content, so you are seeing our standard introduction.')
      setContent(FALLBACK)
      setContentLoading(false)
      return
    }

    const rows = (data ?? []) as SettingRow[]
    const byKey = new Map(rows.map((row) => [row.key, row.value]))
    setContent({
      hero_heading: asString(byKey.get('hero_heading'), FALLBACK.hero_heading),
      hero_subheading: asString(byKey.get('hero_subheading'), FALLBACK.hero_subheading),
      about: asString(byKey.get('about'), FALLBACK.about),
      how_it_works: asStringList(byKey.get('how_it_works'), FALLBACK.how_it_works),
    })
    setContentLoading(false)
  }, [])

  // A visitor is not signed in, so a failed events fetch is silently dropped
  // rather than shown as an error on a marketing page.
  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(4)

    if (error) {
      setEvents([])
      return
    }

    setEvents((data as CoopEvent[] | null) ?? [])
  }, [])

  const reload = useCallback(async () => {
    await Promise.all([loadContent(), loadEvents()])
  }, [loadContent, loadEvents])

  useEffect(() => {
    void reload()
  }, [reload])

  useLive('landing-live', [{ table: 'events' }, { table: 'site_settings' }], reload)

  const scrollToJoin = () => {
    joinRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = cleanText(name, LIMITS.joinName)
    const trimmedEmail = email.trim()

    if (website) {
      setSubmitState('sent')
      return
    }

    if (!trimmedName || !trimmedEmail) {
      setSubmitError('Please add your name and email so we know who to reach.')
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      setSubmitError('That email address does not look right. Double-check it and try again.')
      return
    }

    setSubmitState('sending')
    setSubmitError(null)

    const { error } = await supabase.from('join_requests').insert({
      name: trimmedName,
      email: trimmedEmail,
      message: cleanOptional(message, LIMITS.joinMessage),
    })

    if (error) {
      setSubmitState('idle')
      setSubmitError(
        error.message.toLowerCase().includes('duplicate')
          ? 'It looks like we already have a request from this email. Hang tight, an admin will review it.'
          : 'Something went wrong sending your request. Please try again in a moment.'
      )
      return
    }

    setSubmitState('sent')
    setName('')
    setEmail('')
    setMessage('')
  }

  const showMemberCta = !authLoading && session !== null && isActive

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <span className="text-lg font-bold tracking-tight text-emerald-700">
            Fresno<span className="text-amber-600">Skillshare</span>
          </span>
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-900"
          >
            Member sign in
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-5 pb-20 pt-14 sm:pb-28 sm:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <HeartHandshake className="h-3.5 w-3.5" aria-hidden />
            Invite-only community co-op
          </span>

          {contentLoading ? (
            <div className="mt-7 animate-pulse space-y-4">
              <div className="h-12 w-4/5 rounded-2xl bg-stone-200 sm:h-14" />
              <div className="h-12 w-3/5 rounded-2xl bg-stone-200 sm:h-14" />
              <div className="h-5 w-full max-w-2xl rounded-full bg-stone-200" />
              <div className="h-5 w-2/3 max-w-xl rounded-full bg-stone-200" />
            </div>
          ) : (
            <>
              <h1 className="mt-7 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-balance text-stone-900 sm:text-5xl lg:text-6xl">
                {content.hero_heading}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-stone-600 sm:text-xl">
                {content.hero_subheading}
              </p>
            </>
          )}

          {contentError && (
            <p className="mt-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {contentError}
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {showMemberCta ? (
              <Link
                to="/feed"
                className="rounded-full bg-emerald-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                Go to the feed
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={scrollToJoin}
                  className="rounded-full bg-emerald-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  Request to join
                </button>
                <Link
                  to="/login"
                  className="rounded-full border border-stone-300 bg-white px-7 py-3.5 text-sm font-semibold text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-100"
                >
                  Member sign in
                </Link>
              </>
            )}
          </div>
        </section>

        {/* About */}
        <section className="mx-auto max-w-5xl px-5 py-10">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-amber-600">
              About the co-op
            </h2>
            {contentLoading ? (
              <div className="mt-5 animate-pulse space-y-3">
                <div className="h-5 w-full rounded-full bg-stone-200" />
                <div className="h-5 w-11/12 rounded-full bg-stone-200" />
                <div className="h-5 w-2/3 rounded-full bg-stone-200" />
              </div>
            ) : (
              <p className="mt-5 max-w-3xl text-lg leading-relaxed text-stone-600">{content.about}</p>
            )}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-5 py-10">
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">How it works</h2>
          <p className="mt-3 max-w-2xl text-stone-600">
            Five simple steps from neighbor to trading partner.
          </p>

          {contentLoading ? (
            <div className="mt-8 grid animate-pulse gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-28 rounded-2xl bg-stone-200" />
              ))}
            </div>
          ) : content.how_it_works.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-500">
              The steps are being written up right now. Check back soon.
            </p>
          ) : (
            <ol className="mt-8 grid gap-4 sm:grid-cols-2">
              {content.how_it_works.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-emerald-200"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                    {index + 1}
                  </span>
                  <p className="pt-1 leading-relaxed text-stone-700">{step}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Upcoming events */}
        {events.length > 0 && (
          <section className="mx-auto max-w-5xl px-5 py-10">
            <h2 className="text-3xl font-bold tracking-tight text-stone-900">Upcoming events</h2>
            <p className="mt-3 max-w-2xl text-stone-600">
              Our gatherings are open to the public. Come by, meet a few members, and see how the
              co-op works before you ask for an invite.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-lg font-bold tracking-tight text-stone-900">{event.title}</h3>
                  <p className="mt-2 flex items-start gap-2 text-sm text-stone-600">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    {formatEventRange(event.starts_at, event.ends_at)}
                  </p>
                  {event.location && (
                    <p className="mt-1.5 flex items-start gap-2 text-sm text-stone-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      {event.location}
                    </p>
                  )}
                  {event.notes && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-600">
                      {event.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Join request */}
        <section ref={joinRef} id="join" className="mx-auto max-w-5xl scroll-mt-24 px-5 py-16">
          <div className="grid gap-10 rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm sm:p-12 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-stone-900">Request to join</h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                Membership is invite-only, and we read every request. Tell us a little about what you
                can offer and what you are hoping to find. An admin will follow up by email.
              </p>
              <p className="mt-4 text-sm text-stone-500">
                Already invited? You can create your account from the{' '}
                <Link to="/login" className="font-medium text-emerald-700 underline underline-offset-2">
                  sign in page
                </Link>
                .
              </p>
            </div>

            <div>
              {submitState === 'sent' ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Sprout className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-emerald-800">
                    Request received
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-700">
                    Thanks for reaching out. An admin will review your request and email you when
                    there is news.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitState('idle')}
                    className="mt-6 rounded-full border border-emerald-300 bg-white px-5 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    Send another request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
                    <label htmlFor="join-website">Leave this field empty</label>
                    <input
                      id="join-website"
                      type="text"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label htmlFor="join-name" className="block text-sm font-medium text-stone-700">
                      Name
                    </label>
                    <input
                      id="join-name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={LIMITS.joinName}
                      autoComplete="name"
                      placeholder="Your name"
                      className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div>
                    <label htmlFor="join-email" className="block text-sm font-medium text-stone-700">
                      Email
                    </label>
                    <input
                      id="join-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      maxLength={LIMITS.email}
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div>
                    <label htmlFor="join-message" className="block text-sm font-medium text-stone-700">
                      Message <span className="font-normal text-stone-400">(optional)</span>
                    </label>
                    <textarea
                      id="join-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={4}
                      maxLength={LIMITS.joinMessage}
                      placeholder="What can you offer, and what are you looking for?"
                      className="mt-1.5 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  {submitError && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {submitError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitState === 'sending'}
                    className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {submitState === 'sending' ? 'Sending...' : 'Send request'}
                  </button>

                  <p className="text-center text-xs text-stone-400">
                    We only use your email to talk about your membership.
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-stone-500 sm:flex-row">
          <span className="font-semibold text-emerald-700">
            Fresno<span className="text-amber-600">Skillshare</span>
          </span>
          <span>Neighbors helping neighbors in Fresno, CA.</span>
          <span className="flex flex-wrap justify-center gap-5">
            <Link to="/privacy" className="transition-colors hover:text-stone-800">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-stone-800">
              Terms
            </Link>
            <Link to="/login" className="transition-colors hover:text-stone-800">
              Member sign in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
