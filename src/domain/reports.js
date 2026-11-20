import { formatDate, formatWhen, money } from '../lib/format.js'
import { personName, projectById, supplierById } from './selectors.js'
import { disbursed, invoiceOutstanding, requestTotal } from './workflow.js'
import { REQUEST_STATUS, statusMeta } from './constants.js'
import { effectiveInvoiceStatus, projectFigures } from './selectors.js'

function within(dateValue, from, to) {
  if (!dateValue) return true
  const day = String(dateValue).slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

export function buildReport(state, kind, filters) {
  const department = filters.department || ''
  const projectId = filters.projectId || ''
  const status = filters.status || ''
  const from = filters.from || ''
  const to = filters.to || ''

  if (kind === 'requests') {
    return state.requests
      .filter((request) => !department || request.department === department)
      .filter((request) => !projectId || request.projectId === projectId)
      .filter((request) => !status || request.status === status)
      .filter((request) => within(request.createdAt, from, to))
      .map((request) => ({
        Number: request.number,
        Title: request.title,
        Department: request.department,
        Project: projectById(state, request.projectId)?.name || '',
        Status: statusMeta(REQUEST_STATUS, request.status).label,
        Urgency: request.urgency,
        Requester: personName(state, request.requesterId),
        Estimate: money(requestTotal(request)),
        Submitted: formatDate(request.createdAt),
      }))
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
    return state.invoices
      .filter((invoice) => !projectId || invoice.projectId === projectId)
      .filter((invoice) => !department || invoice.department === department)
      .filter((invoice) => !status || effectiveInvoiceStatus(invoice) === status || invoice.status === status)
      .filter((invoice) => within(invoice.dueDate, from, to))
      .map((invoice) => ({
        'Invoice reference': invoice.reference,
        Supplier: supplierById(state, invoice.supplierId)?.name || '',
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
    const rows = []
    for (const payment of state.payments) {
      if (projectId && payment.projectId !== projectId) continue
      if (department && payment.department !== department) continue
      for (const item of payment.disbursements) {
        if (!within(item.date, from, to)) continue
        rows.push({
          Payment: payment.number,
          Date: formatDate(item.date),
          Supplier: supplierById(state, payment.supplierId)?.name || '',
          Project: projectById(state, payment.projectId)?.name || '',
          Department: payment.department,
          Reference: item.reference,
          Amount: money(item.amount),
          Receipt: item.receiptName,
          'Recorded by': personName(state, item.recordedBy),
        })
      }
    }
    return rows
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
    return state.projects
      .filter((project) => !projectId || project.id === projectId)
      .filter((project) => !department || project.department === department)
      .map((project) => {
        const figures = projectFigures(state, project.id)
        const verified = state.verifications.filter((item) => item.projectId === project.id && item.status === 'approved').length
        const open = state.verifications.filter((item) => item.projectId === project.id && item.status === 'assigned').length
        return {
          Project: project.name,
          Code: project.code,
          Department: project.department,
          Owner: personName(state, project.ownerId),
          Budget: money(figures.budget),
          Committed: money(figures.committed),
          Actual: money(figures.actual),
          'Uncommitted balance': money(figures.available),
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
