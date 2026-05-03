import { getSupabaseClient } from '../lib/supabaseClient'

/**
 * @typedef {{ id: string, username: string, display_name: string | null, payment_method: Record<string, unknown> }} AdminDirectoryRow
 */

/**
 * @param {unknown} raw
 * @returns {{ bank: string, account_number: string }}
 */
export function normalizePaymentMethod(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    bank: String(/** @type {Record<string, unknown>} */ (o).bank ?? '').trim(),
    account_number: String(
      /** @type {Record<string, unknown>} */ (o).account_number ?? '',
    ).trim(),
  }
}

/**
 * @returns {Promise<AdminDirectoryRow[]>}
 */
export async function listAdminPaymentDirectory() {
  const client = getSupabaseClient()

  if (!client) {
    return [
      {
        id: 'local-dev',
        username: 'admin',
        display_name: null,
        payment_method: {},
      },
    ]
  }

  const { data, error } = await client.rpc('admin_list_payment_directory')

  if (error) {
    throw new Error(error.message || 'Could not load admins.')
  }

  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const dn = row.admin_display_name
    return {
      id: String(row.id),
      username: String(row.admin_username ?? row.username ?? ''),
      display_name:
        dn != null && String(dn).trim() !== '' ? String(dn).trim() : null,
      payment_method:
        row.payment_method && typeof row.payment_method === 'object'
          ? row.payment_method
          : {},
    }
  })
}

/**
 * @param {string} targetId
 * @param {{ bank: string, account_number: string }} paymentMethod
 */
/**
 * Look up saved bank / account for a payer label (stored match `paid_by`).
 * Matches admin username or display_name case-insensitively — does not return other admins’ data.
 * @param {string | null | undefined} label
 * @returns {Promise<{ bank: string, account_number: string }>}
 */
export async function fetchPaymentMethodForPaidByLabel(label) {
  const raw = String(label ?? '').trim()
  if (!raw) return normalizePaymentMethod({})

  const client = getSupabaseClient()
  if (!client) {
    return normalizePaymentMethod({})
  }

  const { data, error } = await client.rpc('admin_payment_method_for_paid_by', {
    p_label: raw,
  })

  if (error) {
    throw new Error(error.message || 'Could not load payment details.')
  }

  return normalizePaymentMethod(
    data && typeof data === 'object' && !Array.isArray(data) ? data : {},
  )
}

export async function updateAdminPaymentMethod(targetId, paymentMethod) {
  const client = getSupabaseClient()
  if (!client) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await client.rpc('admin_update_payment_method', {
    p_target_id: targetId,
    p_payment_method: {
      bank: String(paymentMethod.bank ?? ''),
      account_number: String(paymentMethod.account_number ?? ''),
    },
  })

  if (error) {
    throw new Error(error.message || 'Could not save payment details.')
  }
}
