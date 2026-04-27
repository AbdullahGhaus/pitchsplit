import { getSupabaseClient } from '../lib/supabaseClient'

function getClientOrThrow() {
  const client = getSupabaseClient()
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }
  return client
}

function normalizeNames(names) {
  const seen = new Set()
  return names
    .map((n) => String(n).trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * @param {{
 *   match_date: string
 *   paid_by?: string | null
 *   total_amount: number
 *   playerNames: string[]
 *   costs?: { venue_cost: number, gear_cost: number, refreshment_cost: number, additional_cost: number, total_amount: number }
 *   per_head?: number
 * }} input
 * `match_date` — ISO date string YYYY-MM-DD
 */
export async function createMatch({
  match_date,
  paid_by,
  total_amount,
  playerNames,
  costs,
  per_head,
}) {
  const client = getClientOrThrow()
  const names = normalizeNames(playerNames)
  if (names.length === 0) {
    throw new Error('At least one player is required.')
  }

  const total = Number(total_amount)
  const breakdown =
    costs && typeof costs === 'object'
      ? {
          venue_cost: Number(costs.venue_cost) || 0,
          gear_cost: Number(costs.gear_cost) || 0,
          refreshment_cost: Number(costs.refreshment_cost) || 0,
          additional_cost: Number(costs.additional_cost) || 0,
          total_amount: Number(costs.total_amount) || total,
        }
      : {
          venue_cost: 0,
          gear_cost: 0,
          refreshment_cost: 0,
          additional_cost: 0,
          total_amount: total,
        }

  const share =
    typeof per_head === 'number' && Number.isFinite(per_head)
      ? per_head
      : names.length > 0
        ? total / names.length
        : total

  const paidByValue =
    paid_by != null && String(paid_by).trim() !== ''
      ? String(paid_by).trim()
      : null

  const { data: match, error: matchError } = await client
    .from('matches')
    .insert({
      match_date: String(match_date).trim(),
      paid_by: paidByValue,
      total_amount: total,
      costs: breakdown,
      per_head: share,
      players: names,
    })
    .select(
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at',
    )
    .single()

  if (matchError) {
    throw new Error(matchError.message || 'Could not create match.')
  }

  const playersToInsert = names.map((name) => ({
    match_id: match.id,
    name,
  }))
  const { data: players, error: playersError } = await client
    .from('players')
    .insert(playersToInsert)
    .select('id, match_id, name, has_paid')

  if (playersError) {
    throw new Error(playersError.message || 'Could not create match players.')
  }

  return { match, players: players || [] }
}

/**
 * @param {string} id
 */
export async function getMatch(id) {
  const client = getClientOrThrow()
  const { data: match, error: matchError } = await client
    .from('matches')
    .select(
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (matchError) {
    throw new Error(matchError.message || 'Could not fetch match.')
  }
  if (!match) return null

  const { data: players, error: playersError } = await client
    .from('players')
    .select('id, match_id, name, has_paid')
    .eq('match_id', id)
    .order('name', { ascending: true })

  if (playersError) {
    throw new Error(playersError.message || 'Could not fetch players.')
  }

  return { match, players: players || [] }
}

/**
 * All matches for admin list (by match date, newest first).
 */
export async function listMatches() {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('matches')
    .select(
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at',
    )
    .order('match_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Could not fetch matches.')
  }
  return data || []
}

/**
 * Deletes a match; `players` rows are removed if FK is ON DELETE CASCADE.
 * @param {string} matchId
 */
export async function deleteMatch(matchId) {
  const client = getClientOrThrow()
  const { error } = await client.from('matches').delete().eq('id', matchId)
  if (error) {
    throw new Error(error.message || 'Could not delete match.')
  }
}

/**
 * @param {string} matchId
 * @param {string} playerId
 * @param {boolean} [has_paid] — if omitted, toggles current value
 */
export async function updatePlayerPayment(matchId, playerId, has_paid) {
  const client = getClientOrThrow()
  const { data: existing, error: readError } = await client
    .from('players')
    .select('id, match_id, name, has_paid')
    .eq('id', playerId)
    .eq('match_id', matchId)
    .maybeSingle()

  if (readError) {
    throw new Error(readError.message || 'Could not read player.')
  }

  if (!existing) {
    throw new Error('Player not found for this match.')
  }

  const next =
    typeof has_paid === 'boolean'
      ? has_paid
      : !existing.has_paid

  const { data: updated, error: updateError } = await client
    .from('players')
    .update({ has_paid: next })
    .eq('id', playerId)
    .eq('match_id', matchId)
    .select('id, match_id, name, has_paid')
    .single()

  if (updateError) {
    throw new Error(updateError.message || 'Could not update payment status.')
  }

  return updated
}

export async function listDefaultPlayers() {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('default_players')
    .select('name')
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Could not fetch default players.')
  }

  return (data || []).map((row) => row.name)
}
