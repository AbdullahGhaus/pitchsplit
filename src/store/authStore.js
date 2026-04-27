import { create } from 'zustand'
import { attemptAdminLogin } from '../services/adminAuth'

const SESSION_KEY = 'pitchsplit_admin_session'

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return { isAuthed: false, admin: null }
    const admin = JSON.parse(raw)
    if (admin?.adminId && admin?.username) {
      return { isAuthed: true, admin }
    }
  } catch {
    /* ignore */
  }
  return { isAuthed: false, admin: null }
}

const initial = loadSession()

export const useAuthStore = create((set) => ({
  isAuthed: initial.isAuthed,
  admin: initial.admin,

  /**
   * @returns {Promise<{ ok: boolean, error?: string | null }>}
   */
  login: async (username, password) => {
    const result = await attemptAdminLogin(username, password)
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.error === null || result.error === undefined
            ? 'Invalid username or password.'
            : result.error,
      }
    }

    const session = {
      adminId: result.adminId,
      username: String(username).trim(),
    }

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      /* ignore */
    }

    set({ isAuthed: true, admin: session })
    return { ok: true }
  },

  logout: () => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    set({ isAuthed: false, admin: null })
  },
}))
