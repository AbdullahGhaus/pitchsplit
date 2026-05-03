import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { bulkSetPlayersPaid, getMatch, updatePlayerPayment } from '../services/supabase'
import {
  fetchPaymentMethodForPaidByLabel,
  normalizePaymentMethod,
} from '../services/adminDirectory'
import { copyToClipboard } from '../utils/clipboard'
import { formatMoney } from '../utils/money'
import { costBreakdownLines } from '../utils/matchCostBreakdown'
import { getMatchHeading } from '../utils/date'
import { useToastStore } from '../store/toastStore'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { Spinner } from '../components/Spinner'

function CopyClipboardIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9 9 0 019 9zm0 0h3.375c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125h-3.75M9.75 9.75h.008v.008H9.75V9.75z"
      />
    </svg>
  )
}

export default function MatchPublic() {
  const { id } = useParams()
  const show = useToastStore((s) => s.show)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [payerPm, setPayerPm] = useState(() => normalizePaymentMethod({}))
  const [payerPmLoading, setPayerPmLoading] = useState(false)
  const [copyAccountBusy, setCopyAccountBusy] = useState(false)

  /** Unpaid-only selection for bulk “Mark as paid”. */
  const [selectedUnpaidIds, setSelectedUnpaidIds] = useState(() => new Set())
  const bulkHeaderRef = useRef(null)

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        if (!id) return
        try {
          setLoading(true)
          setError(null)
          const res = await getMatch(id)
          if (!cancelled) setData(res)
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Failed to load match.')
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    const raw = data?.match?.paid_by
    const label = raw != null ? String(raw).trim() : ''
    if (!label) {
      setPayerPm(normalizePaymentMethod({}))
      setPayerPmLoading(false)
      return
    }
    let cancelled = false
    setPayerPmLoading(true)
      ; (async () => {
        try {
          const pm = await fetchPaymentMethodForPaidByLabel(label)
          if (!cancelled) setPayerPm(pm)
        } catch {
          if (!cancelled) setPayerPm(normalizePaymentMethod({}))
        } finally {
          if (!cancelled) setPayerPmLoading(false)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [data?.match?.paid_by])

  const share = useMemo(() => {
    if (!data?.match || !data.players?.length) return null
    const per = data.match.total_amount / data.players.length
    return Number.isFinite(per) ? per : null
  }, [data])

  const paidCount = data?.players?.filter((p) => p.has_paid).length ?? 0
  const totalPlayers = data?.players?.length ?? 0

  const unpaidPlayers = useMemo(
    () =>
      data?.players
        ? data.players.filter((p) => !p.has_paid)
        : [],
    [data?.players],
  )

  const unpaidIds = useMemo(() => unpaidPlayers.map((p) => p.id), [unpaidPlayers])

  /** Drop stale selection when unpaid set changes after refresh */
  useEffect(() => {
    const unpaidSet = new Set(unpaidIds)
    setSelectedUnpaidIds((prev) => {
      let changed = false
      const next = new Set()
      for (const pid of prev) {
        if (unpaidSet.has(pid)) next.add(pid)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [unpaidIds])

  const numUnpaid = unpaidPlayers.length
  const selCount = unpaidIds.reduce(
    (n, pid) => n + (selectedUnpaidIds.has(pid) ? 1 : 0),
    0,
  )

  /** PKR owed for bulk-selected unpaid rows (same per-head share for each). */
  const bulkSelectionTotal = useMemo(() => {
    const n = selectedUnpaidIds.size
    if (share == null || n === 0) return null
    const t = n * share
    return Number.isFinite(t) ? t : null
  }, [share, selectedUnpaidIds])

  const allUnpaidSelected = numUnpaid > 0 && selCount === numUnpaid
  const someSelected = selCount > 0 && !allUnpaidSelected

  useEffect(() => {
    const el = bulkHeaderRef.current
    if (el) el.indeterminate = someSelected && numUnpaid > 0
  }, [someSelected, numUnpaid])

  function toggleBulkSelect(pid, checked) {
    setSelectedUnpaidIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(pid)
      else next.delete(pid)
      return next
    })
  }

  function toggleSelectAllUnpaid() {
    if (numUnpaid === 0) return
    if (allUnpaidSelected) {
      setSelectedUnpaidIds(new Set())
      return
    }
    setSelectedUnpaidIds(new Set(unpaidIds))
  }

  function clearBulkSelection() {
    setSelectedUnpaidIds(new Set())
  }

  async function reloadMatch() {
    if (!id) return
    const res = await getMatch(id)
    setData(res)
  }

  async function togglePaid(playerId) {
    if (!id) return
    setBusyId(playerId)
    try {
      await updatePlayerPayment(id, playerId)
      await reloadMatch()
      show('Payment status updated.', 'success')
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update payment.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function copyPayerAccountNumber() {
    const n = payerPm.account_number?.trim()
    if (!n) return
    setCopyAccountBusy(true)
    try {
      const ok = await copyToClipboard(n)
      show(
        ok ? 'Account number copied to clipboard.' : 'Could not copy.',
        ok ? 'success' : 'error',
      )
    } finally {
      setCopyAccountBusy(false)
    }
  }

  async function markSelectedPaid() {
    if (!id || selectedUnpaidIds.size === 0) return
    setBulkBusy(true)
    try {
      const ids = [...selectedUnpaidIds]
      await bulkSetPlayersPaid(id, ids, true)
      await reloadMatch()
      setSelectedUnpaidIds(new Set())
      show(ids.length === 1 ? 'Marked paid.' : `Marked ${ids.length} players paid.`, 'success')
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update payments.', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-700 shadow-sm">
          <Spinner />
          Loading match…
        </div>
      </div>
    )
  }

  if (error || !data?.match) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-12">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Match not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'This link may be invalid or the match was removed.'}
          </p>
          <Link
            className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            to="/"
          >
            Go home
          </Link>
        </div>
      </div>
    )
  }

  const { match, players } = data
  const heading = getMatchHeading(match)
  const costLines = costBreakdownLines(match)
  const paymentsLocked = Boolean(match.payments_locked)
  const paidByLabel =
    match.paid_by != null && String(match.paid_by).trim() !== ''
      ? String(match.paid_by).trim()
      : ''
  const showPayerPaymentBlock =
    Boolean(paidByLabel) &&
    (payerPmLoading || Boolean(payerPm.bank) || Boolean(payerPm.account_number))

  const selectionPaused = bulkBusy || busyId !== null

  return (
    <div className="min-h-screen bg-slate-100 pb-28">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <PitchSplitWordmark size="sm" iconClassName="h-9 w-9 shrink-0" />

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Squad payments
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {heading}
          </h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Match total
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {formatMoney(match.total_amount)}
            </p>
            {costLines && (
              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                {costLines.map(({ label, value }) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-slate-500">{label}</span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-800">
                      {formatMoney(value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!costLines &&
              match.costs &&
              typeof match.costs === 'object' &&
              Number(match.total_amount) > 0 && (
                <p className="mt-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
                  Line-item costs were not recorded for this match (e.g. older
                  data).
                </p>

              )}

          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Per player share
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-800">
              {share === null ? '—' : formatMoney(share)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Collection progress
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {paidCount}
              <span className="text-lg font-semibold text-slate-400">
                {' '}
                / {totalPlayers}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {paymentsLocked ? 'complete — edits locked on this page' : 'players marked paid'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white px-4 py-4 text-sm shadow-sm flex items-center justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
            <span className="text-slate-500">Paid by</span>
            <span className="font-medium text-slate-900">
              {paidByLabel || '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {showPayerPaymentBlock && (
              <div className="flex min-h-9 min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 text-sm sm:max-w-[min(100%,28rem)]">
                {payerPmLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Spinner />
                    Loading…
                  </div>
                ) : (
                  <>
                    {String(payerPm.account_number ?? '').trim() ? (
                      <div className="flex min-w-0 max-w-full items-center gap-3">
                        <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
                          <span className="w-full max-w-full truncate text-[10px] text-slate-600 leading-snug">
                            {payerPm.bank?.trim() ? payerPm.bank.trim() : '—'}
                          </span>
                          <span className="w-full break-all font-mono text-[10px] text-slate-600 leading-snug tabular-nums text-slate-900">
                            {String(payerPm.account_number).trim()}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={copyAccountBusy}
                          onClick={() => copyPayerAccountNumber()}
                          title="Copy account number"
                          aria-label="Copy account number"
                          className="inline-flex size-10 shrink-0 items-center justify-center self-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copyAccountBusy ? (
                            <Spinner className="size-4 border-slate-300 border-t-slate-700" />
                          ) : (
                            <CopyClipboardIcon className="size-5 -mt-1" />
                          )}
                        </button>
                      </div>
                    ) : payerPm.bank?.trim() ? (
                      <span className="truncate text-[10px]">
                        {payerPm.bank.trim()}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {paymentsLocked ? (
            <>
              <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Payments complete
                </p>
                <h2 className="mt-1 text-lg font-bold text-emerald-950">
                  All payments are done
                </h2>
                <p className="mt-2 text-sm text-emerald-900/85">
                  This match is settled on the squad link. Payment changes here are locked so the roster stays tidy. If
                  something needs correcting, ask your organiser to unlock updates from their admin dashboard.
                </p>
                {paidCount < totalPlayers && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-medium text-amber-950">
                    Squad data looks inconsistent (not everyone is marked paid yet the page is locked). Your organiser can
                    unlock or fix this from the admin dashboard.
                  </p>
                )}
              </div>
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Who has paid ({paidCount}/{totalPlayers})
                </h3>
              </div>
              <ul className="divide-y divide-slate-100 px-5 py-2">
                {players.filter((p) => p.has_paid).length === 0 ? (
                  <li className="py-10 text-center text-sm text-slate-500">
                    No players are listed as paid yet. Ask your organiser if this is unexpected.
                  </li>
                ) : (
                  players
                    .filter((p) => p.has_paid)
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 py-3 sm:py-3.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <PlayerAvatar name={p.name} size="sm" />
                          <span className="truncate font-medium text-slate-900">{p.name}</span>
                        </div>
                        <span className="shrink-0 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200/80">
                          Paid
                        </span>
                      </li>
                    ))
                )}
              </ul>
            </>
          ) : (
            <>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Squad & payments</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Select unpaid rows to mark several as paid from the floating button —
                  or use Mark as paid on each row. Changes sync for everyone on this link.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 px-5 py-2.5 text-xs">
                <button
                  type="button"
                  disabled={selectionPaused || numUnpaid === 0}
                  onClick={() =>
                    selectedUnpaidIds.size === 0
                      ? setSelectedUnpaidIds(new Set(unpaidIds))
                      : clearBulkSelection()
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedUnpaidIds.size === 0 ? 'Select all unpaid' : 'Deselect all'}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90">
                      <th className="w-12 px-3 py-3 text-center font-semibold text-slate-700">
                        <input
                          ref={bulkHeaderRef}
                          type="checkbox"
                          aria-label={
                            numUnpaid === 0
                              ? 'No unpaid players'
                              : allUnpaidSelected
                                ? 'Deselect all unpaid'
                                : 'Select all unpaid'
                          }
                          disabled={selectionPaused || numUnpaid === 0}
                          checked={
                            numUnpaid > 0 && allUnpaidSelected
                          }
                          onChange={() => toggleSelectAllUnpaid()}
                          className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                        />
                      </th>
                      <th className="px-5 py-3 font-semibold text-slate-700">Player</th>
                      <th className="px-5 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-5 py-3 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {players.map((p) => {
                      const selectable = !p.has_paid
                      const sel = selectedUnpaidIds.has(p.id)

                      return (
                        <tr key={p.id} className={`hover:bg-slate-50/60 ${sel ? 'bg-emerald-50/40' : ''}`}>
                          <td className="px-3 py-3 text-center">
                            {!selectable ? (
                              <span className="text-slate-300" aria-hidden title="Paid">
                                —
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                aria-label={`Select ${p.name}`}
                                disabled={selectionPaused}
                                checked={sel}
                                onChange={(e) =>
                                  toggleBulkSelect(p.id, e.target.checked)
                                }
                                className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                              />
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <PlayerAvatar name={p.name} size="sm" />
                              <span className="font-medium text-slate-900">{p.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${p.has_paid
                                ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                                : 'bg-rose-50 text-rose-900 ring-1 ring-rose-200/80'
                                }`}
                            >
                              {p.has_paid ? 'Paid' : 'Unpaid'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => togglePaid(p.id)}
                              disabled={busyId === p.id || bulkBusy}
                              className="inline-flex min-w-[8.5rem] items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyId === p.id ? (
                                <>
                                  <Spinner className="size-3.5 border-white/40 border-t-white" />
                                  <span className="ml-2">Saving…</span>
                                </>
                              ) : p.has_paid ? (
                                'Mark unpaid'
                              ) : (
                                'Mark as paid'
                              )}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          {paymentsLocked
            ? 'This page is read-only while payments are locked. Your organiser can unlock it if a correction is needed.'
            : 'No login required. This page is shared by your organiser — please mark only your own payment status accurately.'}
        </p>
      </main>

      {!paymentsLocked && selectedUnpaidIds.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-8 pt-4">
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => markSelectedPaid()}
            className="pointer-events-auto inline-flex min-w-[min(92vw,20rem)] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 ring-1 ring-emerald-700/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:pb-4"
          >
            {bulkBusy ? (
              <>
                <Spinner className="size-4 border-white/40 border-t-white" />
                Saving…
              </>
            ) : (
              <span className="flex flex-col items-center gap-0.5 text-center leading-tight">
                <span className="flex flex-wrap items-center justify-center gap-2">
                  <span>Mark as paid</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">
                    {selectedUnpaidIds.size}
                  </span>
                </span>
                {bulkSelectionTotal != null && (
                  <span className="text-[10px] font-semibold tabular-nums tracking-tight text-white/85">
                    {formatMoney(bulkSelectionTotal)} total
                  </span>
                )}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
