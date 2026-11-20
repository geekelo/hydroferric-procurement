import { uid } from '../lib/format.js'

export const OPEN_INVOICE = new Set(['rejected', 'duplicate'])

export const CHECKLIST = [
  'Goods or milestone delivered as specified',
  'Quantities agree with the purchase order',
  'Quality is acceptable for project use',
  'Delivery evidence or photographs are on file',
  'Project remarks have been recorded',
]

export function nowIso() {
  return new Date().toISOString()
}

export function requestTotal(request) {
  return (request?.items || []).reduce((sum, item) => sum + Number(item.qty) * Number(item.unitCost), 0)
}

export function lineAmount(item) {
  if (item.amount != null) return Number(item.amount)
  return Number(item.qty) * Number(item.unitCost)
}

export function requestLevels(amount, policy) {
  if (amount <= policy.singleLevelBelow) return ['approver']
  if (amount <= policy.bandStandard) return ['reviewer', 'approver']
  if (amount <= policy.bandElevated) return ['reviewer', 'approver', 'finance']
  return ['reviewer', 'approver', 'finance', 'management']
}

export function quotationLevels(amount, policy) {
  const levels = [{ role: 'approver', designatedUserId: policy.quotationApproverId }]
  if (amount > policy.quotationManagementAbove) levels.push({ role: 'management' })
  return levels
}

export function paymentLevels(amount, policy) {
  const levels = [{ role: 'approver' }]
  if (amount > policy.paymentManagementAbove) levels.push({ role: 'management' })
  return levels
}

export function freshLevels(roles) {
  return roles.map((entry, index) => {
    const role = typeof entry === 'string' ? entry : entry.role
    const designatedUserId = typeof entry === 'string' ? null : entry.designatedUserId || null
    return {
      role,
      designatedUserId,
      status: index === 0 ? 'pending' : 'waiting',
      actorId: null,
      comment: '',
      at: null,
    }
  })
}

export function pendingLevel(levels = []) {
  return levels.find((level) => level.status === 'pending') || null
}

export function userMayDecide(state, user, level) {
  if (!user || !level || level.status !== 'pending' || user.active === false) return false
  if (user.role === 'admin') return true
  if (level.designatedUserId) {
    if (user.id === level.designatedUserId) return true
    const designated = state.users.find((item) => item.id === level.designatedUserId)
    return Boolean(designated?.active !== false && designated?.delegateActive && designated.delegateId === user.id)
  }
  if (user.role === level.role) return true
  return state.users.some(
    (item) => item.active && item.role === level.role && item.delegateActive && item.delegateId === user.id,
  )
}

export function alreadyActed(levels, user) {
  if (!user || user.role === 'admin') return false
  return levels.some((level) => level.actorId === user.id && level.status !== 'pending' && level.status !== 'waiting')
}

export function actingFor(state, user, level) {
  if (!user || !level) return []
  return state.users.filter((item) => {
    if (!item.delegateActive || item.delegateId !== user.id || item.active === false) return false
    if (level.designatedUserId) return item.id === level.designatedUserId
    return item.role === level.role
  })
}

export function applyDecision(levels, user, decision, comment) {
  const index = levels.findIndex((level) => level.status === 'pending')
  if (index < 0) return { error: 'Nothing is waiting for a decision.' }
  const next = levels.map((level) => ({ ...level }))
  if (decision === 'approve') {
    next[index] = { ...next[index], status: 'approved', actorId: user.id, comment: comment || '', at: nowIso() }
    if (index + 1 < next.length) {
      next[index + 1] = { ...next[index + 1], status: 'pending' }
      return { levels: next, done: false, pending: next[index + 1] }
    }
    return { levels: next, done: true, pending: null }
  }
  if (decision === 'return' || decision === 'reject') {
    next[index] = {
      ...next[index],
      status: decision === 'return' ? 'returned' : 'rejected',
      actorId: user.id,
      comment: comment || '',
      at: nowIso(),
    }
    return { levels: next, done: false, pending: null, stopped: decision }
  }
  return { error: 'Unknown decision.' }
}

export function usersForLevel(state, level) {
  if (!level) return []
  if (level.designatedUserId) {
    const ids = [level.designatedUserId]
    const designated = state.users.find((item) => item.id === level.designatedUserId)
    if (designated?.delegateActive && designated.delegateId) ids.push(designated.delegateId)
    return ids
  }
  const ids = state.users.filter((item) => item.active && item.role === level.role).map((item) => item.id)
  for (const item of state.users) {
    if (item.active && item.role === level.role && item.delegateActive && item.delegateId) ids.push(item.delegateId)
  }
  return ids
}

export function poInvoiced(state, poId, exceptId) {
  return state.invoices
    .filter((invoice) => invoice.poId === poId && invoice.id !== exceptId && !OPEN_INVOICE.has(invoice.status))
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0)
}

export function invoiceOutstanding(invoice) {
  return Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount || 0))
}

export function disbursed(payment) {
  return (payment?.disbursements || []).reduce((sum, item) => sum + Number(item.amount), 0)
}

export function lockedAmount(state, invoiceId) {
  let total = 0
  for (const schedule of state.schedules) {
    if (schedule.status !== 'draft' && schedule.status !== 'pending_approval') continue
    for (const line of schedule.lines) {
      if (line.invoiceId === invoiceId) total += Number(line.amount)
    }
  }
  for (const payment of state.payments) {
    if (payment.invoiceId !== invoiceId || payment.status === 'confirmed') continue
    total += Math.max(0, Number(payment.approvedAmount) - disbursed(payment))
  }
  return total
}

export function buildPoItems(request, amount) {
  const estimate = requestTotal(request)
  if (!request.items?.length || !estimate) {
    return [{ id: uid('poi'), description: request.title, qty: 1, unit: 'lot', unitCost: amount, amount }]
  }
  const lines = request.items.map((item) => {
    const share = (Number(item.qty) * Number(item.unitCost)) / estimate
    const exact = share * amount
    const qty = Number(item.qty)
    const unitCost = qty ? Math.round(exact / qty) : Math.round(exact)
    return {
      id: uid('poi'),
      description: item.description,
      qty,
      unit: item.unit,
      unitCost,
      amount: unitCost * qty,
    }
  })
  const drift = amount - lines.reduce((sum, line) => sum + line.amount, 0)
  if (lines.length && drift) lines[lines.length - 1].amount += drift
  return lines
}

export function nextNumber(counters, key, prefix) {
  const n = (counters[key] || 0) + 1
  return {
    counters: { ...counters, [key]: n },
    number: `${prefix}-2026-${String(n).padStart(4, '0')}`,
  }
}

export function mapById(list, id, fn) {
  return list.map((item) => (item.id === id ? fn(item) : item))
}

export function defaultChecklist() {
  return CHECKLIST.map((label) => ({ id: uid('chk'), label, done: false }))
}
