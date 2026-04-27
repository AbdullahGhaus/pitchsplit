import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'

export default function AdminLogin() {
  const login = useAuthStore((s) => s.login)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const show = useToastStore((s) => s.show)
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/admin'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const supabaseReady = isSupabaseConfigured()

  if (isAuthed) {
    return <Navigate to={from} replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await login(username, password)
      if (res.ok) {
        show('Welcome back.', 'success')
        navigate(from, { replace: true })
      } else {
        show(res.error || 'Invalid username or password.', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <PitchSplitWordmark size="md" iconClassName="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Organise matches and share PitchSplit payment links with your squad.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70"
        >
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-emerald-600/0 transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-600/15"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-emerald-600/0 transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-600/15"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-700/10 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          {supabaseReady ? (
            <p className="mt-4 text-center text-xs text-slate-500">
              Sign-in is checked against your Supabase{' '}
              <span className="font-mono">admins</span> table.
            </p>
          ) : (
            <p className="mt-4 text-center text-xs text-slate-500">
              Dev mode (no <span className="font-mono">VITE_SUPABASE_*</span> env):{' '}
              <span className="font-mono">admin</span> /{' '}
              <span className="font-mono">admin</span>
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          <Link className="font-semibold text-emerald-700 hover:text-emerald-800" to="/">
            ← Back home
          </Link>
        </p>
      </div>
    </div>
  )
}
