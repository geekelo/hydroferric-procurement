export const DOCUMENT_STEPS = [
  { id: 'request', label: 'Request initiating documents', before: 'the request can be approved' },
  { id: 'quotation', label: 'Approved quotation', before: 'the quotation can be approved' },
  { id: 'uploaded_invoice', label: 'Uploaded invoice', before: 'the invoice can be accepted' },
  { id: 'po_waybill', label: 'Purchase order or waybill', before: 'delivery can be approved' },
  { id: 'invoice', label: 'Invoice', before: 'payment can be authorised' },
  { id: 'receipt', label: 'Receipts', before: 'the requisition can be closed' },
]

const UPLOAD_ROLES = ['requester', 'finance', 'management', 'admin']

export function canFileDocuments(user) {
  return UPLOAD_ROLES.includes(user?.role)
}

export function canFileOnProject(user, project) {
  if (!canFileDocuments(user) || !project) return false
  if (user.role === 'requester') return project.department === user.department || project.ownerId === user.id
  return true
}

function push(rows, doc) {
  if (!doc?.name || !doc.category) return
  rows.push(doc)
}

export function documentsForRequest(state, request) {
  if (!request) return []
  const project = state.projects.find((item) => item.id === request.projectId)
  const rows = []
  for (const file of request.attachments || []) {
    push(rows, {
      id: `att-${file.id}`,
      category: 'request',
      name: file.name,
      size: file.size,
      requestId: request.id,
      uploadedBy: request.requesterId,
      uploadedAt: request.createdAt,
      source: 'Request',
    })
  }
  for (const quote of state.quotations.filter((item) => item.requestId === request.id && item.attachmentName && ['approved', 'recommended'].includes(item.status))) {
    push(rows, {
      id: `quote-${quote.id}`,
      category: 'quotation',
      name: quote.attachmentName,
      requestId: request.id,
      uploadedBy: quote.createdBy,
      uploadedAt: quote.createdAt,
      source: quote.status === 'approved' ? 'Approved quotation' : 'Recommended quotation',
    })
  }
  for (const invoice of state.invoices.filter((item) => item.requestId === request.id && item.attachmentName && item.status !== 'rejected')) {
    push(rows, {
      id: `uploaded-${invoice.id}`,
      category: 'uploaded_invoice',
      name: invoice.attachmentName,
      requestId: request.id,
      uploadedBy: invoice.createdBy,
      uploadedAt: invoice.createdAt,
      source: 'Uploaded invoice',
    })
  }
  for (const order of state.orders.filter((item) => item.requestId === request.id && item.status !== 'cancelled')) {
    push(rows, {
      id: `order-${order.id}`,
      category: 'po_waybill',
      name: `${order.number}.pdf`,
      requestId: request.id,
      uploadedBy: order.issuedBy,
      uploadedAt: order.issuedAt,
      source: 'Purchase order',
    })
  }
  for (const payment of state.payments) {
    const invoice = state.invoices.find((item) => item.id === payment.invoiceId)
    if (invoice?.requestId !== request.id) continue
    for (const entry of payment.disbursements || []) {
      if (!entry.receiptName) continue
      push(rows, {
        id: `receipt-${entry.id}`,
        category: 'receipt',
        name: entry.receiptName,
        requestId: request.id,
        uploadedBy: entry.recordedBy,
        uploadedAt: entry.at,
        source: 'Receipt',
      })
    }
  }
  for (const file of project?.documents || []) {
    if (file.requestId && file.requestId !== request.id) continue
    push(rows, { ...file, source: 'Filed on the project' })
  }
  return rows
}

export function missingSteps(state, request, throughStepId) {
  const end = DOCUMENT_STEPS.findIndex((step) => step.id === throughStepId)
  if (end < 0 || !request) return []
  const present = new Set(documentsForRequest(state, request).map((file) => file.category))
  return DOCUMENT_STEPS.slice(0, end + 1).filter((step) => !present.has(step.id))
}

export function approvalBlock(state, request, throughStepId) {
  const missing = missingSteps(state, request, throughStepId)
  if (!missing.length) return ''
  return `${missing.map((step) => step.label).join(', ')} must be on the project before this can be approved.`
}

export function projectDocumentSpaces(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId)
  const requests = state.requests.filter((item) => item.projectId === projectId)
  const seen = new Set()
  const grouped = Object.fromEntries(DOCUMENT_STEPS.map((step) => [step.id, []]))
  const add = (file) => {
    const key = `${file.category}|${file.requestId || ''}|${file.name}`
    if (!file.category || seen.has(key)) return
    seen.add(key)
    grouped[file.category]?.push(file)
  }
  for (const request of requests) documentsForRequest(state, request).forEach(add)
  for (const file of project?.documents || []) add({ ...file, source: 'Filed on the project' })
  return DOCUMENT_STEPS.map((step) => ({ ...step, files: grouped[step.id] }))
}
