import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { getMatch, setMatchPaymentsLocked } from '../services/supabase'
import { formatMoney } from '../utils/money'
import { getMatchHeading } from '../utils/date'
import { copyToClipboard } from '../utils/clipboard'
import { useToastStore } from '../store/toastStore'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { Spinner } from '../components/Spinner'
import { costBreakdownLines } from '../utils/matchCostBreakdown'

function shareUrl(id) {
  return `${window.location.origin}/match/${id}`
}

export default function MatchAdmin() {
  const { id } = useParams()
  const show = useToastStore((s) => s.show)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copyBusy, setCopyBusy] = useState(false)
  const [unlockBusy, setUnlockBusy] = useState(false)

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

  const stats = useMemo(() => {
    if (!data?.match || !data.players) return null
    const n = data.players.length
    const per = n > 0 ? data.match.total_amount / n : 0
    const paidCount = data.players.filter((p) => p.has_paid).length
    const unpaidCount = n - paidCount
    const collected = paidCount * per
    const remaining = Math.max(data.match.total_amount - collected, 0)
    return { per, paidCount, unpaidCount, collected, remaining, n }
  }, [data])

  async function onCopy() {
    if (!id) return
    setCopyBusy(true)
    try {
      const ok = await copyToClipboard(shareUrl(id))
      show(ok ? 'Link copied to clipboard.' : 'Could not copy link.', ok ? 'success' : 'error')
    } finally {
      setCopyBusy(false)
    }
  }

  async function unlockPublicPayments() {
    if (!id || !data?.match?.payments_locked) return
    setUnlockBusy(true)
    try {
      await setMatchPaymentsLocked(id, false)
      const res = await getMatch(id)
      setData(res)
      show(
        'Public squad link unlocked. Players can update payment status until everyone is paid again.',
        'success',
      )
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not unlock payments.', 'error')
    } finally {
      setUnlockBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-100 px-3 sm:px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-700 shadow-sm">
          <Spinner />
          Loading match…
        </div>
      </div>
    )
  }

  if (error || !data?.match) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 px-3 py-8 sm:px-4 sm:py-10">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Match not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'This match may have been removed.'}
          </p>
          <Link
            className="mt-6 inline-flex rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            to="/admin"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const { match, players } = data
  const costLines = costBreakdownLines(match)
  const paymentsLocked = Boolean(match.payments_locked)

  return (
    <div className="min-h-[100dvh] bg-slate-100">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-4 sm:py-6">
          <div>
            <div className="mb-3">
              <Link to="/admin">
                <PitchSplitWordmark size="sm" iconClassName="h-8 w-8" />
              </Link>
            </div>
            <Link
              to="/admin"
              className="text-sm font-semibold text-emerald-800 hover:text-emerald-900"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {getMatchHeading(match)}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Admin
              <span className="font-mono text-xs text-slate-500">{match.id}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {paymentsLocked && (
              <button
                type="button"
                onClick={() => unlockPublicPayments()}
                disabled={unlockBusy}
                className="inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {unlockBusy ? 'Unlocking…' : 'Unlock public payment edits'}
              </button>
            )}
            <Link
              to={`/admin/match/${match.id}/edit`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100"
            >
              Edit match
            </Link>
            <button
              type="button"
              onClick={onCopy}
              disabled={copyBusy}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copyBusy ? 'Copying…' : 'Copy shareable link'}
            </button>
            <Link
              className="text-center text-sm font-semibold text-emerald-800 hover:text-emerald-900"
              to={`/match/${match.id}`}
            >
              Open public page
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 sm:py-8">
        {paymentsLocked && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 shadow-sm ring-1 ring-emerald-100/80">
            <p className="text-sm font-semibold text-emerald-950">All payments done — public link locked</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-900/85">
              Everyone in the squad is marked paid, so the shared match page no longer allows changing payment status.
              You can still edit match details (date, costs, squad) from here. Use “Unlock public payment edits” above if
              someone needs to correct their status on the public page.
            </p>
          </div>
        )}
        {stats && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total amount 
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
              <p
                className={`text-xs text-slate-600 ${costLines ? 'mt-3' : 'mt-2'}`}
              >
                Per player:{' '}
                <span className="font-semibold text-emerald-800">
                  {formatMoney(stats.per)}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Collected 
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-800">
                {formatMoney(stats.collected)}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Paid:{' '}
                <span className="font-semibold">{stats.paidCount}</span> / {stats.n}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remaining 
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-rose-800">
                {formatMoney(stats.remaining)}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Unpaid players:{' '}
                <span className="font-semibold">{stats.unpaidCount}</span>
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="text-slate-500">Paid by </span>
          <span className="font-medium text-slate-900">
            {match.paid_by != null && String(match.paid_by).trim() !== ''
              ? String(match.paid_by).trim()
              : '—'}
          </span>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Players</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {paymentsLocked
                ? 'Payments are complete; the public page is read-only until you unlock it.'
                : 'Payment status updates when players use the public link.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="px-5 py-3 font-semibold text-slate-700">Player</th>
                  <th className="px-5 py-3 font-semibold text-slate-700">Status</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-700">
                    Share due 
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
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
                    <td className="px-5 py-3 text-right tabular-nums text-slate-800">
                      <span className="font-semibold">
                        {stats ? formatMoney(stats.per) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
