import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/**
 * Wraps admin-only UI. Unauthenticated users are redirected to `/login`.
 * Do not use for `/match/:id` or other public pages — those must stay outside
 * this wrapper so shareable links work without a session.
 */
export function ProtectedRoute({ children }) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const location = useLocation()

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
