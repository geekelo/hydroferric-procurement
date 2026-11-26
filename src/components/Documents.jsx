import { useState } from 'react'
import { REQUEST_STATUS, URGENCIES, statusMeta } from '../domain/constants.js'
import { canApproveDocuments, canCommentOnRequest, canFileOnProject, canMarkMobilizationPaid, canResolveRequestComments, categorySettled, commentsForRequest, documentsForRequest, DOCUMENT_STEPS, missingSteps, stepLock } from '../domain/documents.js'
import { currentUser, personName, requestFigures } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { requestTotal } from '../domain/workflow.js'
import { fileSize, formatWhen, money } from '../lib/format.js'
import { Icon } from './Icons.jsx'
import { Drawer, Field, StatusBadge } from './ui.jsx'

const STATUS_ICON = {
  closed: 'check',
  approved: 'check',
  po_issued: 'check',
  recommended: 'admin',
  in_approval: 'admin',
  rejected: 'close',
  cancelled: 'close',
  returned: 'close',
}

export function RequestList({ project, openRequestId = '' }) {
  const { state, addProjectDocument } = useStore()
  const [openId, setOpenId] = useState(openRequestId)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState(false)
  const allowed = canFileOnProject(currentUser(state), project)
  const requests = state.requests.filter((request) => request.projectId === project.id)
  const needle = query.trim().toLowerCase()
  const shown = requests
    .filter((request) => status === 'all' || request.status === status)
    .filter((request) => !needle || `${request.number} ${request.title}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const diff = new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      if (diff) return sort === 'newest' ? -diff : diff
      return sort === 'newest' ? b.number.localeCompare(a.number) : a.number.localeCompare(b.number)
    })
  const openRequest = requests.find((request) => request.id === openId)
  return (
    <section className="req-board">
      <div>
        <h2>Requests</h2>
        <p className="hint">
          {allowed
            ? 'Select a requisition to open its documents. Every upload needs a description, and each one must be approved before the next can be uploaded. The HOD, the assigned approver, accounts, the MD and the site admin can comment on an upload.'
            : 'Select a requisition to read the documents filed on it. Approve a document to unlock the next one. Comments sit beside each upload.'}
        </p>
      </div>
      <div className={`req-tools ${filters ? 'open' : ''}`}>
        <label className="req-search">
          <Icon name="search" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requisition (e.g. PR-2026-0001)" aria-label="Search requisitions" />
        </label>
        <button className="req-filter" type="button" aria-expanded={filters} aria-label="Filter requisitions" onClick={() => setFilters((value) => !value)}>
          <Icon name="filter" size={18} />
        </button>
        <select aria-label="All statuses" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(REQUEST_STATUS).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
        <select aria-label="Newest first" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      {shown.length ? (
        <div className="stack">
          {shown.map((request) => (
            <RequestRow key={request.id} request={request} onOpen={() => setOpenId(request.id)} />
          ))}
        </div>
      ) : <p className="hint">{requests.length ? 'No requisitions match this search.' : 'No requisitions on this project.'}</p>}
      {openRequest ? (
        <Drawer className="request-drawer" mobile="popup" title={`${openRequest.number} · ${openRequest.title}`} head={<RequestPopupHead request={openRequest} project={project} />} onClose={() => setOpenId('')}>
          <RequestDocuments
            state={state}
            request={openRequest}
            allowed={allowed}
            onOpenRequest={() => setOpenId('')}
            onFile={(category, file, description) => addProjectDocument({
              projectId: project.id,
              category,
              requestId: openRequest.id,
              name: file.name,
              size: file.size,
              description,
            })}
          />
        </Drawer>
      ) : null}
    </section>
  )
}

function RequestRow({ request, onOpen }) {
  const { state } = useStore()
  const comments = commentsForRequest(state, request.id)
  const unresolved = comments.filter((comment) => !comment.resolved && !comment.hidden).length
  const meta = statusMeta(REQUEST_STATUS, request.status)
  return (
    <button className={`request-row status-${request.status}`} type="button" onClick={onOpen}>
      <span className="req-ico"><Icon name="file" size={18} /></span>
      <span className="req-id">
        <strong>{request.number}</strong>
        <span>{request.title}</span>
      </span>
      <span className="req-meta">
        <span className="req-money"><Icon name="pay" size={15} />{money(requestTotal(request))}</span>
        <span className="req-comments">
          <Icon name="comment" size={15} />
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          {unresolved ? <b>{unresolved} new</b> : null}
        </span>
      </span>
      <span className={`badge tone-${meta.tone} req-status`}>
        {STATUS_ICON[request.status] ? <Icon name={STATUS_ICON[request.status]} size={13} /> : null}
        {meta.label}
      </span>
      <span className="req-go" aria-hidden="true"><Icon name="chevron" size={16} /></span>
    </button>
  )
}

function requestedAt(request) {
  return request.history?.find((entry) => /submitted/i.test(entry.action))?.at || request.createdAt
}

function RequestPopupHead({ request, project }) {
  return (
    <div className="popup-id">
      <span className="req-ico"><Icon name="file" size={18} /></span>
      <span className="popup-copy">
        <strong>{request.number} <span>|</span> {request.title}</strong>
        <span>Requisition for {project?.name} · Requested on {formatWhen(requestedAt(request))}</span>
      </span>
      <StatusBadge map={REQUEST_STATUS} status={request.status} />
    </div>
  )
}

function RequisitionFacts({ state, request, project }) {
  const urgency = URGENCIES.find((item) => item.id === request.urgency)
  const tone = request.urgency === 'critical' || request.urgency === 'high' ? 'bad' : 'info'
  return (
    <section className="req-facts">
      <div>
        <Fact icon="admin" label="Requester">{personName(state, request.requesterId)}</Fact>
        <Fact icon="building" label="Department">{request.department}</Fact>
        <Fact icon="flag" label="Urgency"><span className={`badge tone-${tone}`}>{urgency?.label || request.urgency}</span></Fact>
      </div>
      <div>
        <Fact icon="project" label="Project"><a href={`#/projects/${project?.id}`}>{project?.name}</a></Fact>
        <Fact icon="calendar" label="Date requested">{formatWhen(requestedAt(request))}</Fact>
        <Fact icon="invoice" label="Estimate (total)">{money(requestTotal(request))}</Fact>
      </div>
      <div className="req-items">
        <h3><Icon name="box" size={16} /> Items ({request.items?.length || 0})</h3>
        <table>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Estimate</th></tr>
          </thead>
          <tbody>
            {(request.items || []).map((item) => (
              <tr key={item.id}>
                <td data-label="Description">{item.description}</td>
                <td data-label="Qty">{item.qty} {item.unit}</td>
                <td data-label="Estimate">{money(item.qty * item.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Fact({ icon, label, children }) {
  return (
    <p className="fact">
      <Icon name={icon} size={16} />
      <small>{label}</small>
      <strong>{children}</strong>
    </p>
  )
}

function RequestDocuments({ state, request, allowed, onFile, onOpenRequest }) {
  const { approveDocument, rejectDocument, deleteDocument, setMobilizationPayment, addMobilizationReceipt } = useStore()
  const user = currentUser(state)
  const project = state.projects.find((item) => item.id === request.projectId)
  const files = documentsForRequest(state, request)
  const firstOpen = DOCUMENT_STEPS.find((step) => !categorySettled(files.filter((file) => file.category === step.id)))
  const [selected, setSelected] = useState(firstOpen?.id || DOCUMENT_STEPS[0].id)
  const canApprove = canApproveDocuments(user)
  const canMarkPaid = canMarkMobilizationPaid(user, project)
  const step = DOCUMENT_STEPS.find((item) => item.id === selected) || DOCUMENT_STEPS[0]
  const panel = (item) => (
    <CategoryPanel
      state={state}
      request={request}
      step={item}
      rows={files.filter((file) => file.category === item.id)}
      waiting={stepLock(state, request, item.id)}
      allowed={allowed}
      canApprove={canApprove}
      canMarkPaid={canMarkPaid}
      onFile={onFile}
      onApprove={(id) => approveDocument(project.id, id)}
      onReject={(id, reason) => rejectDocument(project.id, id, reason)}
      onDelete={(id) => deleteDocument(project.id, id)}
      onPayment={(id, paymentStatus) => setMobilizationPayment(project.id, id, paymentStatus)}
      onReceipt={(id, receipt, description) => addMobilizationReceipt({
        projectId: project.id,
        documentId: id,
        name: receipt.name,
        size: receipt.size,
        description,
      })}
    />
  )
  return (
    <div className="stack">
      <RequisitionFacts state={state} request={request} project={project} />
      <CostFigures figures={requestFigures(state, request)} colorful />
      <p className="hint desk-only"><a href={`#/requests/${request.id}`} onClick={onOpenRequest}>Open requisition</a></p>
      <div className="doc-mobile">
        <div className="req-chip">
          <span>
            <strong>{request.number}</strong>
            <span>{request.title}</span>
          </span>
          <StatusBadge map={REQUEST_STATUS} status={request.status} />
        </div>
        <RequestProgress status={request.status} />
        <p className="doc-note">Upload and get each document category approved in sequence. The next category opens only after the previous one is fully approved.</p>
      </div>
      <div className="doc-work">
        <aside className="stack">
          <div>
            <h3>Document workflow</h3>
            <p className="hint">Upload, review and get approvals in sequence. Comments stay with each upload.</p>
          </div>
          {DOCUMENT_STEPS.map((item, index) => {
            const locked = stepLock(state, request, item.id)
            const itemRows = files.filter((file) => file.category === item.id)
            const ready = categorySettled(itemRows)
            return (
              <button key={item.id} className={`doc-step ${item.id === step.id ? 'on' : ''} ${ready ? 'ready' : ''} ${locked ? 'locked' : ''}`} type="button" onClick={() => setSelected(item.id)}>
                <span className={`doc-step-index ${ready ? 'ready' : ''} ${locked ? 'locked' : ''}`}>{ready ? <Icon name="check" size={14} /> : locked ? <Icon name="lock" size={14} /> : index + 1}</span>
                <span>
                  <strong>{item.label}</strong>
                  <span className={`pill ${locked ? 'pill-locked' : ready ? 'pill-good' : itemRows.length ? 'pill-wait' : 'pill-open'}`}>{locked ? 'Locked' : ready ? 'Fully approved' : itemRows.length ? 'Awaiting approvals' : 'Ready for upload'}</span>
                </span>
              </button>
            )
          })}
        </aside>
        <section className="stack doc-panel">
          {panel(step)}
        </section>
      </div>
      <div className="doc-accordion">
        {DOCUMENT_STEPS.map((item, index) => {
          const locked = stepLock(state, request, item.id)
          const itemRows = files.filter((file) => file.category === item.id)
          const ready = categorySettled(itemRows)
          const open = item.id === selected
          return (
            <section key={item.id} className={`doc-acc ${open ? 'on' : ''} ${ready ? 'ready' : ''} ${locked ? 'locked' : ''}`}>
              <button className="doc-acc-head" type="button" aria-expanded={open} onClick={() => setSelected(item.id)}>
                <span className={`doc-step-index ${ready ? 'ready' : ''} ${locked ? 'locked' : ''}`}>{ready ? <Icon name="check" size={14} /> : locked ? <Icon name="lock" size={14} /> : index + 1}</span>
                <span>
                  <strong>{item.label}</strong>
                  <span>{categorySummary(itemRows, locked, ready)}</span>
                </span>
                {!locked && !ready && itemRows.length ? <span className="pill pill-wait">In approval</span> : null}
                <span className="doc-chevron"><Icon name="chevron" size={16} /></span>
              </button>
              {open ? <div className="doc-acc-body">{panel(item)}</div> : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function categorySummary(rows, locked, ready) {
  const count = `${rows.length} ${rows.length === 1 ? 'document' : 'documents'}`
  if (locked) return `Locked · Opens after ${locked} is fully approved`
  if (ready) return `${count} · Approved`
  if (rows.length) return `${count} · Awaiting approval`
  return 'Ready for upload'
}

function RequestProgress({ status }) {
  const current = status === 'closed' ? 4 : ['approved', 'sourcing', 'recommended', 'po_issued'].includes(status) ? 1 : 0
  const stages = ['Request', 'Documents', 'Final approval', 'Closed']
  return (
    <ol className="doc-progress">
      {stages.map((label, index) => (
        <li key={label} className={index < current ? 'done' : index === current ? 'current' : ''}>
          <span>{index < current ? <Icon name="check" size={12} /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  )
}

function CategoryPanel({ state, request, step, rows, waiting, allowed, canApprove, canMarkPaid, onFile, onApprove, onReject, onDelete, onPayment, onReceipt }) {
  const settled = categorySettled(rows)
  const commentCount = rows.reduce((sum, file) => sum + (file.comments || []).length, 0)
  return (
    <>
      <div className="card-head desk-only">
        <div>
          <h3>{step.label}</h3>
          <p className="hint">{waiting ? `Uploads unlock after ${waiting} is fully approved.` : `Required before ${step.before}.`}</p>
        </div>
        <span className={`pill ${settled ? 'pill-good' : waiting ? 'pill-locked' : 'pill-wait'}`}>{settled ? 'Fully approved' : waiting ? 'Locked' : 'Awaiting approvals'}</span>
      </div>
      {waiting ? <p className="doc-lock">LOCKED (Waiting for approval of {waiting})</p> : null}
      {rows.length ? rows.map((file) => (
        <DocumentRow
          key={file.id}
          state={state}
          file={file}
          canApprove={canApprove}
          canMarkPaid={canMarkPaid}
          canUpload={allowed}
          onApprove={() => onApprove(file.id)}
          onReject={(reason) => onReject(file.id, reason)}
          onDelete={() => onDelete(file.id)}
          onPayment={(paymentStatus) => onPayment(file.id, paymentStatus)}
          onReceipt={(receipt, description) => onReceipt(file.id, receipt, description)}
        />
      )) : <p className="hint">{waiting ? 'Nothing to show until the previous category is approved.' : 'Nothing filed yet.'}</p>}
      <div className="stack">
        <h3>Comments ({commentCount})</h3>
        <p className="hint">Comments can be read here. They cannot be deleted.</p>
        {rows.some((file) => file.stored) ? rows.filter((file) => file.stored).map((file) => (
          <article key={file.id} className="stack">
            <strong>{file.name}</strong>
            <CommentThread state={state} request={request} file={file} />
          </article>
        )) : <p className="hint">Comments appear beside each uploaded document.</p>}
      </div>
      {allowed && !waiting ? (
        <UploadBox
          label={`Upload ${step.label} for ${request.number}`}
          onUpload={({ file, description }) => onFile(step.id, file, description)}
        />
      ) : null}
    </>
  )
}

export function StepDocuments({ request, through }) {
  const { state } = useStore()
  if (!request) return null
  const end = DOCUMENT_STEPS.findIndex((step) => step.id === through)
  const steps = DOCUMENT_STEPS.slice(0, end + 1)
  const files = documentsForRequest(state, request)
  const missing = missingSteps(state, request, through)
  return (
    <div className="stack">
      {missing.length ? <p className="hint">{missing.map((step) => step.label).join(', ')} must be approved on this request before this can be approved.</p> : null}
      {steps.map((step) => {
        const waiting = stepLock(state, request, step.id)
        const rows = files.filter((file) => file.category === step.id)
        return (
          <div key={step.id}>
            <strong>{step.label}</strong>
            {waiting ? <p className="doc-lock">LOCKED (Waiting for approval of {waiting})</p> : null}
            <FileList state={state} files={rows} />
          </div>
        )
      })}
      <p className="hint"><a href={`#/projects/${request.projectId}?request=${request.id}`}>Open this request on the project</a></p>
    </div>
  )
}

const AVATAR_TONES = ['purple', 'teal', 'magenta', 'good', 'info']

function initials(name) {
  return String(name || '').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
}

const COST_MARKS = [
  ['approved', 'Approved cost', 'purple', 'check'],
  ['committed', 'Amount committed', 'teal', 'file'],
  ['toBalance', 'Amount to balance', 'magenta', 'audit'],
  ['extra', 'Extra payments', 'warn', 'pay'],
  ['total', 'Total cost', 'good', 'chart'],
]

export function CostFigures({ figures, colorful = false }) {
  return (
    <section className={`stat-grid stats-five ${colorful ? 'cost-color' : ''}`}>
      {COST_MARKS.map(([key, label, tone, icon]) => (
        <article className={`stat tone-${tone}`} key={key}>
          {colorful ? <span className="cost-mark" aria-hidden="true"><Icon name={icon} size={16} /></span> : null}
          <span>{label}</span>
          <b>{money(figures[key])}</b>
        </article>
      ))}
    </section>
  )
}

function DocumentRow({ state, file, canApprove, canMarkPaid, canUpload, onApprove, onReject, onDelete, onPayment, onReceipt }) {
  const mobilization = file.category === 'mobilization'
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const tone = file.status === 'approved' ? 'good' : file.status === 'rejected' ? 'bad' : 'wait'
  const kind = (file.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()
  return (
    <div className={`doc-file tone-${tone}`}>
      <div className="doc-main">
        <span className={`doc-chip tone-${tone}`} aria-hidden="true">{kind}</span>
        <span>
          <strong>{file.name}</strong>
          {file.description ? <span>{file.description}</span> : null}
          <span>
            {file.source}
            {file.uploadedBy ? ` · ${personName(state, file.uploadedBy)}` : ''}
            {file.uploadedAt ? ` · ${formatWhen(file.uploadedAt)}` : ''}
            {file.size ? ` · ${fileSize(file.size)}` : ''}
          </span>
        </span>
        <span className={`pill pill-${tone}`}>{file.status === 'approved' ? 'Approved' : file.status === 'rejected' ? 'Rejected' : 'Pending approval'}</span>
      </div>
      {file.rejectionNote ? <span>{file.rejectionNote}</span> : null}
      <div className="pay-row">
        {file.stored && file.status === 'pending' && canApprove ? (
          <button className="btn btn-primary btn-small" type="button" onClick={onApprove}>Approve</button>
        ) : null}
        {file.stored && file.status === 'pending' && canApprove ? (
          <button className="btn btn-ghost btn-small" type="button" onClick={() => setRejecting((open) => !open)}>Reject</button>
        ) : null}
        {file.stored && file.status === 'rejected' && canUpload ? (
          <button className="btn btn-ghost btn-small" type="button" onClick={onDelete}>Delete</button>
        ) : null}
      </div>
      {rejecting && file.stored && file.status === 'pending' && canApprove ? (
        <form
          className="upload-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (reason.trim().length < 3) return
            onReject(reason.trim())
            setReason('')
            setRejecting(false)
          }}
        >
          <Field label="Reason for rejection">
            <textarea required minLength={3} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this document is rejected" />
          </Field>
          <button className="btn btn-small btn-primary" type="submit">Reject document</button>
        </form>
      ) : null}
      {mobilization && file.status === 'approved' && !file.stored ? (
        <span>{file.paymentStatus === 'paid' ? 'Paid' : 'Pending'}{file.receiptName ? ` · Receipt · ${file.receiptName}` : ''}</span>
      ) : null}
      {mobilization && file.status === 'approved' && file.stored ? (
        <div className="pay-row">
          <button className={`btn btn-small ${file.paymentStatus === 'pending' ? 'btn-primary' : 'btn-ghost'}`} type="button" disabled={!canMarkPaid} onClick={() => onPayment('pending')}>Pending</button>
          <button className={`btn btn-small ${file.paymentStatus === 'paid' ? 'btn-primary' : 'btn-ghost'}`} type="button" disabled={!canMarkPaid} onClick={() => onPayment('paid')}>Paid</button>
          {file.paymentStatus === 'paid' ? (
            file.receiptName ? (
              <span>Receipt · {file.receiptName}{file.receiptDescription ? ` · ${file.receiptDescription}` : ''}</span>
            ) : (
              <span>{canUpload ? 'Upload the receipt' : 'Waiting for the receipt'}</span>
            )
          ) : null}
        </div>
      ) : null}
      {mobilization && file.stored && file.status === 'approved' && file.paymentStatus === 'paid' && canUpload ? (
        <UploadBox label={`Upload receipt for ${file.name}`} button="Upload receipt" onUpload={({ file: receipt, description }) => onReceipt(receipt, description)} />
      ) : null}
    </div>
  )
}

function UploadBox({ label, button = 'Upload', onUpload }) {
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  return (
    <form
      className="upload-form upload-zone"
      onSubmit={(event) => {
        event.preventDefault()
        if (!file || !description.trim()) return
        onUpload({ file, description: description.trim() })
        setDescription('')
        setFile(null)
        event.currentTarget.reset()
      }}
    >
      <Field label="Description">
        <textarea required rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this document is about" />
      </Field>
      <input required type="file" aria-label={label} onChange={(event) => setFile(event.target.files?.[0] || null)} />
      <button className="btn btn-small btn-primary" type="submit">{button}</button>
    </form>
  )
}

function CommentThread({ state, request, file }) {
  const { addDocumentComment } = useStore()
  const user = currentUser(state)
  const comments = file.comments || []
  const canComment = canCommentOnRequest(user, state, request)
  if (!comments.length && !canComment) return null
  return (
    <div className="comment-list">
      {comments.map((comment) => (
        <CommentEntry key={comment.id} state={state} request={request} projectId={file.projectId} documentId={file.id} comment={comment} />
      ))}
      {canComment ? (
        <CommentComposer onSubmit={(text) => addDocumentComment(file.projectId, file.id, text)} />
      ) : null}
    </div>
  )
}

export function CommentEntry({ state, request, projectId, documentId, comment }) {
  const { resolveDocumentComment, hideDocumentComment } = useStore()
  const user = currentUser(state)
  const canResolve = canResolveRequestComments(user, request)
  const name = personName(state, comment.authorId)
  const tone = AVATAR_TONES[name.length % AVATAR_TONES.length]
  return (
    <article className={`comment ${comment.resolved ? 'resolved' : ''}`}>
      <span className={`avatar tone-${tone}`} aria-hidden="true">{initials(name)}</span>
      <div className="cm-body">
        <div className="cm-meta">
          <strong>{name}</strong>
          <time>{formatWhen(comment.at)}</time>
        </div>
        <p>{comment.text}</p>
      </div>
      {comment.resolved ? (
        <span className="cm-state done">
          <Icon name="check" size={14} />
          <span>Resolved{comment.resolvedBy ? ` by ${personName(state, comment.resolvedBy)}` : ''}{comment.resolutionNote ? ` · ${comment.resolutionNote}` : ''}{comment.hidden ? ' · Hidden from the comments list' : ''}</span>
        </span>
      ) : canResolve ? (
        <ResolveForm onResolve={(note) => resolveDocumentComment(projectId, documentId, comment.id, note)} />
      ) : (
        <span className="cm-state open">Waiting for the HOD</span>
      )}
      {comment.resolved && !comment.hidden && canResolve ? (
        <button className="btn btn-ghost btn-small" type="button" onClick={() => hideDocumentComment(projectId, documentId, comment.id)}>Hide</button>
      ) : null}
    </article>
  )
}

function ResolveForm({ onResolve }) {
  const [note, setNote] = useState('')
  return (
    <form
      className="upload-form"
      onSubmit={(event) => {
        event.preventDefault()
        onResolve(note.trim())
        setNote('')
      }}
    >
      <Field label="Resolution note" hint="Optional">
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="How this was resolved" />
      </Field>
      <button className="btn btn-small btn-primary" type="submit">Resolve</button>
    </form>
  )
}

function CommentComposer({ onSubmit }) {
  const [text, setText] = useState('')
  return (
    <form
      className="cm-composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        onSubmit(text.trim())
        setText('')
      }}
    >
      <textarea required rows={2} aria-label="Comment" value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a comment on this upload..." />
      <button className="btn btn-small btn-primary" type="submit">Add comment</button>
    </form>
  )
}

export function RequestComments({ request }) {
  const { state } = useStore()
  const files = documentsForRequest(state, request).filter((file) => file.stored)
  const comments = commentsForRequest(state, request.id)
  const unresolved = comments.filter((comment) => !comment.resolved && !comment.hidden).length
  return (
    <section className="card rq-card cm-card">
      <div className="cm-head">
        <h2 className="rq-h2"><Icon name="comment" size={20} /> Comments</h2>
        <span className="cm-count">
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          {unresolved ? <b>{unresolved} new</b> : null}
        </span>
      </div>
      {files.length ? files.map((file) => (
        <article key={file.id} className="cm-thread">
          <header className="cm-file">
            <span className="cm-file-ico"><Icon name="file" size={16} /></span>
            <div>
              <strong>{file.name}</strong>
              {file.description ? <span>{file.description}</span> : null}
            </div>
          </header>
          <CommentThread state={state} request={request} file={file} />
        </article>
      )) : (
        <div className="cm-empty">
          <span className="cm-empty-ico"><Icon name="comment" size={22} /></span>
          <strong>No comments yet</strong>
          <span>Comments appear beside each uploaded document.</span>
        </div>
      )}
    </section>
  )
}

function FileList({ state, files }) {
  if (!files.length) return <p className="hint">Nothing filed yet.</p>
  return (
    <ul className="doc-list">
      {files.map((file) => (
        <li key={file.id}>
          <strong>{file.name}</strong>
          {file.description ? <span>{file.description}</span> : null}
          <span>
            {file.status === 'approved' ? 'Approved' : file.status === 'rejected' ? 'Rejected' : 'Waiting for approval'}
            {file.uploadedBy ? ` · ${personName(state, file.uploadedBy)}` : ''}
            {file.uploadedAt ? ` · ${formatWhen(file.uploadedAt)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
