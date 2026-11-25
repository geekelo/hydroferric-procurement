import { usersForLevel } from './workflow.js'

export const DOCUMENT_STEPS = [
  { id: 'request', label: 'Request initiating documents', before: 'the request can be approved' },
  { id: 'quotation', label: 'Approved quotation', before: 'the quotation can be approved' },
  { id: 'vendor_invoice', label: "Vendor's invoice", before: 'the invoice can be accepted' },
  { id: 'po_waybill', label: 'Purchase order or waybill', before: 'delivery can be approved' },
  { id: 'mobilization', label: 'Mobilisation invoice', before: 'payment can be authorised' },
]

const UPLOAD_ROLES = ['requester', 'finance', 'management', 'admin']
const APPROVE_ROLES = ['reviewer', 'approver', 'verifier', 'management', 'admin']
const APPROVED_REQUEST = new Set(['approved', 'sourcing', 'recommended', 'po_issued', 'closed'])

export function canFileDocuments(user) {
  return UPLOAD_ROLES.includes(user?.role)
}

export function canApproveDocuments(user) {
  return APPROVE_ROLES.includes(user?.role)
}

export function canFileOnProject(user, project) {
  if (!canFileDocuments(user) || !project) return false
  if (user.role === 'requester') return project.department === user.department || project.ownerId === user.id
  return true
}

export function canCommentOnRequest(user, state, request) {
  if (!user || !request) return false
  if (['management', 'finance', 'admin'].includes(user.role)) return true
  if (user.role === 'requester' && (request.requesterId === user.id || request.department === user.department)) return true
  if (user.role === 'approver') return true
  const levels = [...(request.approval?.levels || []), ...(request.quoteApproval?.levels || [])]
  if (levels.some((level) => usersForLevel(state, level).includes(user.id))) return true
  return state.verifications.some((item) => item.requestId === request.id && item.assigneeId === user.id)
}

export function canResolveRequestComments(user, request) {
  return user?.role === 'requester' && (request?.requesterId === user.id || request?.department === user.department)
}

export function commentsForRequest(state, requestId) {
  const rows = []
  for (const project of state.projects || []) {
    for (const document of project.documents || []) {
      if (document.requestId !== requestId) continue
      for (const comment of document.comments || []) {
        rows.push({
          ...comment,
          documentId: document.id,
          documentName: document.name,
          projectId: project.id,
          description: document.description || '',
        })
      }
    }
  }
  return rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

export function menuComments(state, user) {
  const rows = []
  for (const project of state.projects || []) {
    for (const document of project.documents || []) {
      const request = state.requests.find((item) => item.id === document.requestId)
      if (!request || !canCommentOnRequest(user, state, request)) continue
      for (const comment of document.comments || []) {
        if (comment.hidden) continue
        rows.push({
          ...comment,
          documentId: document.id,
          documentName: document.name,
          projectId: project.id,
          request,
          description: document.description || '',
        })
      }
    }
  }
  return rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

export function canMarkMobilizationPaid(user, project) {
  if (!user || !project) return false
  if (['finance', 'management', 'admin'].includes(user.role)) return true
  return canFileOnProject(user, project)
}

function push(rows, doc) {
  if (!doc?.name || !doc.category) return
  rows.push(doc)
}

function filedCategory(category) {
  if (category === 'invoice') return 'mobilization'
  if (category === 'uploaded_invoice') return 'vendor_invoice'
  return category
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
      status: APPROVED_REQUEST.has(request.status) ? 'approved' : 'pending',
      stored: false,
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
      status: quote.status === 'approved' ? 'approved' : 'pending',
      stored: false,
    })
  }
  for (const invoice of state.invoices.filter((item) => item.requestId === request.id && item.attachmentName && item.status !== 'rejected' && item.status !== 'duplicate')) {
    push(rows, {
      id: `uploaded-${invoice.id}`,
      category: 'vendor_invoice',
      name: invoice.attachmentName,
      requestId: request.id,
      uploadedBy: invoice.createdBy,
      uploadedAt: invoice.createdAt,
      source: "Vendor's invoice",
      status: ['submitted', 'mismatch'].includes(invoice.status) ? 'pending' : 'approved',
      stored: false,
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
      status: 'approved',
      stored: false,
    })
  }
  for (const file of project?.documents || []) {
    if (file.requestId !== request.id) continue
    const category = filedCategory(file.category)
    if (!DOCUMENT_STEPS.some((step) => step.id === category)) continue
    push(rows, {
      ...file,
      projectId: project.id,
      category,
      description: file.description || '',
      comments: file.comments || [],
      source: 'Filed on the request',
      status: file.status === 'rejected' ? 'rejected' : file.status === 'approved' || (file.category === 'invoice' && !file.status) ? 'approved' : 'pending',
      stored: true,
      paymentStatus: category === 'mobilization' ? (file.paymentStatus === 'paid' ? 'paid' : 'pending') : undefined,
      receiptName: file.receiptName || '',
      receiptDescription: file.receiptDescription || '',
    })
  }
  for (const invoice of state.invoices.filter((item) => item.requestId === request.id && item.attachmentName && !['rejected', 'duplicate', 'submitted', 'mismatch'].includes(item.status))) {
    if (rows.some((row) => row.category === 'mobilization' && row.name === invoice.attachmentName)) continue
    const receipt = state.payments
      .find((payment) => payment.invoiceId === invoice.id)
      ?.disbursements?.find((entry) => entry.receiptName)
    const paid = ['paid', 'partially_paid'].includes(invoice.status)
    push(rows, {
      id: `mob-${invoice.id}`,
      category: 'mobilization',
      name: invoice.attachmentName,
      requestId: request.id,
      uploadedBy: invoice.createdBy,
      uploadedAt: invoice.createdAt,
      source: 'Mobilisation invoice',
      status: 'approved',
      stored: false,
      paymentStatus: paid ? 'paid' : 'pending',
      receiptName: paid && receipt ? receipt.receiptName : '',
    })
  }
  return rows
}

export function categorySettled(files) {
  return files.length > 0 && files.every((file) => file.status === 'approved')
}

export function stepLock(state, request, stepId) {
  const index = DOCUMENT_STEPS.findIndex((step) => step.id === stepId)
  if (index <= 0 || !request) return ''
  const previous = DOCUMENT_STEPS[index - 1]
  const files = documentsForRequest(state, request).filter((file) => file.category === previous.id)
  if (categorySettled(files)) return ''
  return previous.label
}

export function missingSteps(state, request, throughStepId) {
  const end = DOCUMENT_STEPS.findIndex((step) => step.id === throughStepId)
  if (end < 0 || !request) return []
  const files = documentsForRequest(state, request)
  return DOCUMENT_STEPS.slice(0, end + 1).filter((step) => !files.some((file) => file.category === step.id && file.status === 'approved'))
}

export function approvalBlock(state, request, throughStepId) {
  const missing = missingSteps(state, request, throughStepId)
  if (!missing.length) return ''
  return `${missing.map((step) => step.label).join(', ')} must be approved on this request before this can be approved.`
}

export function mobilizationCloseBlock(state, request) {
  const paid = documentsForRequest(state, request).filter((file) => file.category === 'mobilization' && file.status === 'approved' && file.paymentStatus === 'paid')
  if (paid.some((file) => !file.receiptName)) return 'Upload a receipt beside each mobilisation invoice that is marked paid.'
  if (!paid.length) return 'Mark a mobilisation invoice paid and upload its receipt before this requisition can be closed.'
  return ''
}
