import { getSupabaseClient } from '../lib/supabaseClient'

/**
 * Verify credentials: Supabase RPC `login_admin` when configured, otherwise local dev mock.
 * @returns {Promise<{ ok: boolean, adminId?: string, error?: string | null }>}
 */
export async function attemptAdminLogin(username, password) {
  const u = String(username).trim()
  const p = String(password)

  if (!u || !p) {
    return { ok: false, error: 'Enter username and password.' }
  }

  const client = getSupabaseClient()

  if (client) {
    const { data, error } = await client.rpc('login_admin', {
      p_username: u,
      p_password: p,
    })

    if (error) {
      return {
        ok: false,
        error: error.message || 'Sign-in failed. Check Supabase configuration.',
      }
    }

    if (data) {
      return { ok: true, adminId: data }
    }

    return { ok: false, error: null }
  }

  // Local dev without Supabase env — optional mock (disable in production by setting env)
  if (u === 'admin' && p === 'admin') {
    return { ok: true, adminId: 'local-dev' }
  }

  return { ok: false, error: null }
}

export { isSupabaseConfigured } from '../lib/supabaseClient'
