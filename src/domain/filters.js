// Filter terms and derived dates shared by the procurement and accounts lists.

export const PAYMENT_TERMS = [
  { id: 'daily', label: 'Paid daily' },
  { id: 'weekly', label: 'Paid weekly' },
  { id: 'every2weeks', label: 'Every 2 weeks' },
  { id: 'every3weeks', label: 'Every 3 weeks' },
  { id: 'monthly', label: 'Paid monthly' },
  { id: 'eom', label: 'At the end of the month' },
  { id: 'yearly', label: 'Paid yearly' },
  { id: 'nextweek', label: 'In the next week' },
  { id: 'next2weeks', label: 'In the next 2 weeks' },
  { id: 'days', label: 'In number of days' },
]

export function paymentTermLabel(supplier) {
  const term = PAYMENT_TERMS.find((item) => item.id === supplier?.paymentTerms)
  if (!term) return '—'
  if (term.id === 'days') return supplier.paymentDays ? `${supplier.paymentDays} days` : term.label
  return term.label
}

// A supplier matches when it has the chosen term, and, for "in number of days", the chosen day count (if one is given).
export function supplierTermMatches(supplier, terms, days) {
  if (!terms) return true
  if (supplier?.paymentTerms !== terms) return false
  if (terms === 'days' && days) return Number(supplier.paymentDays) === Number(days)
  return true
}

const SIGNED = new Set(['approved'])

function dayOf(value) {
  return value ? String(value).slice(0, 10) : ''
}

// Start: when the request was submitted. End: the last approval or verification sign-off before the first payment
// (the final approval before accounts pay, which is job completion). Paid: the last disbursement date.
export function requestDates(state, request) {
  const submitted = request.history?.find((entry) => /^Request submitted|^Request resubmitted/.test(entry.action))
  const start = dayOf(submitted?.at || request.createdAt)
  const invoiceIds = new Set((state.invoices || []).filter((invoice) => invoice.requestId === request.id).map((invoice) => invoice.id))
  const paidDays = (state.payments || [])
    .filter((payment) => invoiceIds.has(payment.invoiceId))
    .flatMap((payment) => (payment.disbursements || []).map((entry) => dayOf(entry.date)))
    .filter(Boolean)
    .sort()
  const firstPaid = paidDays[0] || ''
  const signoffs = [
    ...(request.approval?.levels || []),
    ...(request.quoteApproval?.levels || []),
  ].filter((level) => SIGNED.has(level.status) && level.at).map((level) => dayOf(level.at))
  const verified = (state.verifications || [])
    .filter((item) => item.requestId === request.id && item.status === 'approved' && item.decidedAt)
    .map((item) => dayOf(item.decidedAt))
  const beforePayment = [...signoffs, ...verified].filter((day) => !firstPaid || day <= firstPaid).sort()
  return {
    start,
    end: beforePayment.at(-1) || '',
    paid: paidDays.at(-1) || '',
  }
}

// Suppliers that quoted on, were recommended for, or were issued an order for the request.
export function requestVendorIds(state, request) {
  const ids = new Set()
  for (const quote of state.quotations || []) {
    if (quote.requestId === request.id && ['received', 'recommended', 'approved'].includes(quote.status)) ids.add(quote.supplierId)
  }
  for (const order of state.orders || []) {
    if (order.requestId === request.id && order.status !== 'cancelled') ids.add(order.supplierId)
  }
  return ids
}

// A request matches a payment term when any supplier that quoted on it, or was ordered from, has that term.
export function requestTermMatches(state, request, terms, days) {
  if (!terms) return true
  return [...requestVendorIds(state, request)].some((id) => supplierTermMatches(state.suppliers.find((item) => item.id === id), terms, days))
}

export function vesselsOf(requests) {
  return [...new Set(requests.map((request) => String(request.vessel || '').trim()).filter(Boolean))].sort()
}

export function requestMatches(state, request, { keyword = '', from = '', to = '', vessel = '', vendor = '' }) {
  const needle = keyword.trim().toLowerCase()
  if (needle) {
    const vendors = [...requestVendorIds(state, request)].map((id) => state.suppliers.find((item) => item.id === id)?.name || '')
    const text = [request.number, request.title, request.vessel || '', ...vendors].join(' ').toLowerCase()
    if (!text.includes(needle)) return false
  }
  const { start } = requestDates(state, request)
  if (from && (!start || start < from)) return false
  if (to && (!start || start > to)) return false
  if (vessel && request.vessel !== vessel) return false
  if (vendor && !requestVendorIds(state, request).has(vendor)) return false
  return true
}
