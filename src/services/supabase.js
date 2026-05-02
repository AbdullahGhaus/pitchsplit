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
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at, archived, payments_locked',
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
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at, archived, payments_locked',
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
 * Payment counts per match (one query for all listed matches).
 * @param {string[]} matchIds
 * @returns {Promise<Map<string, { paid: number, total: number }>>}
 */
async function fetchPaymentCountsByMatchId(matchIds) {
  const map = new Map()
  for (const id of matchIds) {
    map.set(id, { paid: 0, total: 0 })
  }
  if (matchIds.length === 0) return map

  const client = getClientOrThrow()
  const { data, error } = await client
    .from('players')
    .select('match_id, has_paid')
    .in('match_id', matchIds)

  if (error) {
    throw new Error(error.message || 'Could not fetch player payment summary.')
  }

  for (const row of data || []) {
    const mid = row.match_id
    if (!map.has(mid)) continue
    const cur = map.get(mid)
    cur.total += 1
    if (row.has_paid) cur.paid += 1
  }
  return map
}

/**
 * All matches for admin list (by match date, newest first), with paid/total counts.
 * @param {{ includeArchived?: boolean }} [opts]
 */
export async function listMatches(opts = {}) {
  const { includeArchived = false } = opts
  const client = getClientOrThrow()
  let q = client
    .from('matches')
    .select(
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at, archived, payments_locked',
    )
    .order('match_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!includeArchived) {
    q = q.eq('archived', false)
  }

  const { data, error } = await q

  if (error) {
    throw new Error(error.message || 'Could not fetch matches.')
  }

  const rows = data || []
  const ids = rows.map((r) => r.id)
  const counts = await fetchPaymentCountsByMatchId(ids)

  return rows.map((m) => {
    const c = counts.get(m.id) || { paid: 0, total: 0 }
    return {
      ...m,
      paid_count: c.paid,
      player_count: c.total,
    }
  })
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
 * @param {{
 *   match_date: string
 *   paid_by?: string | null
 *   total_amount: number
 *   playerNames: string[]
 *   costs?: { venue_cost: number, gear_cost: number, refreshment_cost: number, additional_cost: number, total_amount: number }
 *   per_head?: number
 * }} input
 */
export async function updateMatch(
  matchId,
  { match_date, paid_by, total_amount, playerNames, costs, per_head },
) {
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

  const { data: existingPlayers, error: existingPlayersError } = await client
    .from('players')
    .select('name, has_paid')
    .eq('match_id', matchId)

  if (existingPlayersError) {
    throw new Error(existingPlayersError.message || 'Could not fetch match players.')
  }

  const hasPaidByName = new Map()
  for (const row of existingPlayers || []) {
    const key = String(row.name || '').trim().toLowerCase()
    if (!key || hasPaidByName.has(key)) continue
    hasPaidByName.set(key, Boolean(row.has_paid))
  }

  const { data: match, error: matchError } = await client
    .from('matches')
    .update({
      match_date: String(match_date).trim(),
      paid_by: paidByValue,
      total_amount: total,
      costs: breakdown,
      per_head: share,
      players: names,
    })
    .eq('id', matchId)
    .select(
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at, archived, payments_locked',
    )
    .single()

  if (matchError) {
    throw new Error(matchError.message || 'Could not update match.')
  }

  const { error: removePlayersError } = await client
    .from('players')
    .delete()
    .eq('match_id', matchId)

  if (removePlayersError) {
    throw new Error(removePlayersError.message || 'Could not replace match players.')
  }

  const playersToInsert = names.map((name) => ({
    match_id: matchId,
    name,
    has_paid: Boolean(hasPaidByName.get(String(name).toLowerCase())),
  }))

  const { data: players, error: playersError } = await client
    .from('players')
    .insert(playersToInsert)
    .select('id, match_id, name, has_paid')

  if (playersError) {
    throw new Error(playersError.message || 'Could not update match players.')
  }

  return { match, players: players || [] }
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

/**
 * Set payment flag for many players in one match.
 * @param {string} matchId
 * @param {string[]} playerIds
 * @param {boolean} has_paid
 */
export async function bulkSetPlayersPaid(matchId, playerIds, has_paid) {
  const ids = [...new Set(playerIds.map((id) => String(id).trim()))].filter(
    Boolean,
  )
  if (ids.length === 0) return 0

  const client = getClientOrThrow()
  const { data, error } = await client
    .from('players')
    .update({ has_paid })
    .eq('match_id', matchId)
    .in('id', ids)
    .select('id')

  if (error) {
    throw new Error(error.message || 'Could not update payment status.')
  }

  return (data || []).length
}

/**
 * Unlock (or lock) public payment edits on a match. When `false`, players may
 * change has_paid via the public link again until everyone is paid (auto-lock).
 * @param {string} matchId
 * @param {boolean} locked
 */
export async function setMatchPaymentsLocked(matchId, locked) {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('matches')
    .update({ payments_locked: Boolean(locked) })
    .eq('id', matchId)
    .select(
      'id, match_date, paid_by, total_amount, costs, per_head, players, created_at, archived, payments_locked',
    )
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Could not update payment lock.')
  }
  if (!data) {
    throw new Error('Match not found.')
  }
}

/**
 * @param {string} matchId
 */
export async function archiveMatch(matchId) {
  const client = getClientOrThrow()
  const { error } = await client
    .from('matches')
    .update({ archived: true })
    .eq('id', matchId)

  if (error) {
    throw new Error(error.message || 'Could not archive match.')
  }
}

/**
 * @param {string} matchId
 */
export async function restoreMatch(matchId) {
  const client = getClientOrThrow()
  const { error } = await client
    .from('matches')
    .update({ archived: false })
    .eq('id', matchId)

  if (error) {
    throw new Error(error.message || 'Could not restore match.')
  }
}

/**
 * Copy costs and squad from an existing match; all players start unpaid.
 * @param {string} sourceMatchId
 * @param {string} newMatchDate ISO YYYY-MM-DD
 */
export async function duplicateMatch(sourceMatchId, newMatchDate) {
  const existing = await getMatch(sourceMatchId)
  if (!existing?.match) {
    throw new Error('Source match not found.')
  }

  const names = normalizeNames(
    (existing.players || []).map((p) => String(p.name || '')),
  )
  if (names.length === 0) {
    throw new Error('Source match has no players to copy.')
  }

  const m = existing.match
  return createMatch({
    match_date: String(newMatchDate).trim(),
    paid_by: m.paid_by,
    total_amount: Number(m.total_amount),
    playerNames: names,
    costs:
      m.costs && typeof m.costs === 'object'
        ? {
            venue_cost: Number(m.costs.venue_cost) || 0,
            gear_cost: Number(m.costs.gear_cost) || 0,
            refreshment_cost: Number(m.costs.refreshment_cost) || 0,
            additional_cost: Number(m.costs.additional_cost) || 0,
            total_amount: Number(m.costs.total_amount) || Number(m.total_amount),
          }
        : undefined,
  })
}

/** @typedef {{ id: string, name: string, sort_order: number }} DefaultPlayerRow */

/**
 * @returns {Promise<DefaultPlayerRow[]>}
 */
export async function listDefaultPlayersWithOrder() {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('default_players')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Could not fetch default players.')
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    sort_order: Number(row.sort_order) || 0,
  }))
}

/**
 * Squad names for create-match flow, ordered like the defaults screen.
 * @returns {Promise<string[]>}
 */
export async function listDefaultPlayers() {
  const rows = await listDefaultPlayersWithOrder()
  return rows.map((r) => r.name)
}

/**
 * @returns {Promise<DefaultPlayerRow>}
 */
export async function insertDefaultPlayer(name) {
  const raw = String(name || '').trim()
  if (!raw) {
    throw new Error('Name is required.')
  }

  const client = getClientOrThrow()
  const { data: last } = await client
    .from('default_players')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder =
    last && typeof last.sort_order === 'number' ? last.sort_order + 1 : 0

  const { data, error } = await client
    .from('default_players')
    .insert({
      name: raw,
      sort_order: nextOrder,
    })
    .select('id, name, sort_order')
    .single()

  if (error) {
    throw new Error(error.message || 'Could not add default player.')
  }

  return {
    id: data.id,
    name: data.name,
    sort_order: Number(data.sort_order) || nextOrder,
  }
}

/**
 * @param {string} id
 * @param {string} name
 * @returns {Promise<DefaultPlayerRow>}
 */
export async function renameDefaultPlayer(id, name) {
  const raw = String(name || '').trim()
  if (!raw) {
    throw new Error('Name is required.')
  }

  const client = getClientOrThrow()
  const { data, error } = await client
    .from('default_players')
    .update({ name: raw })
    .eq('id', id)
    .select('id, name, sort_order')
    .single()

  if (error) {
    throw new Error(error.message || 'Could not rename.')
  }

  return {
    id: data.id,
    name: data.name,
    sort_order: Number(data.sort_order) || 0,
  }
}

/** @param {string} id */
export async function deleteDefaultPlayer(id) {
  const client = getClientOrThrow()
  const { error } = await client.from('default_players').delete().eq('id', id)
  if (error) {
    throw new Error(error.message || 'Could not remove.')
  }
}

/** @param {string[]} orderedIds */
export async function reorderDefaultPlayers(orderedIds) {
  const client = getClientOrThrow()
  let i = 0
  for (const pid of orderedIds) {
    const { error } = await client
      .from('default_players')
      .update({ sort_order: i })
      .eq('id', pid)
    if (error) {
      throw new Error(error.message || 'Could not reorder.')
    }
    i += 1
  }
}
