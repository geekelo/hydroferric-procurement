import { monthKey, uid } from '../lib/format.js'
import { approvalBlock, canApproveDocuments, canCommentOnRequest, canFileDocuments, canFileOnProject, canMarkMobilizationPaid, canResolveRequestComments, DOCUMENT_STEPS, mobilizationCloseBlock, stepLock } from './documents.js'
import { createSeed } from './seed.js'
import { PAYMENT_TERMS } from './filters.js'
import {
  alreadyActed,
  applyDecision,
  buildPoItems,
  defaultChecklist,
  disbursed,
  freshLevels,
  invoiceOutstanding,
  lockedAmount,
  mapById,
  nextNumber,
  nowIso,
  paymentLevels,
  pendingLevel,
  poInvoiced,
  quotationLevels,
  requestLevels,
  requestTotal,
  userMayDecide,
  usersForLevel,
} from './workflow.js'

function actor(state) {
  return state.users.find((user) => user.id === state.sessionUserId) || null
}

function flash(state, tone, text, focus = null) {
  return { ...state, flash: { tone, text, at: Date.now(), focus } }
}

function deny(state, text) {
  return flash(state, 'bad', text)
}

function can(user, roles) {
  if (!user || user.active === false) return false
  if (user.role === 'admin') return true
  return roles.includes(user.role)
}

function scheduleDocumentBlock(state, schedule, stepId) {
  for (const line of schedule.lines || []) {
    const invoice = state.invoices.find((item) => item.id === line.invoiceId)
    const request = state.requests.find((item) => item.id === invoice?.requestId)
    const block = approvalBlock(state, request, stepId)
    if (block) return block
  }
  return ''
}

function addProjectDocument(state, { projectId, category, requestId, name, size, description }) {
  const user = actor(state)
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) return deny(state, 'Project not found.')
  if (!canFileOnProject(user, project)) return deny(state, 'Only the HOD, accounts, the MD and the site admin can upload documents.')
  const step = DOCUMENT_STEPS.find((item) => item.id === category)
  if (!step) return deny(state, 'Choose a document category.')
  const fileName = String(name || '').trim()
  const about = String(description || '').trim()
  if (!fileName) return deny(state, 'Choose a document to upload.')
  if (!about) return deny(state, 'Describe what this document is about.')
  const request = state.requests.find((item) => item.id === requestId && item.projectId === projectId)
  if (!request) return deny(state, 'Choose the request this document belongs to.')
  const waiting = stepLock(state, request, category)
  if (waiting) return deny(state, `LOCKED (Waiting for approval of ${waiting}).`)
  const document = {
    id: uid('doc'),
    category,
    requestId,
    name: fileName,
    size: Number(size) || 0,
    uploadedBy: user.id,
    uploadedAt: nowIso(),
    status: 'pending',
    description: about,
    comments: [],
    paymentStatus: category === 'mobilization' ? 'pending' : '',
    receiptName: '',
    receiptDescription: '',
  }
  const next = { ...project, documents: [...(project.documents || []), document] }
  return flash(
    audit(
      { ...state, projects: mapById(state.projects, projectId, () => next) },
      'Document filed',
      'project',
      projectId,
      `${step.label}: ${fileName}`,
    ),
    'good',
    `${fileName} filed under ${step.label}.`,
  )
}

function findFiledDocument(state, projectId, documentId) {
  const project = state.projects.find((item) => item.id === projectId)
  const document = (project?.documents || []).find((item) => item.id === documentId)
  return { project, document }
}

function approveDocument(state, { projectId, documentId }) {
  const user = actor(state)
  if (!canApproveDocuments(user)) return deny(state, 'An approving officer must approve this document.')
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document) return deny(state, 'Document not found.')
  if (document.status === 'approved') return deny(state, 'An approved document cannot be changed.')
  if (document.status === 'rejected') return deny(state, 'A rejected document cannot be approved. Delete it and upload a replacement.')
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? { ...item, status: 'approved', approvedBy: user.id, approvedAt: nowIso() } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Document approved', 'project', projectId, document.name),
    'good',
    `${document.name} approved.`,
  )
}

function rejectDocument(state, { projectId, documentId, reason }) {
  const user = actor(state)
  if (!canApproveDocuments(user)) return deny(state, 'An approving officer must reject this document.')
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document) return deny(state, 'Document not found.')
  if (document.status === 'approved') return deny(state, 'An approved document cannot be rejected.')
  if (document.status === 'rejected') return state
  const note = String(reason || '').trim()
  if (note.length < 3) return deny(state, 'Say why this document is rejected.')
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? {
      ...item,
      status: 'rejected',
      rejectedBy: user.id,
      rejectedAt: nowIso(),
      rejectionNote: note,
    } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Document rejected', 'project', projectId, `${document.name}: ${note}`),
    'good',
    `${document.name} rejected.`,
  )
}

function deleteDocument(state, { projectId, documentId }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!project || !document) return deny(state, 'Document not found.')
  if (!canFileOnProject(user, project)) return deny(state, 'Only the HOD, accounts, the MD and the site admin can delete a rejected document.')
  if (document.status === 'approved') return deny(state, 'An approved document cannot be deleted.')
  if (document.status !== 'rejected') return deny(state, 'Only a rejected document can be deleted.')
  const next = { ...project, documents: project.documents.filter((item) => item.id !== documentId) }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Rejected document deleted', 'project', projectId, document.name),
    'good',
    `${document.name} deleted.`,
  )
}

function setMobilizationPayment(state, { projectId, documentId, paymentStatus }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document || document.category !== 'mobilization' && document.category !== 'invoice') return deny(state, 'Choose a mobilisation invoice.')
  if (!canMarkMobilizationPaid(user, project)) return deny(state, 'Accounts, the HOD, the MD or the site admin marks a mobilisation invoice paid or pending.')
  if (document.status !== 'approved') return deny(state, 'Approve the mobilisation invoice before marking it paid or pending.')
  const status = paymentStatus === 'paid' ? 'paid' : 'pending'
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? { ...item, category: 'mobilization', paymentStatus: status } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, status === 'paid' ? 'Mobilisation invoice marked paid' : 'Mobilisation invoice marked pending', 'project', projectId, document.name),
    'good',
    status === 'paid' ? `${document.name} marked paid. Upload the receipt beside it.` : `${document.name} marked pending.`,
  )
}

function addDocumentComment(state, { projectId, documentId, text }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document) return deny(state, 'Document not found.')
  const request = state.requests.find((item) => item.id === document.requestId)
  if (!canCommentOnRequest(user, state, request)) return deny(state, 'Only the HOD, the assigned approver, accounts, the MD and the site admin can comment.')
  const body = String(text || '').trim()
  if (!body) return deny(state, 'Write a comment.')
  const comment = { id: uid('cmt'), text: body, authorId: user.id, at: nowIso(), resolved: false, hidden: false, resolutionNote: '' }
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? { ...item, comments: [...(item.comments || []), comment] } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Comment added', 'project', projectId, `${document.name}: ${body}`),
    'good',
    'Comment added.',
  )
}

function resolveDocumentComment(state, { projectId, documentId, commentId, resolutionNote }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document) return deny(state, 'Document not found.')
  const request = state.requests.find((item) => item.id === document.requestId)
  if (!canResolveRequestComments(user, request)) return deny(state, 'The HOD resolves comments on this requisition.')
  const comment = (document.comments || []).find((item) => item.id === commentId)
  if (!comment) return deny(state, 'Comment not found.')
  if (comment.resolved) return state
  const note = String(resolutionNote || '').trim()
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? {
      ...item,
      comments: item.comments.map((entry) => entry.id === commentId ? {
        ...entry,
        resolved: true,
        resolvedBy: user.id,
        resolvedAt: nowIso(),
        resolutionNote: note,
      } : entry),
    } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Comment resolved', 'project', projectId, document.name),
    'good',
    'Comment resolved.',
  )
}

function hideDocumentComment(state, { projectId, documentId, commentId }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document) return deny(state, 'Document not found.')
  const request = state.requests.find((item) => item.id === document.requestId)
  if (!canResolveRequestComments(user, request)) return deny(state, 'The HOD hides a resolved comment.')
  const comment = (document.comments || []).find((item) => item.id === commentId)
  if (!comment?.resolved) return deny(state, 'Resolve the comment before hiding it.')
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? {
      ...item,
      comments: item.comments.map((entry) => entry.id === commentId ? { ...entry, hidden: true } : entry),
    } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Comment hidden', 'project', projectId, document.name),
    'good',
    'Resolved comment hidden from the comments list.',
  )
}

function archiveDocumentComment(state, { projectId, documentId, commentId, archived }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!document) return deny(state, 'Document not found.')
  const request = state.requests.find((item) => item.id === document.requestId)
  if (!canResolveRequestComments(user, request)) return deny(state, 'The HOD archives resolved comments on this requisition.')
  const comment = (document.comments || []).find((item) => item.id === commentId)
  if (!comment?.resolved) return deny(state, 'Resolve the comment before archiving it.')
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? {
      ...item,
      comments: item.comments.map((entry) => entry.id === commentId ? { ...entry, archived: Boolean(archived), archivedAt: archived ? nowIso() : null } : entry),
    } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, archived ? 'Comment archived' : 'Comment restored', 'project', projectId, document.name),
    'good',
    archived ? 'Comment archived by year and month.' : 'Comment restored to Resolved.',
  )
}

// Archives every resolved comment of one month ("2026-10") that the user is allowed to manage.
function archiveCommentMonth(state, { month }) {
  const user = actor(state)
  let count = 0
  const stamp = nowIso()
  const projects = state.projects.map((project) => ({
    ...project,
    documents: (project.documents || []).map((document) => {
      if (!document.comments?.length) return document
      const request = state.requests.find((item) => item.id === document.requestId)
      if (!canResolveRequestComments(user, request)) return document
      return {
        ...document,
        comments: document.comments.map((entry) => {
          if (!entry.resolved || entry.hidden || entry.archived || monthKey(entry.resolvedAt || entry.at) !== month) return entry
          count += 1
          return { ...entry, archived: true, archivedAt: stamp }
        }),
      }
    }),
  }))
  if (!count) return deny(state, 'No resolved comments to archive for that month.')
  return flash(
    audit({ ...state, projects }, 'Comments archived', 'project', 'comments', `${count} resolved ${count === 1 ? 'comment' : 'comments'} from ${month}`),
    'good',
    `${count} resolved ${count === 1 ? 'comment' : 'comments'} archived.`,
  )
}

function addMobilizationReceipt(state, { projectId, documentId, name, size, description }) {
  const user = actor(state)
  const { project, document } = findFiledDocument(state, projectId, documentId)
  if (!project) return deny(state, 'Project not found.')
  if (!canFileOnProject(user, project)) return deny(state, 'Only the HOD, accounts, the MD and the site admin can upload documents.')
  if (!document) return deny(state, 'Mobilisation invoice not found.')
  if (document.paymentStatus !== 'paid') return deny(state, 'Mark the mobilisation invoice paid before uploading its receipt.')
  const fileName = String(name || '').trim()
  const about = String(description || '').trim()
  if (!fileName) return deny(state, 'Choose a receipt to upload.')
  if (!about) return deny(state, 'Describe what this receipt is about.')
  const next = {
    ...project,
    documents: project.documents.map((item) => item.id === documentId ? {
      ...item,
      category: 'mobilization',
      receiptName: fileName,
      receiptDescription: about,
      receiptSize: Number(size) || 0,
      receiptUploadedBy: user.id,
      receiptUploadedAt: nowIso(),
    } : item),
  }
  return flash(
    audit({ ...state, projects: mapById(state.projects, projectId, () => next) }, 'Receipt filed', 'project', projectId, `${document.name}: ${fileName}`),
    'good',
    `${fileName} filed beside ${document.name}.`,
  )
}

function audit(state, action, entityType, entityId, detail) {
  return {
    ...state,
    audit: [
      {
        id: uid('aud'),
        at: nowIso(),
        actorId: state.sessionUserId,
        action,
        entityType,
        entityId,
        detail,
      },
      ...state.audit,
    ].slice(0, 400),
  }
}

function notify(state, userIds, note) {
  const ids = [...new Set(userIds.filter((id) => id && id !== state.sessionUserId))]
  if (!ids.length) return state
  const items = ids.map((userId) => ({
    id: uid('ntf'),
    userId,
    at: nowIso(),
    read: false,
    ...note,
  }))
  return { ...state, notifications: [...items, ...state.notifications].slice(0, 250) }
}

function addHistory(request, actorId, action, comment = '') {
  return {
    ...request,
    updatedAt: nowIso(),
    history: [...request.history, { id: uid('h'), at: nowIso(), actorId, action, comment }],
  }
}

function procurementIds(state) {
  return state.users.filter((user) => user.active && user.role === 'procurement').map((user) => user.id)
}

function financeIds(state) {
  return state.users.filter((user) => user.active && user.role === 'finance').map((user) => user.id)
}

function normaliseRequest(payload) {
  return {
    id: payload.id || null,
    title: String(payload.title || '').trim(),
    department: payload.department || '',
    projectId: payload.projectId || '',
    urgency: payload.urgency || 'normal',
    vessel: String(payload.vessel || '').trim(),
    justification: String(payload.justification || '').trim(),
    items: (payload.items || []).map((item) => ({
      id: item.id || uid('item'),
      description: String(item.description || '').trim(),
      qty: Number(item.qty),
      unit: item.unit || 'pcs',
      unitCost: Number(item.unitCost),
    })),
    attachments: payload.attachments || [],
  }
}

function validateRequest(draft, state) {
  if (draft.title.length < 3) return 'Give the request a title.'
  if (!draft.department) return 'Choose a department.'
  if (!state.projects.some((project) => project.id === draft.projectId)) return 'Allocate the request to a project.'
  if (draft.justification.length < 8) return 'Add a short justification.'
  if (!draft.items.length) return 'Add at least one line.'
  if (draft.items.some((item) => item.description.length < 2 || !(item.qty > 0) || Number.isNaN(item.unitCost) || item.unitCost < 0)) {
    return 'Each line needs a description, a quantity and a cost.'
  }
  return ''
}

function saveRequest(state, payload) {
  const user = actor(state)
  if (!user) return deny(state, 'Sign in to save a request.')
  const draft = normaliseRequest(payload)
  const error = validateRequest(draft, state)
  if (error) return deny(state, error)
  if (draft.id) {
    const existing = state.requests.find((item) => item.id === draft.id)
    if (!existing) return deny(state, 'Request not found.')
    if (!['draft', 'returned'].includes(existing.status)) return deny(state, 'Only a draft or a returned request can be edited.')
    if (user.role !== 'admin' && existing.requesterId !== user.id) return deny(state, 'You can edit your own requests.')
    const next = addHistory(
      {
        ...existing,
        ...draft,
        id: existing.id,
        status: existing.status,
        requesterId: existing.requesterId,
        number: existing.number,
        createdAt: existing.createdAt,
        approval: existing.approval,
        quoteApproval: existing.quoteApproval,
        history: existing.history,
      },
      user.id,
      'Request updated',
    )
    return flash(
      audit({ ...state, requests: mapById(state.requests, existing.id, () => next) }, 'Request updated', 'request', existing.id, next.number),
      'good',
      'Request saved.',
    )
  }
  if (!can(user, ['requester'])) return deny(state, 'Requesters raise new requests.')
  const numbered = nextNumber(state.counters, 'requests', 'PR')
  const created = addHistory(
    {
      ...draft,
      id: uid('req'),
      number: numbered.number,
      status: 'draft',
      requesterId: user.id,
      createdAt: nowIso(),
      approval: null,
      quoteApproval: null,
      history: [],
    },
    user.id,
    'Draft saved',
  )
  return flash(
    audit(
      { ...state, counters: numbered.counters, requests: [created, ...state.requests] },
      'Draft saved',
      'request',
      created.id,
      created.number,
    ),
    'good',
    `${created.number} saved as a draft.`,
    `#/requests/${created.id}`,
  )
}

function submitRequest(state, id) {
  const user = actor(state)
  const request = state.requests.find((item) => item.id === id)
  if (!request) return deny(state, 'Request not found.')
  if (user?.role !== 'admin' && request.requesterId !== user?.id) return deny(state, 'You can submit your own requests.')
  if (!['draft', 'returned'].includes(request.status)) return deny(state, 'This request is not ready to submit.')
  const requestDocs = approvalBlock(state, request, 'request')
  if (requestDocs) return deny(state, requestDocs)
  const levels = freshLevels(requestLevels(requestTotal(request), state.policy))
  const resubmitted = request.status === 'returned'
  const next = addHistory(
    { ...request, status: 'in_approval', approval: { levels } },
    user.id,
    resubmitted ? 'Request resubmitted' : 'Request submitted',
  )
  let nextState = audit(
    { ...state, requests: mapById(state.requests, id, () => next) },
    resubmitted ? 'Request resubmitted' : 'Request submitted',
    'request',
    id,
    `${next.number} entered approval.`,
  )
  nextState = notify(nextState, usersForLevel(nextState, levels[0]), {
    title: 'Request to review',
    body: `${next.number} ${next.title} is waiting for the ${levels[0].role}.`,
    href: `#/requests/${id}`,
  })
  return flash(nextState, 'good', `${next.number} submitted for approval.`)
}

function decideRequest(state, { id, decision, comment }) {
  const user = actor(state)
  const request = state.requests.find((item) => item.id === id)
  if (!request || request.status !== 'in_approval') return deny(state, 'This request is not awaiting a decision.')
  const levels = request.approval?.levels || []
  const level = pendingLevel(levels)
  if (!userMayDecide(state, user, level)) return deny(state, 'This decision sits with another officer.')
  if (alreadyActed(levels, user)) return deny(state, 'You already decided an earlier level. A different officer must take this one.')
  if ((decision === 'reject' || decision === 'return') && String(comment || '').trim().length < 3) {
    return deny(state, 'Add a comment so the requester knows what happened.')
  }
  if (decision === 'approve') {
    const block = approvalBlock(state, request, 'request')
    if (block) return deny(state, block)
  }
  const result = applyDecision(levels, user, decision, comment)
  if (result.error) return deny(state, result.error)
  let status = 'in_approval'
  let approval = { levels: result.levels }
  let action = 'Approval recorded'
  if (result.stopped === 'return') {
    status = 'returned'
    approval = null
    action = 'Returned for correction'
  } else if (result.stopped === 'reject') {
    status = 'rejected'
    action = 'Request rejected'
  } else if (result.done) {
    status = 'approved'
    action = 'Initial approval completed'
  }
  const next = addHistory({ ...request, status, approval }, user.id, action, comment || '')
  let nextState = audit(
    { ...state, requests: mapById(state.requests, id, () => next) },
    action,
    'request',
    id,
    `${request.number}: ${comment || action}`,
  )
  if (result.pending) {
    nextState = notify(nextState, usersForLevel(nextState, result.pending), {
      title: 'Approval waiting',
      body: `${request.number} ${request.title} needs the ${result.pending.role} level.`,
      href: `#/requests/${id}`,
    })
  }
  if (status === 'returned' || status === 'rejected') {
    nextState = notify(nextState, [request.requesterId], {
      title: status === 'returned' ? 'Request returned' : 'Request rejected',
      body: `${request.number} ${status === 'returned' ? 'needs a correction.' : 'was rejected.'}`,
      href: status === 'returned' ? `#/requests/${id}/edit` : `#/requests/${id}`,
    })
  }
  if (status === 'approved') {
    nextState = notify(nextState, procurementIds(nextState), {
      title: 'Ready to source',
      body: `${request.number} is approved. Collect supplier quotations.`,
      href: `#/requests/${id}`,
    })
  }
  const message =
    status === 'approved'
      ? `${request.number} is approved for sourcing.`
      : status === 'returned'
        ? `${request.number} was returned to the requester.`
        : status === 'rejected'
          ? `${request.number} was rejected.`
          : 'Decision recorded. The next officer has been notified.'
  return flash(nextState, 'good', message)
}

function commentOnRequest(state, { id, comment }) {
  const user = actor(state)
  if (!user) return deny(state, 'Sign in to comment.')
  const text = String(comment || '').trim()
  if (text.length < 2) return deny(state, 'Write a comment first.')
  const request = state.requests.find((item) => item.id === id)
  if (!request) return deny(state, 'Request not found.')
  const next = addHistory(request, user.id, 'Comment', text)
  return flash(audit({ ...state, requests: mapById(state.requests, id, () => next) }, 'Comment', 'request', id, text), 'good', 'Comment added to the history.')
}

function addQuotation(state, payload) {
  const user = actor(state)
  if (!can(user, ['procurement'])) return deny(state, 'Procurement records supplier quotations.')
  const request = state.requests.find((item) => item.id === payload.requestId)
  if (!request || !['approved', 'sourcing'].includes(request.status)) {
    return deny(state, 'Quotations open after approval, and close once a recommendation is sent.')
  }
  const supplier = state.suppliers.find((item) => item.id === payload.supplierId && item.status === 'active')
  if (!supplier) return deny(state, 'Choose an active supplier.')
  const amount = Number(payload.amount)
  if (!(amount > 0)) return deny(state, 'Enter the quoted amount.')
  if (!String(payload.reference || '').trim() || !String(payload.deliveryTerms || '').trim()) {
    return deny(state, 'Add the supplier reference and the delivery terms.')
  }
  const open = state.quotations.some(
    (quote) => quote.requestId === request.id && quote.supplierId === supplier.id && ['received', 'recommended'].includes(quote.status),
  )
  if (open) return deny(state, 'This supplier already has an open quotation on the request.')
  const numbered = nextNumber(state.counters, 'quotations', 'QT')
  const created = {
    id: uid('q'),
    number: numbered.number,
    requestId: request.id,
    supplierId: supplier.id,
    reference: String(payload.reference).trim(),
    amount,
    deliveryTerms: String(payload.deliveryTerms).trim(),
    leadDays: Number(payload.leadDays) || 0,
    validity: payload.validity || '',
    warranty: payload.warranty || '',
    notes: payload.notes || '',
    priceNote: payload.priceNote || '',
    deliveryNote: payload.deliveryNote || '',
    qualityNote: payload.qualityNote || '',
    complianceNote: payload.complianceNote || '',
    attachmentName: payload.attachmentName && canFileDocuments(user) ? payload.attachmentName : '',
    status: 'received',
    recommended: false,
    justification: '',
    createdAt: nowIso(),
    createdBy: user.id,
  }
  const nextRequest = addHistory(
    { ...request, status: 'sourcing' },
    user.id,
    'Quotation received',
    `${supplier.name} · ${created.reference}`,
  )
  const nextState = audit(
    {
      ...state,
      counters: numbered.counters,
      quotations: [created, ...state.quotations],
      requests: mapById(state.requests, request.id, () => nextRequest),
    },
    'Quotation recorded',
    'quotation',
    created.id,
    `${created.number} from ${supplier.name} on ${request.number}.`,
  )
  const kept = Boolean(payload.attachmentName) && canFileDocuments(user)
  const dropped = Boolean(payload.attachmentName) && !kept
  return flash(
    nextState,
    'good',
    dropped
      ? `${created.number} recorded from ${supplier.name}. The file was not added. Only the HOD, accounts, the MD and the site admin can upload documents.`
      : `${created.number} recorded from ${supplier.name}.`,
  )
}

function recommendQuotation(state, { requestId, quotationId, justification }) {
  const user = actor(state)
  if (!can(user, ['procurement'])) return deny(state, 'Procurement sends the recommendation.')
  const text = String(justification || '').trim()
  if (text.length < 8) return deny(state, 'Explain why this quotation should be approved.')
  const request = state.requests.find((item) => item.id === requestId)
  if (!request || request.status !== 'sourcing') return deny(state, 'A recommendation can be sent while the request is in sourcing.')
  const quotes = state.quotations.filter((quote) => quote.requestId === requestId && quote.status === 'received')
  if (quotes.length < 2) return deny(state, 'Add at least two quotations so the approver can compare them.')
  const chosen = quotes.find((quote) => quote.id === quotationId)
  if (!chosen) return deny(state, 'Choose one of the open quotations.')
  const levels = freshLevels(quotationLevels(chosen.amount, state.policy))
  const quotations = state.quotations.map((quote) =>
    quote.id === chosen.id ? { ...quote, status: 'recommended', recommended: true, justification: text } : quote,
  )
  const nextRequest = addHistory(
    { ...request, status: 'recommended', quoteApproval: { levels } },
    user.id,
    'Quotation recommended',
    text,
  )
  let nextState = audit(
    { ...state, quotations, requests: mapById(state.requests, requestId, () => nextRequest) },
    'Quotation recommended',
    'quotation',
    chosen.id,
    `${chosen.number} sent for designated approval.`,
  )
  nextState = notify(nextState, usersForLevel(nextState, levels[0]), {
    title: 'Quotation recommendation',
    body: `${chosen.reference} is recommended on ${request.number}.`,
    href: `#/requests/${requestId}`,
  })
  return flash(nextState, 'good', 'Recommendation sent to the designated approver.')
}

function issueOrder(state, request, chosen, levels, user, comment) {
  const numbered = nextNumber(state.counters, 'orders', 'PO')
  const order = {
    id: uid('po'),
    number: numbered.number,
    requestId: request.id,
    quotationId: chosen.id,
    supplierId: chosen.supplierId,
    projectId: request.projectId,
    items: buildPoItems(request, chosen.amount),
    total: chosen.amount,
    deliveryTerms: chosen.deliveryTerms,
    issuedAt: nowIso(),
    issuedBy: user.id,
    status: 'issued',
    revisions: [],
    cancellation: null,
    increasePending: null,
  }
  const supplier = state.suppliers.find((item) => item.id === chosen.supplierId)
  const quotations = state.quotations.map((quote) => {
    if (quote.id === chosen.id) return { ...quote, status: 'approved', recommended: true }
    if (quote.requestId === request.id && quote.status === 'received') return { ...quote, status: 'superseded' }
    return quote
  })
  const nextRequest = addHistory(
    { ...request, status: 'po_issued', quoteApproval: { levels } },
    user.id,
    `Purchase order ${order.number} issued to ${supplier?.name || 'the supplier'}`,
    comment || '',
  )
  let nextState = audit(
    {
      ...state,
      counters: numbered.counters,
      orders: [order, ...state.orders],
      quotations,
      requests: mapById(state.requests, request.id, () => nextRequest),
    },
    'Purchase order issued',
    'order',
    order.id,
    `${order.number} generated from ${chosen.number} after quotation approval.`,
  )
  nextState = notify(nextState, [request.requesterId, ...procurementIds(nextState)], {
    title: 'Purchase order issued',
    body: `${order.number} is ready for ${supplier?.name || 'the supplier'}.`,
    href: `#/orders/${order.id}`,
  })
  return flash(nextState, 'good', `${order.number} generated and issued.`, `#/orders/${order.id}`)
}

function decideQuotation(state, { requestId, decision, comment }) {
  const user = actor(state)
  const request = state.requests.find((item) => item.id === requestId)
  if (!request || request.status !== 'recommended') return deny(state, 'No quotation is waiting for approval.')
  const levels = request.quoteApproval?.levels || []
  const level = pendingLevel(levels)
  if (!userMayDecide(state, user, level)) return deny(state, 'This quotation sits with the designated approver.')
  if (alreadyActed(levels, user)) return deny(state, 'You already decided an earlier level. A different officer must take this one.')
  if (decision === 'reject' && String(comment || '').trim().length < 3) return deny(state, 'Say why the recommendation is rejected.')
  if (decision !== 'reject') {
    const block = approvalBlock(state, request, 'quotation')
    if (block) return deny(state, block)
  }
  const result = applyDecision(levels, user, decision === 'reject' ? 'reject' : 'approve', comment)
  if (result.error) return deny(state, result.error)
  if (result.stopped === 'reject') {
    const quotations = state.quotations.map((quote) =>
      quote.requestId === requestId && quote.status === 'recommended'
        ? { ...quote, status: 'rejected', recommended: false }
        : quote,
    )
    const nextRequest = addHistory({ ...request, status: 'sourcing', quoteApproval: null }, user.id, 'Recommendation rejected', comment)
    let nextState = audit(
      { ...state, quotations, requests: mapById(state.requests, requestId, () => nextRequest) },
      'Recommendation rejected',
      'request',
      requestId,
      comment,
    )
    nextState = notify(nextState, procurementIds(nextState), {
      title: 'Recommendation rejected',
      body: `${request.number} is back in sourcing.`,
      href: `#/requests/${requestId}`,
    })
    return flash(nextState, 'good', 'Recommendation rejected. Procurement can choose another offer.')
  }
  if (!result.done) {
    const nextRequest = addHistory(
      { ...request, quoteApproval: { levels: result.levels } },
      user.id,
      'Quotation approval recorded',
      comment || '',
    )
    let nextState = audit(
      { ...state, requests: mapById(state.requests, requestId, () => nextRequest) },
      'Quotation approval recorded',
      'request',
      requestId,
      comment || request.number,
    )
    nextState = notify(nextState, usersForLevel(nextState, result.pending), {
      title: 'Quotation needs another approval',
      body: `${request.number} is above the executive threshold.`,
      href: `#/requests/${requestId}`,
    })
    return flash(nextState, 'good', 'Recorded. The next approver has been notified.')
  }
  const chosen = state.quotations.find((quote) => quote.requestId === requestId && quote.status === 'recommended')
  if (!chosen) return deny(state, 'The recommended quotation is missing.')
  return issueOrder(state, request, chosen, result.levels, user, comment)
}

function revisePo(state, { id, reason, deliveryTerms, total }) {
  const user = actor(state)
  if (!can(user, ['procurement'])) return deny(state, 'Procurement logs purchase order revisions.')
  const order = state.orders.find((item) => item.id === id)
  if (!order || order.status === 'cancelled' || order.status === 'closed') return deny(state, 'This purchase order cannot be revised.')
  if (order.increasePending) return deny(state, 'An increase is already waiting for approval.')
  const text = String(reason || '').trim()
  if (text.length < 3) return deny(state, 'Record why the order is changing.')
  const nextTotal = Number(total)
  if (!(nextTotal > 0)) return deny(state, 'Enter the revised total.')
  const request = state.requests.find((item) => item.id === order.requestId)
  if (nextTotal > order.total) {
    const next = {
      ...order,
      increasePending: {
        total: nextTotal,
        reason: text,
        deliveryTerms: deliveryTerms || order.deliveryTerms,
        requestedBy: user.id,
        at: nowIso(),
      },
    }
    let nextState = audit(
      { ...state, orders: mapById(state.orders, id, () => next) },
      'Increase requested',
      'order',
      id,
      `${order.number} increase requested. ${text}`,
    )
    nextState = notify(
      nextState,
      usersForLevel(nextState, { role: 'approver', designatedUserId: state.policy.quotationApproverId, status: 'pending' }),
      {
        title: 'Purchase order increase',
        body: `${order.number} needs approval before the total can rise.`,
        href: `#/orders/${id}`,
      },
    )
    return flash(nextState, 'good', 'Increase sent for approval. The issued total still stands.')
  }
  const revision = { id: uid('rev'), at: nowIso(), actorId: user.id, reason: text, previousTotal: order.total, total: nextTotal }
  const next = {
    ...order,
    total: nextTotal,
    deliveryTerms: deliveryTerms || order.deliveryTerms,
    items: request ? buildPoItems(request, nextTotal) : order.items,
    revisions: [...order.revisions, revision],
  }
  let nextState = { ...state, orders: mapById(state.orders, id, () => next) }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Purchase order revised', text)),
    }
  }
  return flash(audit(nextState, 'Purchase order revised', 'order', id, `${order.number}: ${text}`), 'good', `${order.number} revision logged.`)
}

function decideIncrease(state, { id, decision, comment }) {
  const user = actor(state)
  const order = state.orders.find((item) => item.id === id)
  if (!order?.increasePending) return deny(state, 'No increase is waiting.')
  const level = { role: 'approver', status: 'pending', designatedUserId: state.policy.quotationApproverId }
  const needsManagement = order.increasePending.total > state.policy.quotationManagementAbove
  const allowed = userMayDecide(state, user, level) || (needsManagement && user?.role === 'management') || user?.role === 'admin'
  if (!allowed) return deny(state, 'An approver needs to authorise a higher total.')
  if (decision === 'reject') {
    if (String(comment || '').trim().length < 3) return deny(state, 'Say why the increase is refused.')
    const next = { ...order, increasePending: null }
    return flash(
      audit({ ...state, orders: mapById(state.orders, id, () => next) }, 'Increase refused', 'order', id, comment),
      'good',
      'Increase refused. The issued total is unchanged.',
    )
  }
  const pending = order.increasePending
  const request = state.requests.find((item) => item.id === order.requestId)
  const block = approvalBlock(state, request, 'po_waybill')
  if (block) return deny(state, block)
  const revision = {
    id: uid('rev'),
    at: nowIso(),
    actorId: user.id,
    reason: pending.reason,
    previousTotal: order.total,
    total: pending.total,
  }
  const next = {
    ...order,
    total: pending.total,
    deliveryTerms: pending.deliveryTerms || order.deliveryTerms,
    items: request ? buildPoItems(request, pending.total) : order.items,
    revisions: [...order.revisions, revision],
    increasePending: null,
  }
  let nextState = { ...state, orders: mapById(state.orders, id, () => next) }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Purchase order increase approved', pending.reason)),
    }
  }
  return flash(
    audit(nextState, 'Purchase order increased', 'order', id, `${order.number} revised after approval.`),
    'good',
    `${order.number} updated to the approved total.`,
  )
}

function cancelPo(state, { id, reason }) {
  const user = actor(state)
  if (!can(user, ['procurement', 'approver'])) return deny(state, 'Procurement or an approver can cancel an order.')
  const text = String(reason || '').trim()
  if (text.length < 3) return deny(state, 'Record why the order is cancelled.')
  const order = state.orders.find((item) => item.id === id)
  if (!order || order.status === 'cancelled') return deny(state, 'This order is already cancelled.')
  const paid = state.invoices.some(
    (invoice) => invoice.poId === order.id && state.payments.some((payment) => payment.invoiceId === invoice.id && disbursed(payment) > 0),
  )
  if (paid) return deny(state, 'A payment is already recorded against this order, so it cannot be cancelled.')
  const next = { ...order, status: 'cancelled', cancellation: { at: nowIso(), by: user.id, reason: text }, increasePending: null }
  const invoices = state.invoices.map((invoice) =>
    invoice.poId === order.id && !['paid', 'rejected', 'duplicate'].includes(invoice.status)
      ? {
          ...invoice,
          status: 'rejected',
          history: [...invoice.history, { id: uid('h'), at: nowIso(), actorId: user.id, action: 'Invoice rejected because the purchase order was cancelled', comment: text }],
        }
      : invoice,
  )
  const request = state.requests.find((item) => item.id === order.requestId)
  let nextState = { ...state, orders: mapById(state.orders, id, () => next), invoices }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(nextState.requests, request.id, () => addHistory({ ...request, status: 'cancelled' }, user.id, 'Purchase order cancelled', text)),
    }
  }
  return flash(audit(nextState, 'Purchase order cancelled', 'order', id, `${order.number}: ${text}`), 'good', `${order.number} cancelled.`)
}

function saveSupplier(state, payload) {
  const user = actor(state)
  if (!can(user, ['procurement', 'finance'])) return deny(state, 'Procurement maintains supplier profiles.')
  const name = String(payload.name || '').trim()
  if (name.length < 2) return deny(state, 'Enter the supplier name.')
  const record = {
    name,
    category: payload.category || 'General',
    contactName: payload.contactName || '',
    email: String(payload.email || '').trim(),
    phone: payload.phone || '',
    address: payload.address || '',
    taxId: payload.taxId || '',
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    paymentTerms: PAYMENT_TERMS.some((term) => term.id === payload.paymentTerms) ? payload.paymentTerms : '',
    paymentDays: payload.paymentTerms === 'days' && Number(payload.paymentDays) > 0 ? Math.round(Number(payload.paymentDays)) : null,
  }
  if (payload.id) {
    const existing = state.suppliers.find((item) => item.id === payload.id)
    if (!existing) return deny(state, 'Supplier not found.')
    const documents = payload.documentName
      ? [...existing.documents, { id: uid('doc'), name: payload.documentName }]
      : existing.documents
    const next = { ...existing, ...record, documents }
    return flash(
      audit({ ...state, suppliers: mapById(state.suppliers, payload.id, () => next) }, 'Supplier updated', 'supplier', payload.id, name),
      'good',
      'Supplier updated.',
    )
  }
  const created = {
    ...record,
    id: uid('s'),
    documents: payload.documentName ? [{ id: uid('doc'), name: payload.documentName }] : [],
  }
  return flash(
    audit({ ...state, suppliers: [created, ...state.suppliers] }, 'Supplier added', 'supplier', created.id, name),
    'good',
    `${name} added.`,
  )
}

function saveInvoice(state, payload) {
  const user = actor(state)
  if (!can(user, ['finance', 'procurement'])) return deny(state, 'Finance or procurement records supplier invoices.')
  const order = state.orders.find((item) => item.id === payload.poId)
  if (!order || order.status === 'cancelled' || order.status === 'closed') return deny(state, 'Choose a live purchase order.')
  if (order.increasePending) return deny(state, 'Resolve the pending order increase before invoicing.')
  const reference = String(payload.reference || '').trim()
  const amount = Number(payload.amount)
  if (!reference || !(amount > 0) || !payload.invoiceDate || !payload.dueDate) return deny(state, 'Reference, dates and amount are required.')
  if (payload.dueDate < payload.invoiceDate) return deny(state, 'The due date cannot be before the invoice date.')
  const request = state.requests.find((item) => item.id === order.requestId)
  const duplicate = state.invoices.find(
    (invoice) =>
      invoice.supplierId === order.supplierId &&
      invoice.reference.toLowerCase() === reference.toLowerCase() &&
      invoice.status !== 'rejected',
  )
  let status = 'submitted'
  let matchNote = 'Supplier and project match the purchase order. Waiting for finance to accept the match.'
  let duplicateOf = null
  if (duplicate) {
    status = 'duplicate'
    duplicateOf = duplicate.id
    matchNote = 'Same supplier and invoice reference as an invoice already on file.'
  } else {
    const remaining = order.total - poInvoiced(state, order.id)
    const tolerance = Number(state.policy.varianceTolerance) || 0
    if (amount > remaining + tolerance) {
      status = 'mismatch'
      matchNote = 'Invoice is above the open purchase order balance and needs a mismatch review.'
    } else if (amount + tolerance < remaining) {
      matchNote = 'Partial invoice inside the open purchase order balance. Waiting for finance to accept the match.'
    }
  }
  const numbered = nextNumber(state.counters, 'invoices', 'INV')
  const created = {
    id: uid('inv'),
    reference,
    supplierId: order.supplierId,
    poId: order.id,
    projectId: order.projectId,
    requestId: order.requestId,
    department: request?.department || '',
    invoiceDate: payload.invoiceDate,
    dueDate: payload.dueDate,
    amount,
    description: payload.description || '',
    attachmentName: payload.attachmentName && canFileDocuments(user) ? payload.attachmentName : '',
    status,
    matchNote,
    duplicateOf,
    paidAmount: 0,
    priorStatus: null,
    createdAt: nowIso(),
    createdBy: user.id,
    history: [
      {
        id: uid('h'),
        at: nowIso(),
        actorId: user.id,
        action: status === 'duplicate' ? 'Flagged as a duplicate invoice reference' : 'Invoice recorded',
        comment: matchNote,
      },
    ],
  }
  let nextState = {
    ...state,
    counters: numbered.counters,
    invoices: [created, ...state.invoices],
  }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Invoice submitted', `${reference} · ${status}`)),
    }
  }
  nextState = audit(
    nextState,
    status === 'duplicate' ? 'Duplicate invoice flagged' : 'Invoice recorded',
    'invoice',
    created.id,
    `${reference} on ${order.number}. ${matchNote}`,
  )
  const tone = status === 'submitted' ? 'good' : 'bad'
  const message =
    status === 'duplicate'
      ? `${reference} flagged as a duplicate.`
      : status === 'mismatch'
        ? `${reference} flagged because it does not match the purchase order.`
        : `${reference} recorded. Finance still needs to accept the match.`
  const droppedFile = Boolean(payload.attachmentName) && !canFileDocuments(user)
  return flash(
    nextState,
    tone,
    droppedFile ? `${message} The file was not added. Only the HOD, accounts, the MD and the site admin can upload documents.` : message,
    `#/invoices/${created.id}`,
  )
}

function resolveInvoice(state, { id, decision, comment }) {
  const user = actor(state)
  if (!can(user, ['finance'])) return deny(state, 'Finance resolves invoice matches.')
  const invoice = state.invoices.find((item) => item.id === id)
  if (!invoice) return deny(state, 'Invoice not found.')
  const text = String(comment || '').trim()
  const order = state.orders.find((item) => item.id === invoice.poId)
  const project = state.projects.find((item) => item.id === invoice.projectId)
  const request = state.requests.find((item) => item.id === invoice.requestId)

  if (decision === 'reject') {
    if (text.length < 3) return deny(state, 'Say why the invoice is rejected.')
    const next = {
      ...invoice,
      status: 'rejected',
      history: [...invoice.history, { id: uid('h'), at: nowIso(), actorId: user.id, action: 'Invoice rejected', comment: text }],
    }
    let nextState = { ...state, invoices: mapById(state.invoices, id, () => next) }
    if (request) {
      nextState = { ...nextState, requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Invoice rejected', text)) }
    }
    return flash(audit(nextState, 'Invoice rejected', 'invoice', id, text), 'good', 'Invoice rejected.')
  }
  if (decision === 'accept' || decision === 'accept-variance') {
    const block = approvalBlock(state, request, 'vendor_invoice')
    if (block) return deny(state, block)
  }

  if (decision === 'release') {
    if (invoice.status !== 'duplicate') return deny(state, 'Only a duplicate can be released.')
    const remaining = order.total - poInvoiced({ ...state, invoices: state.invoices.filter((item) => item.id !== invoice.id) }, order.id)
    const status = invoice.amount > remaining + (Number(state.policy.varianceTolerance) || 0) ? 'mismatch' : 'submitted'
    const next = {
      ...invoice,
      status,
      duplicateOf: null,
      matchNote: 'Released from the duplicate flag for a fresh match.',
      history: [...invoice.history, { id: uid('h'), at: nowIso(), actorId: user.id, action: 'Duplicate released', comment: text }],
    }
    return flash(
      audit({ ...state, invoices: mapById(state.invoices, id, () => next) }, 'Duplicate released', 'invoice', id, invoice.reference),
      'good',
      'Duplicate released. Complete the match review.',
    )
  }

  if (!['submitted', 'mismatch'].includes(invoice.status)) return deny(state, 'This invoice is not waiting for a match decision.')
  if (invoice.status === 'mismatch' && decision !== 'accept-variance') return deny(state, 'Accept the variance explicitly, or reject the invoice.')
  if (decision === 'accept-variance' && text.length < 3) return deny(state, 'Record why the variance is accepted.')

  const needsHold = Boolean(project?.paymentHold)
  let counters = state.counters
  let verifications = state.verifications
  let nextInvoice = invoice
  if (needsHold) {
    const milestone = (project.milestones || []).find((item) => item.verificationRequired && item.status !== 'verified')
    const owner = state.users.find((item) => item.id === project.ownerId)
    const assignee = owner?.role === 'verifier' && owner.active ? owner.id : state.users.find((item) => item.role === 'verifier' && item.active)?.id
    const numbered = nextNumber(counters, 'verifications', 'VER')
    counters = numbered.counters
    verifications = [
      {
        id: uid('ver'),
        number: numbered.number,
        projectId: project.id,
        poId: order.id,
        invoiceId: invoice.id,
        requestId: invoice.requestId,
        milestoneId: milestone?.id || null,
        assigneeId: assignee,
        status: 'assigned',
        checklist: defaultChecklist(),
        deliveryConfirmed: false,
        remarks: '',
        evidence: [],
        createdAt: nowIso(),
        decidedAt: null,
        decidedBy: null,
      },
      ...verifications,
    ]
    nextInvoice = {
      ...invoice,
      status: 'held',
      matchNote: text || invoice.matchNote,
      history: [...invoice.history, { id: uid('h'), at: nowIso(), actorId: user.id, action: 'Match accepted and payment held for verification', comment: text }],
    }
  } else {
    nextInvoice = {
      ...invoice,
      status: 'approved',
      matchNote: text || invoice.matchNote,
      history: [
        ...invoice.history,
        { id: uid('h'), at: nowIso(), actorId: user.id, action: decision === 'accept-variance' ? 'Variance accepted' : 'Match accepted', comment: text },
      ],
    }
  }
  let nextState = { ...state, counters, verifications, invoices: mapById(state.invoices, id, () => nextInvoice) }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(
        nextState.requests,
        request.id,
        () => addHistory(request, user.id, nextInvoice.status === 'held' ? 'Invoice held for verification' : 'Invoice approved for payment', text),
      ),
    }
  }
  if (nextInvoice.status === 'held') {
    const verification = verifications[0]
    nextState = notify(nextState, [verification.assigneeId], {
      title: 'Verification assigned',
      body: `${verification.number} must be approved before ${invoice.reference} can be paid.`,
      href: `#/projects/${project.id}?verification=${verification.id}`,
    })
  }
  nextState = audit(nextState, nextInvoice.status === 'held' ? 'Invoice held' : 'Invoice approved', 'invoice', id, invoice.reference)
  return flash(
    nextState,
    'good',
    nextInvoice.status === 'held' ? 'Matched. Payment is held until verification is approved.' : 'Invoice approved for payment.',
  )
}

function saveVerification(state, { id, checklist, deliveryConfirmed, remarks, evidence, decision }) {
  const user = actor(state)
  const verification = state.verifications.find((item) => item.id === id)
  if (!verification || verification.status !== 'assigned') return deny(state, 'This verification is already decided.')
  if (!(user?.role === 'admin' || user?.id === verification.assigneeId)) return deny(state, 'This checklist is assigned to another verifier.')
  const next = {
    ...verification,
    checklist: checklist || verification.checklist,
    deliveryConfirmed: Boolean(deliveryConfirmed),
    remarks: remarks ?? verification.remarks,
    evidence: evidence || verification.evidence,
  }
  if (!decision) {
    return flash({ ...state, verifications: mapById(state.verifications, id, () => next) }, 'good', 'Verification progress saved.')
  }
  const request = state.requests.find((item) => item.id === verification.requestId)
  const invoice = state.invoices.find((item) => item.id === verification.invoiceId)
  if (decision === 'approve') {
    const block = approvalBlock(state, request, 'po_waybill')
    if (block) return deny(state, block)
  }
  if (decision === 'reject') {
    if (String(remarks || '').trim().length < 3) return deny(state, 'Record why delivery is refused.')
    const refused = { ...next, status: 'rejected', decidedAt: nowIso(), decidedBy: user.id }
    let invoices = state.invoices
    if (invoice) {
      invoices = mapById(invoices, invoice.id, () => ({
        ...invoice,
        status: 'rejected',
        history: [...invoice.history, { id: uid('h'), at: nowIso(), actorId: user.id, action: 'Invoice rejected after delivery was refused', comment: remarks }],
      }))
    }
    let nextState = { ...state, invoices, verifications: mapById(state.verifications, id, () => refused) }
    if (request) nextState = { ...nextState, requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Delivery refused', remarks)) }
    nextState = notify(nextState, [...procurementIds(nextState), ...financeIds(nextState)], {
      title: 'Delivery refused',
      body: `${verification.number} was refused. The invoice cannot be paid.`,
      href: `#/projects/${verification.projectId}`,
    })
    return flash(audit(nextState, 'Delivery refused', 'verification', id, remarks), 'good', 'Delivery refused and the invoice was rejected.')
  }
  if (next.checklist.some((item) => !item.done) || !next.deliveryConfirmed) {
    return deny(state, 'Complete every checklist item and confirm delivery before approving.')
  }
  if (String(next.remarks || '').trim().length < 3) return deny(state, 'Add the project remarks before approving.')
  const approved = { ...next, status: 'approved', decidedAt: nowIso(), decidedBy: user.id }
  let invoices = state.invoices
  if (invoice && invoice.status === 'held') {
    invoices = mapById(invoices, invoice.id, () => ({
      ...invoice,
      status: 'approved',
      history: [...invoice.history, { id: uid('h'), at: nowIso(), actorId: user.id, action: 'Verification released the invoice for payment', comment: next.remarks }],
    }))
  }
  let projects = state.projects
  const project = state.projects.find((item) => item.id === verification.projectId)
  if (project) {
    projects = mapById(projects, project.id, () => ({
      ...project,
      milestones: project.milestones.map((item) => (item.id === verification.milestoneId ? { ...item, status: 'verified' } : item)),
      updates: [{ id: uid('pu'), at: nowIso(), actorId: user.id, text: `${verification.number} approved. ${next.remarks}` }, ...project.updates],
    }))
  }
  let nextState = { ...state, invoices, projects, verifications: mapById(state.verifications, id, () => approved) }
  if (request) nextState = { ...nextState, requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Delivery verified', next.remarks)) }
  nextState = notify(nextState, financeIds(nextState), {
    title: 'Invoice released',
    body: invoice ? `${invoice.reference} can now be scheduled for payment.` : `${verification.number} approved.`,
    href: invoice ? `#/invoices/${invoice.id}` : `#/projects/${verification.projectId}`,
  })
  return flash(audit(nextState, 'Delivery verified', 'verification', id, verification.number), 'good', 'Verification approved. The payment hold is lifted.')
}

function payableLine(state, schedule, invoice, amount) {
  if (!invoice) return 'An invoice on the schedule could not be found.'
  if (!['approved', 'partially_paid'].includes(invoice.status)) return `${invoice.reference} is not payable yet.`
  if (invoice.dueDate < schedule.from || invoice.dueDate > schedule.to) return `${invoice.reference} does not fall in this window.`
  const open = invoiceOutstanding(invoice) - lockedAmount(state, invoice.id)
  if (!(amount > 0) || amount > open + 0.01) return `${invoice.reference} can only be scheduled up to the open balance.`
  return ''
}

function createSchedule(state, { from, to, lines }) {
  const user = actor(state)
  if (!can(user, ['finance'])) return deny(state, 'Finance prepares the payment schedule.')
  if (!from || !to || from > to) return deny(state, 'Choose a valid payment window.')
  const holder = { from, to }
  const clean = []
  for (const line of lines || []) {
    const invoice = state.invoices.find((item) => item.id === line.invoiceId)
    const amount = Number(line.amount)
    const error = payableLine(state, holder, invoice, amount)
    if (error) return deny(state, error)
    clean.push({ invoiceId: invoice.id, amount, priorStatus: invoice.status })
  }
  if (!clean.length) return deny(state, 'Select at least one invoice in the window.')
  const numbered = nextNumber(state.counters, 'schedules', 'PS')
  const schedule = {
    id: uid('sch'),
    number: numbered.number,
    from,
    to,
    createdBy: user.id,
    createdAt: nowIso(),
    status: 'draft',
    comment: '',
    decidedBy: null,
    decidedAt: null,
    approval: null,
    lines: clean,
  }
  const invoices = state.invoices.map((invoice) => {
    const line = clean.find((item) => item.invoiceId === invoice.id)
    if (!line) return invoice
    return { ...invoice, status: 'scheduled', priorStatus: line.priorStatus }
  })
  const nextState = audit(
    { ...state, counters: numbered.counters, schedules: [schedule, ...state.schedules], invoices },
    'Payment schedule drafted',
    'schedule',
    schedule.id,
    `${schedule.number} ${from} to ${to}.`,
  )
  return flash(nextState, 'good', `${schedule.number} drafted. Submit it for authorisation.`, `#/payments/${schedule.id}`)
}

function updateSchedule(state, { id, lines }) {
  const user = actor(state)
  if (!can(user, ['finance'])) return deny(state, 'Finance edits the draft schedule.')
  const schedule = state.schedules.find((item) => item.id === id)
  if (!schedule || schedule.status !== 'draft') return deny(state, 'Only a draft schedule can be edited.')
  const restored = state.invoices.map((invoice) => {
    const line = schedule.lines.find((item) => item.invoiceId === invoice.id)
    if (!line) return invoice
    return { ...invoice, status: line.priorStatus || 'approved', priorStatus: null }
  })
  const virtual = { ...state, invoices: restored, schedules: state.schedules.filter((item) => item.id !== id) }
  const clean = []
  for (const line of lines || []) {
    const invoice = restored.find((item) => item.id === line.invoiceId)
    const amount = Number(line.amount)
    const error = payableLine(virtual, schedule, invoice, amount)
    if (error) return deny(state, error)
    clean.push({ invoiceId: invoice.id, amount, priorStatus: invoice.status })
  }
  if (!clean.length) return deny(state, 'Keep at least one invoice on the draft.')
  const invoices = restored.map((invoice) => {
    const line = clean.find((item) => item.invoiceId === invoice.id)
    if (!line) return invoice
    return { ...invoice, status: 'scheduled', priorStatus: line.priorStatus }
  })
  return flash(
    audit(
      { ...state, invoices, schedules: mapById(state.schedules, id, () => ({ ...schedule, lines: clean })) },
      'Payment schedule updated',
      'schedule',
      id,
      schedule.number,
    ),
    'good',
    'Schedule updated.',
  )
}

function submitSchedule(state, id) {
  const user = actor(state)
  if (!can(user, ['finance'])) return deny(state, 'Finance submits the schedule for authorisation.')
  const schedule = state.schedules.find((item) => item.id === id)
  if (!schedule || schedule.status !== 'draft') return deny(state, 'Only a draft schedule can be submitted.')
  if (!schedule.lines.length) return deny(state, 'The schedule has no invoices.')
  const scheduleBlock = scheduleDocumentBlock(state, schedule, 'mobilization')
  if (scheduleBlock) return deny(state, scheduleBlock)
  const total = schedule.lines.reduce((sum, line) => sum + Number(line.amount), 0)
  const levels = freshLevels(paymentLevels(total, state.policy))
  const next = { ...schedule, status: 'pending_approval', approval: { levels } }
  let nextState = audit(
    { ...state, schedules: mapById(state.schedules, id, () => next) },
    'Payment schedule submitted',
    'schedule',
    id,
    schedule.number,
  )
  nextState = notify(nextState, usersForLevel(nextState, levels[0]), {
    title: 'Payment authorisation',
    body: `${schedule.number} is waiting for authorisation.`,
    href: `#/payments/${id}`,
  })
  return flash(nextState, 'good', `${schedule.number} sent for authorisation.`)
}

function decideSchedule(state, { id, decision, comment }) {
  const user = actor(state)
  const schedule = state.schedules.find((item) => item.id === id)
  if (!schedule || schedule.status !== 'pending_approval') return deny(state, 'This schedule is not waiting for authorisation.')
  const levels = schedule.approval?.levels || []
  const level = pendingLevel(levels)
  if (!userMayDecide(state, user, level)) return deny(state, 'A designated approver authorises this schedule.')
  if (alreadyActed(levels, user)) return deny(state, 'You already decided an earlier level. A different officer must take this one.')
  if (decision === 'reject' && String(comment || '').trim().length < 3) return deny(state, 'Say why the schedule is rejected.')
  if (decision !== 'reject') {
    const block = scheduleDocumentBlock(state, schedule, 'mobilization')
    if (block) return deny(state, block)
  }
  const result = applyDecision(levels, user, decision === 'reject' ? 'reject' : 'approve', comment)
  if (result.error) return deny(state, result.error)
  if (result.stopped === 'reject') {
    const invoices = state.invoices.map((invoice) => {
      const line = schedule.lines.find((item) => item.invoiceId === invoice.id)
      if (!line) return invoice
      return { ...invoice, status: line.priorStatus || 'approved' }
    })
    const next = { ...schedule, status: 'rejected', approval: { levels: result.levels }, decidedBy: user.id, decidedAt: nowIso(), comment: comment || '' }
    return flash(
      audit({ ...state, invoices, schedules: mapById(state.schedules, id, () => next) }, 'Payment schedule rejected', 'schedule', id, comment),
      'good',
      'Schedule rejected and the invoices were released.',
    )
  }
  if (!result.done) {
    const next = { ...schedule, approval: { levels: result.levels } }
    let nextState = audit(
      { ...state, schedules: mapById(state.schedules, id, () => next) },
      'Payment authorisation recorded',
      'schedule',
      id,
      comment || '',
    )
    nextState = notify(nextState, usersForLevel(nextState, result.pending), {
      title: 'Payment needs another authorisation',
      body: `${schedule.number} is above the executive threshold.`,
      href: `#/payments/${id}`,
    })
    return flash(nextState, 'good', 'Recorded. The next approver has been notified.')
  }
  let counters = state.counters
  const payments = []
  for (const line of schedule.lines) {
    const invoice = state.invoices.find((item) => item.id === line.invoiceId)
    const numbered = nextNumber(counters, 'payments', 'PAY')
    counters = numbered.counters
    payments.push({
      id: uid('pay'),
      number: numbered.number,
      scheduleId: schedule.id,
      invoiceId: line.invoiceId,
      supplierId: invoice.supplierId,
      projectId: invoice.projectId,
      department: invoice.department,
      amountDue: line.amount,
      approvedAmount: line.amount,
      status: 'authorised',
      disbursements: [],
      notifications: [],
      createdAt: nowIso(),
    })
  }
  const next = { ...schedule, status: 'authorised', approval: { levels: result.levels }, decidedBy: user.id, decidedAt: nowIso() }
  let nextState = {
    ...state,
    counters,
    payments: [...payments, ...state.payments],
    schedules: mapById(state.schedules, id, () => next),
  }
  nextState = audit(
    nextState,
    'Payment schedule authorised',
    'schedule',
    id,
    `${schedule.number} authorised by ${user.name}. No bank transfer was executed.`,
  )
  nextState = notify(nextState, financeIds(nextState), {
    title: 'Schedule authorised',
    body: `${schedule.number} can be confirmed once the bank payment is made outside this system.`,
    href: `#/payments/${payments[0]?.id || id}`,
  })
  return flash(nextState, 'good', `${schedule.number} authorised. Record the bank confirmation and receipt. It does not move the money.`)
}

function confirmPayment(state, { id, date, reference, amount, receiptName }) {
  const user = actor(state)
  if (!can(user, ['finance'])) return deny(state, 'Finance records payment confirmation.')
  const payment = state.payments.find((item) => item.id === id)
  if (!payment) return deny(state, 'Payment not found.')
  const invoice = state.invoices.find((item) => item.id === payment.invoiceId)
  const value = Number(amount)
  const referenceText = String(reference || '').trim()
  const receipt = String(receiptName || '').trim()
  if (!date || !referenceText || !receipt) return deny(state, 'Date, bank reference and the receipt file are required.')
  if (!(value > 0)) return deny(state, 'Enter the amount that was paid.')
  const room = Number(payment.approvedAmount) - disbursed(payment)
  if (room <= 0) return deny(state, 'This authorisation is already fully recorded.')
  if (value > room + 0.01) return deny(state, 'The amount is above the authorised balance.')
  if (value > invoiceOutstanding(invoice) + 0.01) return deny(state, 'The amount is above the invoice balance.')
  const entry = { id: uid('dis'), date, reference: referenceText, amount: value, receiptName: receipt, recordedBy: user.id, at: nowIso() }
  const paidOnPayment = disbursed(payment) + value
  const nextPayment = {
    ...payment,
    disbursements: [...payment.disbursements, entry],
    status: paidOnPayment + 0.01 >= Number(payment.approvedAmount) ? 'confirmed' : 'authorised',
  }
  const paidAmount = Number(invoice.paidAmount) + value
  const invoiceStatus = paidAmount + 0.01 >= Number(invoice.amount) ? 'paid' : 'partially_paid'
  const nextInvoice = {
    ...invoice,
    paidAmount,
    status: invoiceStatus,
    history: [
      ...invoice.history,
      {
        id: uid('h'),
        at: nowIso(),
        actorId: user.id,
        action: invoiceStatus === 'paid' ? 'Invoice fully paid' : 'Partial payment recorded',
        comment: `${referenceText} · ${receipt}`,
      },
    ],
  }
  const request = state.requests.find((item) => item.id === invoice.requestId)
  let nextState = {
    ...state,
    payments: mapById(state.payments, id, () => nextPayment),
    invoices: mapById(state.invoices, invoice.id, () => nextInvoice),
  }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, 'Payment confirmation recorded', `${payment.number} · ${referenceText}`)),
    }
  }
  const schedule = nextState.schedules.find((item) => item.id === payment.scheduleId)
  if (schedule) {
    const related = nextState.payments.filter((item) => item.scheduleId === schedule.id)
    if (related.length && related.every((item) => item.status === 'confirmed')) {
      nextState = { ...nextState, schedules: mapById(nextState.schedules, schedule.id, () => ({ ...schedule, status: 'completed' })) }
    }
  }
  return flash(
    audit(nextState, 'Payment recorded', 'payment', id, `${payment.number} ${referenceText}. Receipt ${receipt}. The bank transfer was recorded, not executed.`),
    'good',
    'Payment confirmation recorded. You can now notify the supplier.',
  )
}

function notifySupplier(state, paymentId) {
  const user = actor(state)
  if (!can(user, ['finance'])) return deny(state, 'Finance sends supplier payment notices.')
  const payment = state.payments.find((item) => item.id === paymentId)
  if (!payment) return deny(state, 'Payment not found.')
  if (!payment.disbursements.length) return deny(state, 'Record a payment confirmation before notifying the supplier.')
  const supplier = state.suppliers.find((item) => item.id === payment.supplierId)
  const attempt = payment.notifications.length + 1
  const email = supplier?.email || ''
  const sent = email.includes('@')
  const entry = {
    id: uid('pn'),
    at: nowIso(),
    to: email || 'No email on the supplier file',
    status: sent ? 'sent' : 'failed',
    attempt,
    detail: sent ? 'Payment confirmation sent with the receipt attached.' : 'No valid supplier email. Notice failed.',
  }
  const next = { ...payment, notifications: [...payment.notifications, entry] }
  const invoice = state.invoices.find((item) => item.id === payment.invoiceId)
  const request = state.requests.find((item) => item.id === invoice?.requestId)
  let nextState = { ...state, payments: mapById(state.payments, paymentId, () => next) }
  if (request) {
    nextState = {
      ...nextState,
      requests: mapById(nextState.requests, request.id, () => addHistory(request, user.id, sent ? 'Supplier notified of payment' : 'Supplier notification failed', entry.detail)),
    }
  }
  nextState = audit(
    nextState,
    sent ? 'Supplier notified' : 'Supplier notification failed',
    'payment',
    paymentId,
    `${payment.number} attempt ${attempt} to ${entry.to}. ${entry.detail}`,
  )
  return flash(nextState, sent ? 'good' : 'bad', sent ? `Notice sent to ${email}.` : 'Notice failed. Add a supplier email, then retry.')
}

function closeRequest(state, id) {
  const user = actor(state)
  if (!can(user, ['procurement', 'finance'])) return deny(state, 'Procurement or finance closes a request.')
  const request = state.requests.find((item) => item.id === id)
  if (!request || request.status !== 'po_issued') return deny(state, 'Only an issued order can be closed out.')
  const order = state.orders.find((item) => item.requestId === id && item.status !== 'cancelled')
  if (!order) return deny(state, 'There is no purchase order to reconcile.')
  const invoices = state.invoices.filter((item) => item.requestId === id && !['rejected', 'duplicate'].includes(item.status))
  if (!invoices.length) return deny(state, 'Record the supplier invoice and the payment before close-out.')
  if (invoices.some((item) => invoiceOutstanding(item) > 0 || ['held', 'submitted', 'mismatch', 'scheduled'].includes(item.status))) {
    return deny(state, 'Clear held, unmatched and unpaid invoices before close-out.')
  }
  if (state.verifications.some((item) => item.requestId === id && item.status === 'assigned')) return deny(state, 'Finish the open verification first.')
  const closeBlock = mobilizationCloseBlock(state, request)
  if (closeBlock) return deny(state, closeBlock)
  const spent = invoices.reduce((sum, item) => sum + Number(item.paidAmount), 0)
  const nextRequest = addHistory({ ...request, status: 'closed' }, user.id, 'Request closed out')
  let nextState = {
    ...state,
    requests: mapById(state.requests, id, () => nextRequest),
    orders: mapById(state.orders, order.id, () => ({ ...order, status: 'closed' })),
  }
  const project = state.projects.find((item) => item.id === request.projectId)
  if (project) {
    nextState = {
      ...nextState,
      projects: mapById(nextState.projects, project.id, () => ({
        ...project,
        updates: [{ id: uid('pu'), at: nowIso(), actorId: user.id, text: `${request.number} closed out.` }, ...project.updates],
      })),
    }
  }
  return flash(audit(nextState, 'Request closed', 'request', id, `${request.number} reconciled at paid value ${spent}.`), 'good', `${request.number} closed out.`)
}

function saveProject(state, payload) {
  const user = actor(state)
  if (user?.role !== 'admin') return deny(state, 'An administrator maintains projects.')
  const name = String(payload.name || '').trim()
  const code = String(payload.code || '').trim()
  if (name.length < 3 || !code || !(Number(payload.budget) > 0)) return deny(state, 'Name, code and budget are required.')
  const milestones = (payload.milestones || [])
    .filter((item) => String(item.name || '').trim())
    .map((item) => ({
      id: item.id || uid('m'),
      name: String(item.name).trim(),
      dueDate: item.dueDate || '',
      status: item.status || 'pending',
      verificationRequired: Boolean(item.verificationRequired),
    }))
  const fields = {
    name,
    code,
    department: payload.department || 'Projects',
    ownerId: payload.ownerId || user.id,
    budget: Number(payload.budget),
    site: payload.site || '',
    paymentHold: Boolean(payload.paymentHold),
    status: payload.status || 'active',
    description: payload.description || '',
    startDate: payload.startDate || '',
    endDate: payload.endDate || '',
    milestones,
  }
  if (payload.id) {
    const existing = state.projects.find((item) => item.id === payload.id)
    if (!existing) return deny(state, 'Project not found.')
    const next = { ...existing, ...fields }
    return flash(audit({ ...state, projects: mapById(state.projects, payload.id, () => next) }, 'Project updated', 'project', payload.id, name), 'good', 'Project updated.')
  }
  const created = { ...fields, id: uid('p'), updates: [], documents: [] }
  return flash(audit({ ...state, projects: [created, ...state.projects] }, 'Project added', 'project', created.id, name), 'good', 'Project added.')
}

function projectUpdate(state, { id, text }) {
  const user = actor(state)
  const project = state.projects.find((item) => item.id === id)
  if (!project) return deny(state, 'Project not found.')
  const allowed = can(user, ['verifier', 'procurement', 'management', 'finance']) || project.ownerId === user?.id
  if (!allowed) return deny(state, 'You cannot post on this project.')
  const note = String(text || '').trim()
  if (note.length < 3) return deny(state, 'Write the update.')
  const next = { ...project, updates: [{ id: uid('pu'), at: nowIso(), actorId: user.id, text: note }, ...project.updates] }
  return flash({ ...state, projects: mapById(state.projects, id, () => next) }, 'good', 'Update posted.')
}

function saveUser(state, payload) {
  const user = actor(state)
  if (!user) return deny(state, 'Sign in first.')
  if (!payload.id) {
    if (user.role !== 'admin') return deny(state, 'An administrator adds people.')
    const name = String(payload.name || '').trim()
    const email = String(payload.email || '').trim()
    if (name.length < 3 || !email.includes('@')) return deny(state, 'Name and a valid email are required.')
    const created = {
      id: uid('u'),
      name,
      email,
      role: payload.role || 'requester',
      title: payload.title || '',
      department: payload.department || 'Projects',
      active: true,
      delegateId: null,
      delegateActive: false,
    }
    return flash(audit({ ...state, users: [...state.users, created] }, 'Person added', 'user', created.id, name), 'good', `${name} can now sign in.`)
  }
  const existing = state.users.find((item) => item.id === payload.id)
  if (!existing) return deny(state, 'Person not found.')
  if (payload.delegateId === existing.id) return deny(state, 'Choose a colleague as the delegate.')
  if (user.role !== 'admin') {
    if (payload.id !== user.id) return deny(state, 'You can only set your own delegation.')
    const next = { ...existing, delegateId: payload.delegateId || null, delegateActive: Boolean(payload.delegateActive && payload.delegateId) }
    return flash(audit({ ...state, users: mapById(state.users, existing.id, () => next) }, 'Delegation updated', 'user', existing.id, existing.name), 'good', 'Delegation updated.')
  }
  const next = {
    ...existing,
    name: payload.name?.trim() || existing.name,
    email: payload.email?.trim() || existing.email,
    role: payload.role || existing.role,
    department: payload.department || existing.department,
    title: payload.title ?? existing.title,
    active: payload.active !== false,
    delegateId: payload.delegateId || null,
    delegateActive: Boolean(payload.delegateActive && payload.delegateId),
  }
  const remainingAdmins = state.users.filter((item) => item.id !== existing.id && item.role === 'admin' && item.active)
  if (existing.role === 'admin' && existing.active && (next.role !== 'admin' || !next.active) && !remainingAdmins.length) {
    return deny(state, 'Keep at least one active administrator.')
  }
  let nextState = { ...state, users: mapById(state.users, existing.id, () => next) }
  if (state.sessionUserId === existing.id && !next.active) nextState = { ...nextState, sessionUserId: null }
  return flash(audit(nextState, 'Person updated', 'user', existing.id, next.name), 'good', `${next.name} updated.`)
}

function savePolicy(state, policy) {
  const user = actor(state)
  if (user?.role !== 'admin') return deny(state, 'An administrator sets the approval thresholds.')
  const next = {
    singleLevelBelow: Number(policy.singleLevelBelow) || 0,
    bandStandard: Number(policy.bandStandard),
    bandElevated: Number(policy.bandElevated),
    quotationApproverId: policy.quotationApproverId,
    quotationManagementAbove: Number(policy.quotationManagementAbove),
    paymentManagementAbove: Number(policy.paymentManagementAbove),
    varianceTolerance: Number(policy.varianceTolerance) || 0,
  }
  if (!(next.bandStandard > next.singleLevelBelow) || !(next.bandElevated > next.bandStandard)) {
    return deny(state, 'Each threshold must sit above the one before it.')
  }
  if (!state.users.some((item) => item.id === next.quotationApproverId && item.active)) {
    return deny(state, 'Choose an active designated quotation approver.')
  }
  return flash(audit({ ...state, policy: next }, 'Approval policy updated', 'policy', 'policy', 'Thresholds saved.'), 'good', 'Approval policy saved. Requests submitted from now on use it.')
}

function restore(state, data) {
  const user = actor(state)
  if (user?.role !== 'admin') return deny(state, 'An administrator restores a backup.')
  if (!data || data.version !== 1 || !Array.isArray(data.users) || !Array.isArray(data.requests) || !data.policy) {
    return deny(state, 'That file is not a Hydroferric backup.')
  }
  return flash({ ...data, sessionUserId: user.id }, 'good', 'Backup restored.')
}

export function reducer(state, action) {
  switch (action.type) {
    case 'login':
      return login(state, action.userId)
    case 'logout':
      return { ...state, sessionUserId: null, flash: null }
    case 'clear-flash':
      return state.flash ? { ...state, flash: null } : state
    case 'read-notifications':
      return {
        ...state,
        notifications: state.notifications.map((item) => (item.userId === state.sessionUserId ? { ...item, read: true } : item)),
      }
    case 'read-notification':
      return {
        ...state,
        notifications: state.notifications.map((item) => (item.id === action.id ? { ...item, read: true } : item)),
      }
    case 'save-request':
      return saveRequest(state, action.request)
    case 'submit-request':
      return submitRequest(state, action.id)
    case 'decide-request':
      return decideRequest(state, action)
    case 'comment':
      return commentOnRequest(state, action)
    case 'add-quotation':
      return addQuotation(state, action.quotation)
    case 'recommend-quotation':
      return recommendQuotation(state, action)
    case 'decide-quotation':
      return decideQuotation(state, action)
    case 'revise-po':
      return revisePo(state, action)
    case 'decide-increase':
      return decideIncrease(state, action)
    case 'cancel-po':
      return cancelPo(state, action)
    case 'save-supplier':
      return saveSupplier(state, action.supplier)
    case 'save-invoice':
      return saveInvoice(state, action.invoice)
    case 'resolve-invoice':
      return resolveInvoice(state, action)
    case 'save-verification':
      return saveVerification(state, action)
    case 'create-schedule':
      return createSchedule(state, action)
    case 'update-schedule':
      return updateSchedule(state, action)
    case 'submit-schedule':
      return submitSchedule(state, action.id)
    case 'decide-schedule':
      return decideSchedule(state, action)
    case 'confirm-payment':
      return confirmPayment(state, action)
    case 'notify-supplier':
      return notifySupplier(state, action.id)
    case 'close-request':
      return closeRequest(state, action.id)
    case 'save-project':
      return saveProject(state, action.project)
    case 'project-update':
      return projectUpdate(state, action)
    case 'add-project-document':
      return addProjectDocument(state, action)
    case 'approve-document':
      return approveDocument(state, action)
    case 'reject-document':
      return rejectDocument(state, action)
    case 'delete-document':
      return deleteDocument(state, action)
    case 'set-mobilization-payment':
      return setMobilizationPayment(state, action)
    case 'add-mobilization-receipt':
      return addMobilizationReceipt(state, action)
    case 'add-document-comment':
      return addDocumentComment(state, action)
    case 'resolve-document-comment':
      return resolveDocumentComment(state, action)
    case 'hide-document-comment':
      return hideDocumentComment(state, action)
    case 'archive-document-comment':
      return archiveDocumentComment(state, action)
    case 'archive-comment-month':
      return archiveCommentMonth(state, action)
    case 'save-user':
      return saveUser(state, action.user)
    case 'save-policy':
      return savePolicy(state, action.policy)
    case 'restore':
      return restore(state, action.data)
    case 'reset-demo':
      return flash({ ...createSeed(), sessionUserId: state.sessionUserId }, 'good', 'Demonstration workspace restored.')
    default:
      return state
  }
}

function login(state, userId) {
  const user = state.users.find((item) => item.id === userId && item.active)
  if (!user) return deny(state, 'That officer cannot sign in.')
  return { ...state, sessionUserId: user.id, flash: { tone: 'good', text: `Signed in as ${user.name}.`, at: Date.now(), focus: null } }
}
