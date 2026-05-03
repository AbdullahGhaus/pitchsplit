import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { Spinner } from '../components/Spinner'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import {
  listAdminPaymentDirectory,
  normalizePaymentMethod,
  updateAdminPaymentMethod,
} from '../services/adminDirectory'

/** Read-only heading: optional display_name, else username. */
function headingLabel(row) {
  const d = row.display_name && String(row.display_name).trim()
  return d || row.username || '—'
}

export default function AdminDirectory() {
  const show = useToastStore((s) => s.show)
  const logout = useAuthStore((s) => s.logout)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])

  const [editingId, setEditingId] = useState(null)
  const [editBank, setEditBank] = useState('')
  const [editAccount, setEditAccount] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listAdminPaymentDirectory()
      setRows(list)
    } catch (e) {
      setRows([])
      show(e instanceof Error ? e.message : 'Could not load admins.', 'error')
    } finally {
      setLoading(false)
    }
  }, [show])

  useEffect(() => {
    refresh()
  }, [refresh])

  function startEdit(row) {
    const pm = normalizePaymentMethod(row.payment_method)
    setEditingId(row.id)
    setEditBank(pm.bank)
    setEditAccount(pm.account_number)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBank('')
    setEditAccount('')
  }

  async function saveEdit() {
    if (!editingId) return
    setSaveBusy(true)
    try {
      await updateAdminPaymentMethod(editingId, {
        bank: editBank,
        account_number: editAccount,
      })
      show('Payment details saved.', 'success')
      cancelEdit()
      await refresh()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not save.', 'error')
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
          <Link
            to="/admin"
            className="shrink-0 rounded-lg outline-none ring-emerald-600/0 focus-visible:ring-2 focus-visible:ring-emerald-600/40"
          >
            <PitchSplitWordmark size="sm" iconClassName="h-9 w-9" />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/squad-defaults"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Squad defaults
            </Link>
            <Link
              to="/admin"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Dashboard
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

      <main className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Admin payment details
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Edit <span className="font-mono text-xs">payment_method</span> for each admin:{' '}
          <span className="font-mono text-xs">bank</span> and{' '}
          <span className="font-mono text-xs">account_number</span>. Usernames are shown for reference only.
        </p>

        {loading ? (
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-600">
            <Spinner />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600 shadow-sm">
            No admins returned. Run{' '}
            <span className="font-mono text-xs text-slate-800">admins_directory_rpcs.sql</span> in Supabase if RPCs are
            missing.
          </p>
        ) : (
          <div className="mt-8 space-y-4">
            {rows.map((row) => {
              const pm = normalizePaymentMethod(row.payment_method)
              const isEditing = editingId === row.id
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  {!isEditing ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{headingLabel(row)}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{row.username}</p>
                        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bank</dt>
                            <dd className="mt-1 text-slate-800">{pm.bank || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Account number
                            </dt>
                            <dd className="mt-1 font-mono text-slate-800">{pm.account_number || '—'}</dd>
                          </div>
                        </dl>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        Edit payment
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{headingLabel(row)}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{row.username}</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-slate-800">
                          Bank
                          <input
                            type="text"
                            value={editBank}
                            onChange={(e) => setEditBank(e.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                            placeholder="e.g. Allied Bank"
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-800">
                          Account number
                          <input
                            type="text"
                            value={editAccount}
                            onChange={(e) => setEditAccount(e.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saveBusy}
                          onClick={() => saveEdit()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {saveBusy ? (
                            <>
                              <Spinner className="size-4 border-white/40 border-t-white" />
                              Saving…
                            </>
                          ) : (
                            'Save payment details'
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={saveBusy}
                          onClick={() => cancelEdit()}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
