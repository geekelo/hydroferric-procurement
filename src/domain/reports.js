import { formatDate, formatWhen, money } from '../lib/format.js'
import { personName, projectById, supplierById } from './selectors.js'
import { disbursed, invoiceOutstanding, requestTotal } from './workflow.js'
import { REQUEST_STATUS, statusMeta } from './constants.js'
import { effectiveInvoiceStatus, projectFigures } from './selectors.js'
import { paymentTermLabel, requestDates, requestMatches, requestTermMatches, requestVendorIds, supplierTermMatches } from './filters.js'

function textMatches(keyword, ...parts) {
  const needle = String(keyword || '').trim().toLowerCase()
  return !needle || parts.join(' ').toLowerCase().includes(needle)
}

function within(dateValue, from, to) {
  if (!dateValue) return true
  const day = String(dateValue).slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function parse(filters) {
  return {
    department: filters.department || '',
    projectId: filters.projectId || '',
    status: filters.status || '',
    from: filters.from || '',
    to: filters.to || '',
    keyword: filters.keyword || '',
    vendor: filters.vendor || '',
    vessel: filters.vessel || '',
    terms: filters.terms || '',
    days: filters.days || '',
  }
}

function supplierPasses(state, f, supplierId) {
  return (!f.vendor || supplierId === f.vendor) && supplierTermMatches(supplierById(state, supplierId), f.terms, f.days)
}

// The records behind each report, shared by the table and the summary strip so the two always agree.
export function filterRequests(state, filters) {
  const f = parse(filters)
  return state.requests
    .filter((request) => !f.department || request.department === f.department)
    .filter((request) => !f.projectId || request.projectId === f.projectId)
    .filter((request) => !f.status || request.status === f.status)
    .filter((request) => requestMatches(state, request, f))
    .filter((request) => requestTermMatches(state, request, f.terms, f.days))
}

export function filterInvoices(state, filters) {
  const f = parse(filters)
  return state.invoices
    .filter((invoice) => !f.projectId || invoice.projectId === f.projectId)
    .filter((invoice) => !f.department || invoice.department === f.department)
    .filter((invoice) => !f.status || effectiveInvoiceStatus(invoice) === f.status || invoice.status === f.status)
    .filter((invoice) => within(invoice.dueDate, f.from, f.to))
    .filter((invoice) => supplierPasses(state, f, invoice.supplierId))
    .filter((invoice) => textMatches(f.keyword, invoice.reference, supplierById(state, invoice.supplierId)?.name))
}

// One entry per recorded disbursement that passes the filters.
export function filterDisbursements(state, filters) {
  const f = parse(filters)
  const rows = []
  for (const payment of state.payments) {
    if (f.projectId && payment.projectId !== f.projectId) continue
    if (f.department && payment.department !== f.department) continue
    if (!supplierPasses(state, f, payment.supplierId)) continue
    for (const item of payment.disbursements) {
      if (!within(item.date, f.from, f.to)) continue
      if (!textMatches(f.keyword, payment.number, item.reference, supplierById(state, payment.supplierId)?.name)) continue
      rows.push({ payment, item })
    }
  }
  return rows
}

export function filterProjects(state, filters) {
  const f = parse(filters)
  return state.projects
    .filter((project) => !f.projectId || project.id === f.projectId)
    .filter((project) => !f.department || project.department === f.department)
    .filter((project) => textMatches(f.keyword, project.name, project.code))
}

export function requestCommitted(state, request) {
  return state.orders
    .filter((order) => order.requestId === request.id && order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order.total), 0)
}

export function requestPaid(state, request) {
  const invoiceIds = new Set(state.invoices.filter((invoice) => invoice.requestId === request.id).map((invoice) => invoice.id))
  return state.payments.filter((payment) => invoiceIds.has(payment.invoiceId)).reduce((sum, payment) => sum + disbursed(payment), 0)
}

export function buildReport(state, kind, filters) {
  const department = filters.department || ''
  const projectId = filters.projectId || ''
  const status = filters.status || ''
  const from = filters.from || ''
  const to = filters.to || ''

  if (kind === 'requests') {
    return filterRequests(state, filters)
      .map((request) => {
        const dates = requestDates(state, request)
        return {
          Number: request.number,
          Title: request.title,
          Department: request.department,
          Project: projectById(state, request.projectId)?.name || '',
          Vessel: request.vessel || '',
          Vendors: [...requestVendorIds(state, request)].map((id) => supplierById(state, id)?.name).filter(Boolean).join(', '),
          Status: statusMeta(REQUEST_STATUS, request.status).label,
          Urgency: request.urgency,
          Requester: personName(state, request.requesterId),
          Estimate: money(requestTotal(request)),
          'Start date': formatDate(dates.start),
          'End date': formatDate(dates.end),
          'Closed date (paid)': formatDate(dates.paid),
        }
      })
  }

  if (kind === 'quotations') {
    return state.quotations
      .filter((quote) => !status || quote.status === status)
      .filter((quote) => within(quote.createdAt, from, to))
      .filter((quote) => {
        const request = state.requests.find((item) => item.id === quote.requestId)
        if (department && request?.department !== department) return false
        if (projectId && request?.projectId !== projectId) return false
        return true
      })
      .map((quote) => {
        const request = state.requests.find((item) => item.id === quote.requestId)
        return {
          Quotation: quote.number,
          'Supplier reference': quote.reference,
          Supplier: supplierById(state, quote.supplierId)?.name || '',
          Request: request?.number || '',
          Amount: money(quote.amount),
          'Lead days': quote.leadDays,
          Status: quote.status,
          Recommended: quote.recommended ? 'Yes' : 'No',
        }
      })
  }

  if (kind === 'orders') {
    return state.orders
      .filter((order) => !projectId || order.projectId === projectId)
      .filter((order) => !status || order.status === status)
      .filter((order) => within(order.issuedAt, from, to))
      .map((order) => ({
        'Purchase order': order.number,
        Supplier: supplierById(state, order.supplierId)?.name || '',
        Project: projectById(state, order.projectId)?.name || '',
        Total: money(order.total),
        Status: order.status,
        Revisions: order.revisions.length,
        Issued: formatDate(order.issuedAt),
      }))
  }

  if (kind === 'invoices') {
    return filterInvoices(state, filters)
      .map((invoice) => ({
        'Invoice reference': invoice.reference,
        Supplier: supplierById(state, invoice.supplierId)?.name || '',
        'Payment terms': paymentTermLabel(supplierById(state, invoice.supplierId)),
        Project: projectById(state, invoice.projectId)?.name || '',
        Department: invoice.department,
        'Due date': formatDate(invoice.dueDate),
        Amount: money(invoice.amount),
        Paid: money(invoice.paidAmount),
        Outstanding: money(invoiceOutstanding(invoice)),
        Status: effectiveInvoiceStatus(invoice) === 'overdue' ? 'Overdue' : invoice.status,
      }))
  }

  if (kind === 'disbursements') {
    return filterDisbursements(state, filters).map(({ payment, item }) => ({
      Payment: payment.number,
      Date: formatDate(item.date),
      Supplier: supplierById(state, payment.supplierId)?.name || '',
      'Payment terms': paymentTermLabel(supplierById(state, payment.supplierId)),
      Project: projectById(state, payment.projectId)?.name || '',
      Department: payment.department,
      Reference: item.reference,
      Amount: money(item.amount),
      Receipt: item.receiptName,
      'Recorded by': personName(state, item.recordedBy),
    }))
  }

  if (kind === 'suppliers') {
    return state.suppliers
      .filter((supplier) => !status || supplier.status === status)
      .map((supplier) => {
        const paid = state.payments
          .filter((payment) => payment.supplierId === supplier.id)
          .reduce((sum, payment) => sum + disbursed(payment), 0)
        const outstanding = state.invoices
          .filter((invoice) => invoice.supplierId === supplier.id && !['rejected', 'duplicate'].includes(invoice.status))
          .reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0)
        return {
          Supplier: supplier.name,
          Category: supplier.category,
          Email: supplier.email || 'Missing',
          'Amount paid': money(paid),
          Outstanding: money(outstanding),
          Status: supplier.status,
        }
      })
  }

  if (kind === 'projects') {
    return filterProjects(state, filters)
      .map((project) => {
        const figures = projectFigures(state, project.id)
        const verified = state.verifications.filter((item) => item.projectId === project.id && item.status === 'approved').length
        const open = state.verifications.filter((item) => item.projectId === project.id && item.status === 'assigned').length
        return {
          Project: project.name,
          Code: project.code,
          Department: project.department,
          Owner: personName(state, project.ownerId),
          'Approved cost': money(figures.approved),
          'Amount committed': money(figures.committed),
          'Amount to balance': money(figures.toBalance),
          'Extra payments': money(figures.extra),
          'Total cost': money(figures.total),
          'Verifications open': open,
          'Verifications approved': verified,
          'Payment hold': project.paymentHold ? 'Yes' : 'No',
        }
      })
  }

  if (kind === 'verifications') {
    return state.verifications
      .filter((item) => !projectId || item.projectId === projectId)
      .filter((item) => !status || item.status === status)
      .filter((item) => within(item.decidedAt || item.createdAt, from, to))
      .map((item) => ({
        Verification: item.number,
        Project: projectById(state, item.projectId)?.name || '',
        Assignee: personName(state, item.assigneeId),
        Status: item.status,
        'Delivery confirmed': item.deliveryConfirmed ? 'Yes' : 'No',
        Evidence: item.evidence.map((file) => file.name).join(', '),
        Decided: formatWhen(item.decidedAt),
      }))
  }

  return state.audit
    .filter((entry) => within(entry.at, from, to))
    .filter((entry) => !status || entry.entityType === status)
    .map((entry) => ({
      When: formatWhen(entry.at),
      Officer: personName(state, entry.actorId),
      Action: entry.action,
      Record: entry.entityType,
      Detail: entry.detail,
    }))
}
