import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { deleteMatch, listMatches } from '../services/supabase'
import { formatMoney } from '../utils/money'
import { formatMatchDateShort } from '../utils/date'
import { copyToClipboard } from '../utils/clipboard'
import { useToastStore } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import { Spinner } from '../components/Spinner'

function publicMatchUrl(id) {
  return `${window.location.origin}/match/${id}`
}

export default function AdminDashboard() {
  const logout = useAuthStore((s) => s.logout)
  const admin = useAuthStore((s) => s.admin)
  const show = useToastStore((s) => s.show)
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function loadMatches() {
    setError(null)
    const rows = await listMatches()
    setMatches(rows)
  }

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          await loadMatches()
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Could not load matches.')
          }
        }
      })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onDeleteMatch(id) {
    if (
      !window.confirm(
        'Delete this match and all player rows for it? This cannot be undone.',
      )
    ) {
      return
    }
    setDeletingId(id)
    try {
      await deleteMatch(id)
      show('Match deleted.', 'success')
      await loadMatches()
    } catch (e) {
      show(
        e instanceof Error ? e.message : 'Could not delete match.',
        'error',
      )
    } finally {
      setDeletingId(null)
    }
  }

  async function copyLink(id) {
    const ok = await copyToClipboard(publicMatchUrl(id))
    show(
      ok ? 'Public link copied.' : 'Could not copy link.',
      ok ? 'success' : 'error',
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link
              to="/admin"
              className="shrink-0 rounded-lg outline-none ring-emerald-600/0 focus-visible:ring-2 focus-visible:ring-emerald-600/40"
            >
              <PitchSplitWordmark size="sm" iconClassName="h-9 w-9" />
            </Link>
            {admin?.username && (
              <div className="hidden min-w-0 text-left sm:block">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Signed in
                </p>
                <p className="truncate text-sm font-semibold text-slate-800">
                  {admin.username}
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Home
            </Link>
            <button
              type="button"
              onClick={() => {
                logout()
                show('Signed out.', 'info')
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Matches
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              All match days, amounts in PKR, sorted by date (newest first).
            </p>
          </div>
          <Link
            to="/admin/create"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Create new match
          </Link>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {matches === null && (
          <div className="mt-10 flex items-center justify-center gap-3 text-sm text-slate-600">
            <Spinner />
            Loading matches…
          </div>
        )}

        {matches && matches.length === 0 && !error && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-900">No matches yet</p>
            <p className="mt-2 text-sm text-slate-600">
              Create a match day to generate a shareable payment link.
            </p>
            <div className="mt-6">
              <Link
                to="/admin/create"
                className="inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Create new match
              </Link>
            </div>
          </div>
        )}

        {matches && matches.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90">
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Match date
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Paid by
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Total
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Per head
                    </th>
                    {/* <th className="px-4 py-3 font-semibold text-slate-700">
                      Recorded
                    </th> */}
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matches.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {formatMatchDateShort(m.match_date)}
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-slate-800">
                        {m.paid_by != null && String(m.paid_by).trim() !== ''
                          ? String(m.paid_by).trim()
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-800">
                        {formatMoney(m.total_amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-emerald-900">
                        {formatMoney(m.per_head)}
                      </td>
                      {/* <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {new Date(m.created_at).toLocaleString()}
                      </td> */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                            to={`/admin/match/${m.id}`}
                          >
                            Details
                          </Link>
                          <Link
                            className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                            to={`/admin/match/${m.id}/edit`}
                          >
                            Edit
                          </Link>
                          {/* <Link
                            className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                            to={`/match/${m.id}`}
                          >
                            Public
                          </Link> */}

                          <button
                            type="button"
                            onClick={() => onDeleteMatch(m.id)}
                            disabled={deletingId === m.id}
                            className="inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === m.id ? 'Deleting…' : 'Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyLink(m.id)}
                            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                          >
                            Copy link
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-2 text-xs text-slate-500">
              Public URL pattern:{' '}
              <span className="font-mono text-slate-700">
                {`${window.location.origin}/match/<id>`}
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
