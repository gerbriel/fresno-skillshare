import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { LIMITS } from '../../lib/validate'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/format'
import type { Newsletter } from '../../lib/types'
import { EmptyBlock, ErrorBlock, Feedback, LoadingBlock, Pill, SectionHeader } from './shared'
import { buttonClass, cardClass, describeError, inputClass, labelClass } from './helpers'

export default function NewsletterTab() {
  const { profile: me } = useAuth()

  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [draftId, setDraftId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollIds, setPollIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('newsletters')
      .select('*')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError('We could not load your newsletters. Please try again.')
      setLoading(false)
      return
    }

    const rows = (data ?? []) as Newsletter[]
    setNewsletters(rows)

    // Note which newsletters carry a poll, to badge them in the lists.
    if (rows.length > 0) {
      const { data: pollRows } = await supabase
        .from('polls')
        .select('newsletter_id')
        .in('newsletter_id', rows.map((row) => row.id))
      setPollIds(
        new Set((pollRows ?? []).map((row) => (row as { newsletter_id: string }).newsletter_id))
      )
    } else {
      setPollIds(new Set())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const drafts = useMemo(() => newsletters.filter((item) => item.status === 'draft'), [newsletters])
  const sent = useMemo(() => newsletters.filter((item) => item.status === 'sent'), [newsletters])

  const clearComposer = () => {
    setDraftId(null)
    setSubject('')
    setBody('')
    setPollQuestion('')
    setPollOptions(['', ''])
  }

  // Persist the poll for a draft newsletter. Empty question removes it.
  const savePoll = async (newsletterId: string): Promise<string | null> => {
    const options = pollOptions.map((option) => option.trim()).filter((option) => option.length > 0)
    if (pollQuestion.trim() && options.length < 2) {
      return 'A poll needs a question and at least two options.'
    }
    const { error: pollError } = await supabase.rpc('upsert_newsletter_poll', {
      p_newsletter_id: newsletterId,
      p_question: pollQuestion.trim(),
      p_options: options,
    })
    return pollError ? describeError(pollError, 'We could not save the poll.') : null
  }

  const resetComposer = () => {
    clearComposer()
    setFeedback(null)
  }

  const saveDraft = async () => {
    const trimmedSubject = subject.trim()
    const trimmedBody = body.trim()

    if (!trimmedSubject || !trimmedBody) {
      setFeedback({ tone: 'error', message: 'Add a subject and a message before saving.' })
      return
    }

    setSaving(true)
    setFeedback(null)

    if (draftId) {
      const { error: updateError } = await supabase
        .from('newsletters')
        .update({ subject: trimmedSubject, body: trimmedBody })
        .eq('id', draftId)

      if (updateError) {
        setFeedback({ tone: 'error', message: describeError(updateError, 'We could not save that draft.') })
        setSaving(false)
        return
      }

      const pollError = await savePoll(draftId)
      if (pollError) {
        setFeedback({ tone: 'error', message: pollError })
        setSaving(false)
        return
      }

      setNewsletters((current) =>
        current.map((item) =>
          item.id === draftId ? { ...item, subject: trimmedSubject, body: trimmedBody } : item
        )
      )
      setPollIds((current) => {
        const next = new Set(current)
        if (pollQuestion.trim()) next.add(draftId)
        else next.delete(draftId)
        return next
      })
      setFeedback({ tone: 'success', message: 'Draft saved.' })
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('newsletters')
      .insert({ subject: trimmedSubject, body: trimmedBody, author_id: me?.id ?? null })
      .select('*')
      .single()

    if (insertError) {
      setFeedback({ tone: 'error', message: describeError(insertError, 'We could not save that draft.') })
      setSaving(false)
      return
    }

    const created = data as Newsletter
    const pollError = await savePoll(created.id)
    if (pollError) {
      // The draft saved; only the poll failed. Keep the draft and say so.
      setNewsletters((current) => [created, ...current])
      setDraftId(created.id)
      setFeedback({ tone: 'error', message: pollError })
      setSaving(false)
      return
    }

    setNewsletters((current) => [created, ...current])
    setDraftId(created.id)
    if (pollQuestion.trim()) setPollIds((current) => new Set(current).add(created.id))
    setFeedback({ tone: 'success', message: 'Draft saved. Send it whenever you are ready.' })
    setSaving(false)
  }

  const sendNewsletter = async (newsletter: Newsletter) => {
    setSendingId(newsletter.id)
    setFeedback(null)

    const countQuery = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active')
    const { count, error: countError } = me
      ? await countQuery.neq('id', me.id)
      : await countQuery

    if (countError) {
      setFeedback({
        tone: 'error',
        message: 'We could not check how many members would receive this. Please try again.',
      })
      setSendingId(null)
      return
    }

    const recipients = count ?? 0
    if (recipients === 0) {
      setFeedback({
        tone: 'error',
        message: 'There are no other active members to send this to yet.',
      })
      setSendingId(null)
      return
    }

    const ok = window.confirm(
      `Send "${newsletter.subject}" to ${recipients} active ${
        recipients === 1 ? 'member' : 'members'
      }? Each one gets it as a private thread in Messages. This cannot be undone.`
    )
    if (!ok) {
      setSendingId(null)
      return
    }

    const { data, error: rpcError } = await supabase.rpc('send_newsletter', {
      p_newsletter_id: newsletter.id,
    })

    if (rpcError) {
      setFeedback({ tone: 'error', message: describeError(rpcError, 'We could not send that newsletter.') })
      setSendingId(null)
      return
    }

    const payload = data as { sent?: number } | null
    const delivered = payload?.sent ?? recipients

    setFeedback({
      tone: 'success',
      message: `Sent. Delivered to ${delivered} ${delivered === 1 ? 'member' : 'members'}. Replies will land in your Messages.`,
    })
    if (draftId === newsletter.id) clearComposer()
    setSendingId(null)
    await load()
  }

  const deleteNewsletter = async (newsletter: Newsletter) => {
    const ok = window.confirm(`Delete the draft "${newsletter.subject}"?`)
    if (!ok) return

    setBusyId(newsletter.id)
    setFeedback(null)
    const { error: deleteError } = await supabase.from('newsletters').delete().eq('id', newsletter.id)

    if (deleteError) {
      setFeedback({ tone: 'error', message: describeError(deleteError, 'We could not delete that draft.') })
      setBusyId(null)
      return
    }

    setNewsletters((current) => current.filter((item) => item.id !== newsletter.id))
    if (draftId === newsletter.id) resetComposer()
    setBusyId(null)
  }

  const editDraft = async (newsletter: Newsletter) => {
    setDraftId(newsletter.id)
    setSubject(newsletter.subject)
    setBody(newsletter.body)
    setFeedback(null)

    // Load any attached poll into the composer.
    const { data: poll } = await supabase
      .from('polls')
      .select('id, question')
      .eq('newsletter_id', newsletter.id)
      .maybeSingle()
    if (poll) {
      const { data: options } = await supabase
        .from('poll_options')
        .select('label')
        .eq('poll_id', (poll as { id: string }).id)
        .order('position', { ascending: true })
      setPollQuestion((poll as { question: string }).question)
      const labels = (options ?? []).map((option) => (option as { label: string }).label)
      setPollOptions(labels.length >= 2 ? labels : [...labels, '', ''].slice(0, 2))
    } else {
      setPollQuestion('')
      setPollOptions(['', ''])
    }
  }

  const setOption = (index: number, value: string) => {
    setPollOptions((current) => current.map((option, i) => (i === index ? value : option)))
  }
  const addOption = () => setPollOptions((current) => (current.length >= 8 ? current : [...current, '']))
  const removeOption = (index: number) =>
    setPollOptions((current) =>
      current.length <= 2 ? current : current.filter((_, i) => i !== index)
    )

  const composerDraft = draftId ? newsletters.find((item) => item.id === draftId) ?? null : null
  const sendingComposer = composerDraft !== null && sendingId === composerDraft.id

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Newsletter"
        description="Write once, deliver to every active member."
      />

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-800">
        <p className="font-semibold">How delivery works</p>
        <p className="mt-1">
          Delivery is in-app, not email. Every active member receives the newsletter as a private
          thread in Messages, and anything they write back comes to you as a normal conversation.
        </p>
      </div>

      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-stone-900">
            {composerDraft ? 'Editing draft' : 'New newsletter'}
          </h3>
          {composerDraft && (
            <button type="button" onClick={resetComposer} className={buttonClass('secondary', 'sm')}>
              Start a new one
            </button>
          )}
        </div>

        <div>
          <label htmlFor="newsletter-subject" className={labelClass}>
            Subject
          </label>
          <input
            id="newsletter-subject"
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={LIMITS.newsletterSubject}
            placeholder="This month at Fresno Skillshare"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="newsletter-body" className={labelClass}>
            Message
          </label>
          <textarea
            id="newsletter-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            maxLength={LIMITS.newsletterBody}
            placeholder="What is happening in the co-op this month?"
            className={`mt-1.5 resize-y ${inputClass}`}
          />
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={labelClass}>Poll (optional)</span>
            <span className="text-xs text-stone-400">Anonymous, results shown to everyone</span>
          </div>
          <input
            type="text"
            value={pollQuestion}
            onChange={(event) => setPollQuestion(event.target.value)}
            maxLength={200}
            placeholder="Ask a question, e.g. Which Saturday works for the swap meet?"
            className={`mt-2 ${inputClass}`}
          />
          {pollQuestion.trim() && (
            <div className="mt-3 space-y-2">
              {pollOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(event) => setOption(index, event.target.value)}
                    maxLength={100}
                    placeholder={`Option ${index + 1}`}
                    className={inputClass}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="shrink-0 rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
                      aria-label={`Remove option ${index + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 8 && (
                <button type="button" onClick={addOption} className={buttonClass('secondary', 'sm')}>
                  Add option
                </button>
              )}
              <p className="text-xs text-stone-400">
                The poll appears under this newsletter on the Co-op news page once you send it.
              </p>
            </div>
          )}
        </div>

        {feedback && <Feedback tone={feedback.tone} message={feedback.message} />}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving || sendingComposer}
            className={buttonClass('secondary')}
          >
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          {composerDraft && (
            <button
              type="button"
              onClick={() => void sendNewsletter(composerDraft)}
              disabled={saving || sendingComposer}
              className={buttonClass('primary')}
            >
              {sendingComposer ? 'Sending...' : 'Send to all members'}
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingBlock rows={3} />
      ) : (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Drafts</h3>
            {drafts.length === 0 ? (
              <EmptyBlock>No drafts saved. Anything you write above shows up here once saved.</EmptyBlock>
            ) : (
              <ul className="space-y-3">
                {drafts.map((newsletter) => {
                  const busy = busyId === newsletter.id
                  const sending = sendingId === newsletter.id
                  return (
                    <li
                      key={newsletter.id}
                      className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-stone-900">{newsletter.subject}</p>
                          <Pill tone="amber">Draft</Pill>
                          {pollIds.has(newsletter.id) && <Pill tone="emerald">Poll</Pill>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-stone-500">{newsletter.body}</p>
                        <p className="mt-1 text-xs text-stone-400">
                          Started {formatDate(newsletter.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button
                          type="button"
                          disabled={busy || sending}
                          onClick={() => void editDraft(newsletter)}
                          className={buttonClass('secondary', 'sm')}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy || sending}
                          onClick={() => void sendNewsletter(newsletter)}
                          className={buttonClass('primary', 'sm')}
                        >
                          {sending ? 'Sending...' : 'Send'}
                        </button>
                        <button
                          type="button"
                          disabled={busy || sending}
                          onClick={() => void deleteNewsletter(newsletter)}
                          className={buttonClass('danger', 'sm')}
                        >
                          {busy ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Sent</h3>
            {sent.length === 0 ? (
              <EmptyBlock>Nothing sent yet.</EmptyBlock>
            ) : (
              <ul className="space-y-3">
                {sent.map((newsletter) => (
                  <li
                    key={newsletter.id}
                    className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-stone-900">{newsletter.subject}</p>
                        <Pill tone="emerald">Sent</Pill>
                        {pollIds.has(newsletter.id) && <Pill tone="stone">Poll</Pill>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-stone-500">{newsletter.body}</p>
                    </div>
                    <div className="text-left text-xs text-stone-400 sm:text-right">
                      <p>Sent {newsletter.sent_at ? formatDate(newsletter.sent_at) : 'recently'}</p>
                      <p>
                        Delivered to {newsletter.recipient_count}{' '}
                        {newsletter.recipient_count === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
