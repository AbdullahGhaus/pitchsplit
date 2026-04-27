import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { getMatch, updatePlayerPayment } from '../services/supabase'
import { formatMoney } from '../utils/money'
import { costBreakdownLines } from '../utils/matchCostBreakdown'
import { getMatchHeading } from '../utils/date'
import { useToastStore } from '../store/toastStore'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { Spinner } from '../components/Spinner'

export default function MatchPublic() {
  const { id } = useParams()
  const show = useToastStore((s) => s.show)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

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

  const share = useMemo(() => {
    if (!data?.match || !data.players?.length) return null
    const per = data.match.total_amount / data.players.length
    return Number.isFinite(per) ? per : null
  }, [data])

  const paidCount = data?.players?.filter((p) => p.has_paid).length ?? 0
  const totalPlayers = data?.players?.length ?? 0

  async function togglePaid(playerId) {
    if (!id) return
    setBusyId(playerId)
    try {
      await updatePlayerPayment(id, playerId)
      const res = await getMatch(id)
      setData(res)
      show('Payment status updated.', 'success')
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update payment.', 'error')
    } finally {
      setBusyId(null)
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

  return (
    <div className="min-h-screen bg-slate-100">
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
            <p className="mt-1 text-xs text-slate-500">players marked paid</p>
          </div>
        </div>

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
            <h2 className="text-sm font-semibold text-slate-900">Squad & payments</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tap the button to update your own status — changes sync for everyone viewing this page.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="px-5 py-3 font-semibold text-slate-700">Player</th>
                  <th className="px-5 py-3 font-semibold text-slate-700">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-700">Action</th>
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
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => togglePaid(p.id)}
                        disabled={busyId === p.id}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          No login required. This page is shared by your organiser — please mark only your own payment status accurately.
        </p>
      </main>
    </div>
  )
}
