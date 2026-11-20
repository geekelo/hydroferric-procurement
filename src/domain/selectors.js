import { roleLabel } from './constants.js'
import { todayISO } from '../lib/format.js'
import {
  alreadyActed,
  disbursed,
  invoiceOutstanding,
  lockedAmount,
  pendingLevel,
  requestTotal,
  userMayDecide,
} from './workflow.js'

export function currentUser(state) {
  return state.users.find((user) => user.id === state.sessionUserId) || null
}

export function person(state, id) {
  return state.users.find((user) => user.id === id) || null
}

export function personName(state, id) {
  return person(state, id)?.name || 'Unknown officer'
}

export function projectById(state, id) {
  return state.projects.find((project) => project.id === id) || null
}

export function supplierById(state, id) {
  return state.suppliers.find((supplier) => supplier.id === id) || null
}

export function requestById(state, id) {
  return state.requests.find((request) => request.id === id) || null
}

export function visibleRequests(state, user) {
  if (!user) return []
  if (user.role === 'requester') {
    return state.requests.filter((request) => request.department === user.department || request.requesterId === user.id)
  }
  return state.requests
}

export function visibleProjects(state, user) {
  if (!user) return []
  if (user.role === 'finance') {
    const ids = new Set([
      ...state.payments.map((payment) => payment.projectId),
      ...state.invoices.map((invoice) => invoice.projectId),
    ])
    return state.projects.filter((project) => ids.has(project.id))
  }
  if (user.role !== 'requester') return state.projects
  const linked = new Set(visibleRequests(state, user).map((request) => request.projectId))
  return state.projects.filter((project) => project.department === user.department || linked.has(project.id))
}

export function quotesFor(state, requestId) {
  return state.quotations
    .filter((quote) => quote.requestId === requestId)
    .sort((a, b) => a.amount - b.amount)
}

export function ordersForRequest(state, requestId) {
  return state.orders.filter((order) => order.requestId === requestId)
}

export function invoicesForRequest(state, requestId) {
  return state.invoices.filter((invoice) => invoice.requestId === requestId)
}

export function paymentsForInvoice(state, invoiceId) {
  return state.payments.filter((payment) => payment.invoiceId === invoiceId)
}

export function projectFigures(state, projectId) {
  const project = projectById(state, projectId)
  const orders = state.orders.filter((order) => order.projectId === projectId && order.status !== 'cancelled')
  const committed = orders.reduce((sum, order) => sum + Number(order.total), 0)
  const actual = state.payments
    .filter((payment) => payment.projectId === projectId)
    .reduce((sum, payment) => sum + disbursed(payment), 0)
  return {
    budget: project?.budget || 0,
    committed,
    actual,
    outstanding: Math.max(0, committed - actual),
    available: (project?.budget || 0) - committed,
  }
}

export function effectiveInvoiceStatus(invoice, today = todayISO()) {
  if (!invoice) return 'submitted'
  if (['rejected', 'duplicate', 'held', 'paid', 'partially_paid'].includes(invoice.status)) return invoice.status
  if (invoiceOutstanding(invoice) > 0 && invoice.dueDate < today && ['approved', 'scheduled'].includes(invoice.status)) {
    return 'overdue'
  }
  return invoice.status
}

export function requestStage(state, request) {
  if (['draft', 'returned', 'in_approval'].includes(request.status)) return 'request'
  if (['approved', 'sourcing', 'recommended'].includes(request.status)) return 'quotation'
  if (['rejected', 'cancelled'].includes(request.status)) return 'closed'
  if (request.status === 'closed') return 'close'
  const invoices = state.invoices.filter((invoice) => invoice.requestId === request.id && !['rejected', 'duplicate'].includes(invoice.status))
  const openVerification = state.verifications.some(
    (item) => item.requestId === request.id && item.status === 'assigned',
  )
  if (openVerification || invoices.some((invoice) => invoice.status === 'held')) return 'verify'
  if (!invoices.length) return 'po'
  if (invoices.some((invoice) => invoiceOutstanding(invoice) > 0)) return 'pay'
  return 'close'
}

export function flowCounts(state, user) {
  const counts = { request: 0, quotation: 0, po: 0, verify: 0, pay: 0, close: 0 }
  for (const request of visibleRequests(state, user)) {
    if (['rejected', 'cancelled'].includes(request.status)) continue
    counts[requestStage(state, request)] += 1
  }
  return counts
}

function decisionTask(type, record, title, detail, href) {
  return { id: `${type}-${record.id}`, kind: 'decision', type, recordId: record.id, title, detail, href }
}

export function myTasks(state, user) {
  if (!user) return []
  const tasks = []
  const today = todayISO()

  for (const request of visibleRequests(state, user)) {
    if (user.role === 'requester' || user.role === 'admin') {
      if (request.requesterId === user.id && request.status === 'draft') {
        tasks.push({ id: `draft-${request.id}`, kind: 'work', type: 'draft', recordId: request.id, title: `Finish ${request.number}`, detail: request.title, href: `#/requests/${request.id}/edit` })
      }
      if (request.requesterId === user.id && request.status === 'returned') {
        tasks.push({ id: `return-${request.id}`, kind: 'work', type: 'returned', recordId: request.id, title: `Revise ${request.number}`, detail: 'Returned with comments. Update it and resubmit.', href: `#/requests/${request.id}/edit` })
      }
    }
    const level = request.status === 'in_approval' ? pendingLevel(request.approval?.levels) : null
    if (level && userMayDecide(state, user, level) && !alreadyActed(request.approval.levels, user)) {
      tasks.push(decisionTask('request', request, `Decide ${request.number}`, `${request.title} · ${roleLabel(level.role)} level · ${moneySafe(requestTotal(request))}`, `#/requests/${request.id}`))
    }
    const quoteLevel = request.status === 'recommended' ? pendingLevel(request.quoteApproval?.levels) : null
    if (quoteLevel && userMayDecide(state, user, quoteLevel) && !alreadyActed(request.quoteApproval.levels, user)) {
      tasks.push(decisionTask('quotation', request, `Quotation on ${request.number}`, request.title, `#/requests/${request.id}`))
    }
    if (['procurement', 'admin'].includes(user.role) && request.status === 'approved') {
      tasks.push({ id: `source-${request.id}`, kind: 'work', type: 'source', recordId: request.id, title: `Source ${request.number}`, detail: 'Approved. Collect supplier quotations.', href: `#/requests/${request.id}` })
    }
    if (['procurement', 'admin'].includes(user.role) && request.status === 'sourcing') {
      const count = state.quotations.filter((quote) => quote.requestId === request.id && quote.status === 'received').length
      tasks.push({
        id: `sourcing-${request.id}`,
        kind: 'work',
        type: 'sourcing',
        recordId: request.id,
        title: count >= 2 ? `Recommend a quote for ${request.number}` : `Add quotations to ${request.number}`,
        detail: count >= 2 ? `${count} offers are ready to compare.` : 'At least two quotations are required before a recommendation.',
        href: `#/requests/${request.id}`,
      })
    }
    if (['procurement', 'finance', 'admin'].includes(user.role) && request.status === 'po_issued') {
      const live = state.invoices.filter((invoice) => invoice.requestId === request.id && !['rejected', 'duplicate'].includes(invoice.status))
      if (!live.length) {
        tasks.push({ id: `invoice-${request.id}`, kind: 'work', type: 'invoice', recordId: request.id, title: `Record an invoice for ${request.number}`, detail: 'The purchase order has been issued.', href: `#/invoices/new?request=${request.id}` })
      }
    }
    if (['procurement', 'finance', 'admin'].includes(user.role) && requestStage(state, request) === 'close' && request.status === 'po_issued') {
      tasks.push({ id: `close-${request.id}`, kind: 'work', type: 'close', recordId: request.id, title: `Close ${request.number}`, detail: 'Expenditure is complete and can be reconciled.', href: `#/requests/${request.id}` })
    }
  }

  for (const invoice of state.invoices) {
    if (!['finance', 'admin'].includes(user.role)) break
    if (invoice.status === 'duplicate') {
      tasks.push({ id: `dup-${invoice.id}`, kind: 'work', type: 'duplicate', recordId: invoice.id, title: `Review duplicate ${invoice.reference}`, detail: 'Same supplier reference is already on file.', href: `#/invoices/${invoice.id}` })
    }
    if (invoice.status === 'mismatch' || invoice.status === 'submitted') {
      tasks.push({ id: `match-${invoice.id}`, kind: 'work', type: 'match', recordId: invoice.id, title: `Match ${invoice.reference}`, detail: invoice.matchNote, href: `#/invoices/${invoice.id}` })
    }
    if (['approved', 'partially_paid'].includes(invoice.status) && invoiceOutstanding(invoice) > lockedAmount(state, invoice.id) && invoice.dueDate <= today) {
      tasks.push({ id: `due-${invoice.id}`, kind: 'work', type: 'schedule', recordId: invoice.id, title: `Schedule ${invoice.reference}`, detail: invoice.dueDate < today ? 'Overdue and clear for a payment window.' : 'Due inside the current window.', href: '#/payments' })
    }
  }

  for (const verification of state.verifications) {
    if (verification.status === 'assigned' && (user.role === 'admin' || user.id === verification.assigneeId)) {
      const request = requestById(state, verification.requestId)
      tasks.push({ id: `ver-${verification.id}`, kind: 'work', type: 'verify', recordId: verification.id, title: `Verify ${verification.number}`, detail: request?.title || 'Delivery checklist', href: `#/projects/${verification.projectId}?verification=${verification.id}` })
    }
  }

  for (const schedule of state.schedules) {
    const level = schedule.status === 'pending_approval' ? pendingLevel(schedule.approval?.levels) : null
    if (level && userMayDecide(state, user, level) && !alreadyActed(schedule.approval.levels, user)) {
      tasks.push(decisionTask('schedule', schedule, `Authorise ${schedule.number}`, schedule.comment || 'Payment schedule', `#/payments/${schedule.id}`))
    }
  }

  for (const order of state.orders) {
    if (!order.increasePending) continue
    const level = { role: 'approver', status: 'pending', designatedUserId: state.policy.quotationApproverId }
    if (userMayDecide(state, user, level) || user.role === 'management') {
      tasks.push({ id: `inc-${order.id}`, kind: 'decision', type: 'increase', recordId: order.id, title: `Approve increase on ${order.number}`, detail: order.increasePending.reason, href: `#/orders/${order.id}` })
    }
  }

  for (const payment of state.payments) {
    if (!['finance', 'admin'].includes(user.role)) break
    const remaining = Number(payment.approvedAmount) - disbursed(payment)
    if (payment.status === 'authorised' && remaining > 0) {
      tasks.push({ id: `confirm-${payment.id}`, kind: 'work', type: 'confirm', recordId: payment.id, title: `Record payment ${payment.number}`, detail: 'Authorised. Record the bank confirmation and receipt.', href: `#/payments/${payment.id}` })
    }
    const failed = [...payment.notifications].reverse().find((item) => item.status === 'failed')
    const sentAfter = payment.notifications.some((item) => item.status === 'sent' && item.attempt > (failed?.attempt || 0))
    if (failed && !sentAfter && disbursed(payment) > 0) {
      tasks.push({ id: `retry-${payment.id}`, kind: 'work', type: 'notify', recordId: payment.id, title: `Retry notice for ${payment.number}`, detail: failed.detail, href: `#/payments/${payment.id}` })
    }
  }

  return tasks
}

export function pendingItems(state, user) {
  return myTasks(state, user).filter((task) => task.kind === 'decision' || task.type === 'verify')
}

export function decidedItems(state, user) {
  if (!user) return []
  const rows = []
  const push = (row) => {
    if (row.at) rows.push(row)
  }
  for (const request of state.requests) {
    const levels = [...(request.approval?.levels || []), ...(request.quoteApproval?.levels || [])]
    for (const level of levels) {
      if (level.actorId !== user.id || level.status === 'pending') continue
      const outcome = level.status === 'approved' ? 'Approved' : level.status === 'returned' ? 'Returned' : 'Rejected'
      push({
        id: `${request.id}-${level.role}-${level.at}`,
        at: level.at,
        title: request.number,
        detail: `${outcome} · ${request.title}`,
        href: `#/requests/${request.id}`,
      })
    }
  }
  for (const schedule of state.schedules) {
    for (const level of schedule.approval?.levels || []) {
      if (level.actorId !== user.id || level.status === 'pending') continue
      push({
        id: `${schedule.id}-${level.at}`,
        at: level.at,
        title: schedule.number,
        detail: level.status === 'approved' ? 'Payment authorised' : 'Payment refused',
        href: `#/payments/${schedule.id}`,
      })
    }
  }
  for (const verification of state.verifications) {
    if (verification.decidedBy !== user.id) continue
    push({
      id: verification.id,
      at: verification.decidedAt,
      title: verification.number,
      detail: verification.status === 'approved' ? 'Delivery accepted' : 'Delivery refused',
      href: `#/projects/${verification.projectId}?verification=${verification.id}`,
    })
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export function departmentRollup(state) {
  const names = new Set([
    ...state.projects.map((project) => project.department),
    ...state.requests.map((request) => request.department),
  ])
  return [...names].sort().map((department) => {
    const requests = state.requests.filter((request) => request.department === department)
    const open = requests.filter((request) => !['closed', 'rejected', 'cancelled', 'draft'].includes(request.status)).length
    const projects = state.projects.filter((project) => project.department === department)
    const figures = projects.map((project) => projectFigures(state, project.id))
    return {
      department,
      requests: requests.length,
      open,
      committed: figures.reduce((sum, item) => sum + item.committed, 0),
      actual: figures.reduce((sum, item) => sum + item.actual, 0),
    }
  })
}

function moneySafe(value) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value || 0)
}

export function searchRecords(state, query) {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const hits = []
  const push = (href, label, hint) => {
    if (`${label} ${hint}`.toLowerCase().includes(needle)) hits.push({ href, label, hint })
  }
  state.requests.forEach((request) => push(`#/requests/${request.id}`, request.number, request.title))
  state.orders.forEach((order) => push(`#/orders/${order.id}`, order.number, supplierById(state, order.supplierId)?.name || 'Purchase order'))
  state.invoices.forEach((invoice) => push(`#/invoices/${invoice.id}`, invoice.reference, supplierById(state, invoice.supplierId)?.name || 'Invoice'))
  state.suppliers.forEach((supplier) => push(`#/suppliers/${supplier.id}`, supplier.name, supplier.category))
  state.payments.forEach((payment) => push(`#/payments/${payment.id}`, payment.number, supplierById(state, payment.supplierId)?.name || 'Payment'))
  return hits.slice(0, 8)
}

export function dashboardStats(state, user) {
  const requests = visibleRequests(state, user)
  const open = requests.filter((request) => !['closed', 'rejected', 'cancelled', 'draft'].includes(request.status)).length
  const tasks = myTasks(state, user)
  const quotesWaiting = state.requests.filter((request) => request.status === 'recommended').length
  const openOrders = state.orders.filter((order) => order.status === 'issued').length
  const today = todayISO()
  const overdue = state.invoices.filter((invoice) => effectiveInvoiceStatus(invoice, today) === 'overdue')
  const overdueValue = overdue.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0)
  return {
    open,
    tasks: tasks.length,
    decisions: tasks.filter((task) => task.kind === 'decision').length,
    quotesWaiting,
    openOrders,
    overdue: overdue.length,
    overdueValue,
  }
}
