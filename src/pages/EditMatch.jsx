import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { getMatch, updateMatch } from '../services/supabase'
import { useToastStore } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import { Spinner } from '../components/Spinner'
import { formatMoney } from '../utils/money'

function parseCostInput(s) {
  const n = Number(String(s).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function splitStoredPlayers(players) {
  if (!Array.isArray(players) || players.length === 0) {
    return ['']
  }
  return players.map((p) => String(p))
}

export default function EditMatch() {
  const { id } = useParams()
  const navigate = useNavigate()
  const show = useToastStore((s) => s.show)
  const admin = useAuthStore((s) => s.admin)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [matchDate, setMatchDate] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [venueCost, setVenueCost] = useState('')
  const [gearCost, setGearCost] = useState('')
  const [refreshmentCost, setRefreshmentCost] = useState('')
  const [otherCost, setOtherCost] = useState('')
  const [players, setPlayers] = useState([''])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      try {
        setLoading(true)
        setError(null)
        const res = await getMatch(id)
        if (!res?.match) {
          throw new Error('Match not found.')
        }
        if (cancelled) return

        const costs = res.match.costs && typeof res.match.costs === 'object' ? res.match.costs : {}
        setMatchDate(String(res.match.match_date || '').slice(0, 10))
        setPaidBy(res.match.paid_by != null ? String(res.match.paid_by) : '')
        setVenueCost(String(costs.venue_cost ?? ''))
        setGearCost(String(costs.gear_cost ?? ''))
        setRefreshmentCost(String(costs.refreshment_cost ?? ''))
        setOtherCost(String(costs.additional_cost ?? ''))
        setPlayers(splitStoredPlayers(res.match.players))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load match.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const trimmedPlayers = useMemo(
    () => players.map((p) => String(p).trim()).filter(Boolean),
    [players],
  )

  const dedupedPlayers = useMemo(() => {
    const seen = new Set()
    return trimmedPlayers.filter((name) => {
      const key = name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [trimmedPlayers])

  const totalAmount = useMemo(
    () =>
      parseCostInput(venueCost) +
      parseCostInput(gearCost) +
      parseCostInput(refreshmentCost) +
      parseCostInput(otherCost),
    [venueCost, gearCost, refreshmentCost, otherCost],
  )

  const playerCount = dedupedPlayers.length
  const perHead = playerCount > 0 ? totalAmount / playerCount : null

  const canSubmit =
    Boolean(matchDate) &&
    totalAmount > 0 &&
    playerCount > 0 &&
    perHead !== null &&
    Number.isFinite(perHead)

  function updatePlayer(idx, value) {
    setPlayers((prev) => prev.map((p, i) => (i === idx ? value : p)))
  }

  function addPlayer() {
    setPlayers((prev) => [...prev, ''])
  }

  function removePlayer(idx) {
    setPlayers((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!id || !canSubmit) return
    setBusy(true)
    try {
      await updateMatch(id, {
        match_date: matchDate,
        paid_by: paidBy.trim() || null,
        total_amount: totalAmount,
        playerNames: dedupedPlayers,
        costs: {
          venue_cost: parseCostInput(venueCost),
          gear_cost: parseCostInput(gearCost),
          refreshment_cost: parseCostInput(refreshmentCost),
          additional_cost: parseCostInput(otherCost),
          total_amount: totalAmount,
        },
        per_head: perHead,
      })
      show('Match updated.', 'success')
      navigate(`/admin/match/${id}`)
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not update match.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const costInputClass =
    'mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

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

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 px-3 py-8 sm:px-4 sm:py-10">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Unable to edit match</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
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

  return (
    <div className="min-h-[100dvh] bg-slate-50 px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-4">
              <Link to="/admin">
                <PitchSplitWordmark size="sm" iconClassName="h-8 w-8" />
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Edit match
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Update date, payer, cost breakdown, and squad for this match.
            </p>
          </div>
          <Link
            to={`/admin/match/${id}`}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-slate-800">
            Match date
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              required
            />
          </label>

          <label className="mt-5 block text-sm font-medium text-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span>Paid by</span>
              <button
                type="button"
                onClick={() => {
                  const username = String(admin?.username || '').trim()
                  if (username) setPaidBy(username)
                }}
                disabled={!String(admin?.username || '').trim()}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Paid by me
              </button>
            </div>
            <input
              type="text"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="e.g. organiser or payer name"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-800">Costs (PKR)</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Venue cost
                <input
                  inputMode="decimal"
                  className={costInputClass}
                  placeholder="0"
                  value={venueCost}
                  onChange={(e) => setVenueCost(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Gear cost
                <input
                  inputMode="decimal"
                  className={costInputClass}
                  placeholder="0"
                  value={gearCost}
                  onChange={(e) => setGearCost(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Refreshment cost
                <input
                  inputMode="decimal"
                  className={costInputClass}
                  placeholder="0"
                  value={refreshmentCost}
                  onChange={(e) => setRefreshmentCost(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Additional cost
                <input
                  inputMode="decimal"
                  className={costInputClass}
                  placeholder="0"
                  value={otherCost}
                  onChange={(e) => setOtherCost(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Total amount
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">
              {formatMoney(totalAmount)}
            </p>
            <p className="mt-3 border-t border-emerald-200/80 pt-3 text-sm text-emerald-900">
              <span className="font-semibold">{playerCount}</span> in split
              {' '}→{' '}
              <span className="font-bold tabular-nums">
                {perHead !== null ? formatMoney(perHead) : '—'}
              </span>{' '}
              per player
            </p>
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm font-medium text-slate-800">Players</p>
              <button
                type="button"
                onClick={addPlayer}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Add player
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {players.map((player, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder={`Player ${idx + 1}`}
                    value={player}
                    onChange={(e) => updatePlayer(idx, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removePlayer(idx)}
                    disabled={players.length <= 1}
                    className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Empty names are ignored. Duplicate names only count once.
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Spinner className="size-4 border-white/40 border-t-white" />}
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
