import { createClient } from '@supabase/supabase-js'

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null

/**
 * Shared Supabase browser client (anon key). Returns null if env is not set.
 */
export function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  return client
}

export function isSupabaseConfigured() {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.VITE_SUPABASE_ANON_KEY),
  )
}
