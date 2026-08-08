import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/* Shared chrome and typography for the public legal pages
   (/privacy and /terms). Content lives in src/pages/Privacy.tsx
   and src/pages/Terms.tsx; contact details live here so both
   documents stay in sync. */

export const CONTACT_EMAIL = 'gabrielriosemail@gmail.com'
export const LEGAL_UPDATED = 'August 8, 2026'

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-stone-900">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-stone-600">{children}</div>
    </section>
  )
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
}

export function ContactEmail() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-emerald-700 underline underline-offset-2"
    >
      {CONTACT_EMAIL}
    </a>
  )
}

interface LegalPageProps {
  title: string
  intro: string
  children: ReactNode
}

export default function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-emerald-700 transition-opacity hover:opacity-80"
          >
            Fresno<span className="text-amber-600">Skillshare</span>
          </Link>
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-900"
          >
            Member sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-stone-400">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-5 leading-relaxed text-stone-600">{intro}</p>
        {children}
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-stone-500 sm:flex-row">
          <span className="font-semibold text-emerald-700">
            Fresno<span className="text-amber-600">Skillshare</span>
          </span>
          <span className="flex gap-5">
            <Link to="/privacy" className="transition-colors hover:text-stone-800">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-stone-800">
              Terms
            </Link>
            <Link to="/" className="transition-colors hover:text-stone-800">
              Home
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
