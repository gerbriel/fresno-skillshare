import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

export interface LiveTable {
  table: string
  /** PostgREST-style row filter, e.g. `id=eq.${userId}`. */
  filter?: string
}

/**
 * Re-runs `onChange` whenever any of `tables` changes in the database, so a
 * page reflects other people's writes without a refresh.
 *
 * Realtime honors RLS, so a subscriber is only sent changes to rows it is
 * already allowed to read.
 *
 * `channelName` must be unique per mounted component; two channels sharing a
 * name collide on the server.
 */
export function useLive(channelName: string, tables: LiveTable[], onChange: () => void) {
  const handler = useRef(onChange)
  useEffect(() => {
    handler.current = onChange
  }, [onChange])

  // Serialized so callers can pass an inline array without resubscribing
  // on every render.
  const spec = JSON.stringify(tables)

  useEffect(() => {
    const parsed = JSON.parse(spec) as LiveTable[]
    if (parsed.length === 0) return

    // One write often fans out into several row events (a trade plus its
    // tasks). Debounce so that costs one refetch, not five.
    let timer: ReturnType<typeof setTimeout> | undefined
    const ping = () => {
      clearTimeout(timer)
      timer = setTimeout(() => handler.current(), 150)
    }

    const channel = supabase.channel(channelName)
    for (const entry of parsed) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: entry.table,
          ...(entry.filter ? { filter: entry.filter } : {}),
        },
        ping
      )
    }
    channel.subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [channelName, spec])
}
