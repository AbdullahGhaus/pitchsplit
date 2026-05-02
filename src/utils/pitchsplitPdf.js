import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney } from './money'
import { formatMatchDateLong, formatMatchDateShort } from './date'

/** Emerald-600 */
const BRAND = [5, 150, 105]
const MUTED = [100, 116, 139]

function addFooters(doc, tagline = 'PitchSplit') {
  const n = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const stamp = new Date().toLocaleString()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`${tagline} · Page ${i} of ${n} · ${stamp}`, w / 2, h - 7, {
      align: 'center',
    })
  }
}

function publicMatchUrl(matchId) {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/match/${matchId}`
}

/**
 * @param {{ match: any, players: any[] }} data
 */
export function downloadMatchDetailPdf(data) {
  const { match, players } = data
  if (!match) throw new Error('Missing match.')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const n = players.length
  const per =
    n > 0 ? Number(match.total_amount) / n : Number(match.per_head)
  const paidCount = players.filter((p) => p.has_paid).length

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...BRAND)
  doc.text('PitchSplit', 14, 16)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Match payment summary (PKR)', 14, 23)

  const heading = match.match_date
    ? formatMatchDateLong(match.match_date)
    : 'Match'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(heading, 14, 31)

  autoTable(doc, {
    startY: 36,
    head: [['Detail', 'Value']],
    body: [
      ['Match ID', String(match.id)],
      ['Date', String(match.match_date ?? '—')],
      ['Paid by', String(match.paid_by ?? '—')],
      ['Total', formatMoney(match.total_amount)],
      ['Per player share', formatMoney(per)],
      ['Squad size', String(players.length)],
      ['Paid / unpaid', `${paidCount} / ${Math.max(0, players.length - paidCount)}`],
    ],
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 48 },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  })

  const afterSummary = doc.lastAutoTable.finalY + 8

  autoTable(doc, {
    startY: afterSummary,
    head: [['Player', 'Status', 'Share (PKR)']],
    body: players.map((p) => [
      String(p.name ?? ''),
      p.has_paid ? 'Paid' : 'Unpaid',
      formatMoney(per),
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 28, halign: 'center' },
      2: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const link = publicMatchUrl(match.id)
  if (link) {
    const y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(9)
    doc.setTextColor(...BRAND)
    doc.setFont('helvetica', 'bold')
    doc.text('Share with players (public link):', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    doc.text(link, 14, y + 5, { maxWidth: doc.internal.pageSize.getWidth() - 28 })
  }

  addFooters(doc)
  const fn = `pitchsplit_match_${String(match.id).slice(0, 8)}_${match.match_date || 'unknown'}.pdf`
  doc.save(fn)
}

/**
 * @param {any[]} matchesForMonth rows from listMatches with paid_count / player_count
 * @param {string} monthYYYYMM e.g. 2026-05
 */
export function downloadMonthMatchesPdf(matchesForMonth, monthYYYYMM) {
  if (!matchesForMonth.length) {
    throw new Error('No matches in that month for the current filters.')
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BRAND)
  doc.text('PitchSplit', 14, 14)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Matches — ${monthYYYYMM} (PKR)`, 14, 21)
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(
    'Collection ≈ paid players × per head. Respects dashboard filters (not pagination).',
    14,
    26,
  )

  const body = matchesForMonth.map((m) => {
    const per = Number(m.per_head)
    const paidCount = Number(m.paid_count) || 0
    const pc = Number(m.player_count) || 0
    const collected =
      pc > 0 && Number.isFinite(per) ? paidCount * per : null
    const pct = pctMoneyCollectedRow(m)
    return [
      formatMatchDateShort(m.match_date),
      String(m.paid_by ?? '—').slice(0, 42),
      formatMoney(m.total_amount),
      formatMoney(m.per_head),
      String(pc),
      String(paidCount),
      collected != null ? formatMoney(collected) : '—',
      `${pct.toFixed(1)}%`,
      m.archived ? 'Yes' : '',
      String(m.id),
    ]
  })

  autoTable(doc, {
    startY: 31,
    head: [
      [
        'Match date',
        'Paid by',
        'Total',
        'Per head',
        '#Pl',
        '#Paid',
        'Collected≈',
        'Coll. %',
        'Arch.',
        'Match ID',
      ],
    ],
    body,
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'center' },
      9: { fontSize: 6, overflow: 'linebreak', cellWidth: 46 },
    },
    margin: { left: 14, right: 14 },
  })

  addFooters(doc)
  doc.save(`pitchsplit_matches_${monthYYYYMM}.pdf`)
}

/** @param {any} m */
function pctMoneyCollectedRow(m) {
  const total = Number(m.total_amount)
  const perHead = Number(m.per_head)
  const nPaid = Number(m.paid_count) || 0
  const nPlayers = Number(m.player_count) || 0
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    nPlayers === 0 ||
    !Number.isFinite(perHead)
  ) {
    return 0
  }
  return Math.min(100, ((nPaid * perHead) / total) * 100)
}
