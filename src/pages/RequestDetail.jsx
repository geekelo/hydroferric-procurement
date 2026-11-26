import { useState } from 'react'
import { QUOTE_STATUS, REQUEST_STATUS, URGENCIES, roleLabel, statusMeta } from '../domain/constants.js'
import {
  currentUser,
  invoicesForRequest,
  ordersForRequest,
  personName,
  projectById,
  quotesFor,
  requestFigures,
  supplierById,
} from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import {
  actingFor,
  alreadyActed,
  pendingLevel,
  requestTotal,
  userMayDecide,
} from '../domain/workflow.js'
import { fileSize, formatWhen, money } from '../lib/format.js'
import { CostFigures, RequestComments, StepDocuments } from '../components/Documents.jsx'
import { approvalBlock, canFileDocuments } from '../domain/documents.js'
import { Icon } from '../components/Icons.jsx'
import { Chain, DecisionForm, Empty, Field, Notice, StatusBadge, Timeline } from '../components/ui.jsx'

export function RequestDetail({ id }) {
  const store = useStore()
  const { state } = store
  const user = currentUser(state)
  const request = state.requests.find((item) => item.id === id)
  if (!request) return <Empty title="Request not found" />
  if (user.role === 'requester' && request.requesterId !== user.id && request.department !== user.department) {
    return <Empty title="This request is not on your desk" />
  }

  const project = projectById(state, request.projectId)
  const quotes = quotesFor(state, request.id)
  const order = ordersForRequest(state, request.id).find((item) => item.status !== 'cancelled') || ordersForRequest(state, request.id)[0]
  const invoices = invoicesForRequest(state, request.id)
  const level = request.status === 'in_approval' ? pendingLevel(request.approval?.levels) : null
  const quoteLevel = request.status === 'recommended' ? pendingLevel(request.quoteApproval?.levels) : null
  const canSource = ['procurement', 'admin'].includes(user.role) && ['approved', 'sourcing'].includes(request.status)
  const canClose = ['procurement', 'finance', 'admin'].includes(user.role) && request.status === 'po_issued'

  const steps = [
    { label: 'Submit', done: request.status !== 'draft' },
    { label: 'Initial approval', done: !['draft', 'returned', 'in_approval', 'rejected'].includes(request.status) },
    { label: 'Quotation approved', done: ['po_issued', 'closed'].includes(request.status) },
    { label: 'Order issued', done: Boolean(order) && order?.status !== 'cancelled' },
    { label: 'Verified and paid', done: request.status === 'closed' || invoices.some((invoice) => invoice.status === 'paid') },
    { label: 'Closed', done: request.status === 'closed' },
  ]
  const urgency = URGENCIES.find((item) => item.id === request.urgency)
  const urgencyTone = request.urgency === 'critical' || request.urgency === 'high' ? 'bad' : 'info'
  const related = [
    quotes.find((quote) => quote.status === 'approved' || quote.status === 'recommended') ? { href: '#/quotations', label: quotes.find((quote) => quote.status === 'approved' || quote.status === 'recommended')?.number } : null,
    order ? { href: `#/orders/${order.id}`, label: order.number } : null,
    invoices[0] ? { href: `#/invoices/${invoices[0].id}`, label: invoices[0].reference } : null,
  ].filter(Boolean)

  return (
    <div className="rq-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={`#/projects/${project?.id}`}>{project?.name || 'Project'}</a>
        <span aria-hidden="true">›</span>
        <strong>{request.number}</strong>
      </nav>
      <header className="rq-head">
        <div>
          <h1>{request.title}</h1>
          <p className="lead">{request.justification}</p>
        </div>
        <div className="head-actions">
          <span className={`rq-status tone-${statusMeta(REQUEST_STATUS, request.status).tone}`}>
            {['approved', 'closed', 'po_issued'].includes(request.status) ? <Icon name="check" size={16} /> : null}
            {statusMeta(REQUEST_STATUS, request.status).label}
          </span>
          {['draft', 'returned'].includes(request.status) && (user.id === request.requesterId || user.role === 'admin') ? (
            <a className="btn btn-primary" href={`#/requests/${request.id}/edit`}>Edit</a>
          ) : null}
        </div>
      </header>
      <CostFigures figures={requestFigures(state, request)} colorful />
      <section className="rq-grid">
        <div className="stack">
          <article className="card rq-card">
            <h2 className="rq-h2"><Icon name="file" size={20} /> Requisition details</h2>
            <Progress steps={steps} />
            <div className="rq-facts">
              <div>
                <RqFact icon="po" label="Number">{request.number}</RqFact>
                <RqFact icon="layers" label="Department">{request.department}</RqFact>
                <RqFact icon="flag" label="Urgency"><span className={`badge tone-${urgencyTone}`}>{urgency?.label || request.urgency}</span></RqFact>
              </div>
              <div>
                <RqFact icon="admin" label="Requester">{personName(state, request.requesterId)}</RqFact>
                <RqFact icon="project" label="Project"><a href={`#/projects/${project?.id}`}>{project?.name}</a></RqFact>
                <RqFact icon="invoice" label="Estimate">{money(requestTotal(request))}</RqFact>
              </div>
            </div>
            <div className="rq-items">
              <table className="table">
                <thead><tr><th>Description</th><th>Qty</th><th className="num">Estimate</th></tr></thead>
                <tbody>
                  {request.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Description">{item.description}</td>
                      <td data-label="Qty">{item.qty} {item.unit}</td>
                      <td className="num" data-label="Estimate"><strong>{money(item.qty * item.unitCost)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {request.attachments?.length ? (
              <div className="chips">
                {request.attachments.map((file) => <span key={file.id} className="chip rq-file"><Icon name="clip" size={16} />{file.name} · {fileSize(file.size)}</span>)}
              </div>
            ) : null}
            {related.length ? (
              <div className="rq-related">
                <small>Related records</small>
                <Chain links={related} />
              </div>
            ) : null}
          </article>
          {level ? <RequestDecision request={request} level={level} user={user} state={state} store={store} /> : null}
          {request.status === 'returned' ? <Notice tone="warn">Returned. Edit the request and resubmit so the approval chain can start again.</Notice> : null}
          {request.status === 'approved' && canSource ? <Notice>Approved. Collect at least two supplier quotations, then recommend one.</Notice> : null}
          <QuoteBoard request={request} quotes={quotes} canSource={canSource} user={user} state={state} store={store} quoteLevel={quoteLevel} />
          {canClose ? (
            <article className="card rq-card">
              <h2 className="rq-h2">Close-out</h2>
              <p className="hint">Close the request once the invoice is paid and any required verification is approved.</p>
              <button className="btn btn-primary" type="button" onClick={() => store.closeRequest(request.id)}>Close request</button>
            </article>
          ) : null}
          <RequestComments request={request} />
        </div>
        <div className="stack">
          <article className="card rq-card">
            <h2 className="rq-h2"><Icon name="admin" size={20} /> Approval trail</h2>
            <LevelList state={state} levels={request.approval?.levels} />
            {request.quoteApproval ? (
              <>
                <h3>Quotation approval</h3>
                <LevelList state={state} levels={request.quoteApproval.levels} />
              </>
            ) : null}
          </article>
          <article className="card rq-card rq-history">
            <h2 className="rq-h2"><Icon name="audit" size={20} /> History</h2>
            <Timeline items={[...request.history].reverse().map((item) => ({
              id: item.id,
              action: item.action,
              meta: `${personName(state, item.actorId)} · ${formatWhen(item.at)}`,
              comment: item.comment,
            }))} />
            <CommentBox requestId={request.id} />
          </article>
        </div>
      </section>
    </div>
  )
}

function Progress({ steps }) {
  const current = steps.findIndex((step) => !step.done)
  return (
    <div className="rq-steps-wrap">
      <ol className="rq-steps">
        {steps.map((step, index) => (
          <li key={step.label} className={step.done ? 'done' : index === current ? 'current' : ''}>
            <span>{step.done ? <Icon name="check" size={13} /> : null}</span>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

function RqFact({ icon, label, children }) {
  return (
    <div className="rq-fact">
      <span className="rq-fact-ico"><Icon name={icon} size={18} /></span>
      <span>
        <small>{label}</small>
        <strong>{children}</strong>
      </span>
    </div>
  )
}

const LEVEL_STATUS = {
  pending: { label: 'Waiting', tone: 'info' },
  waiting: { label: 'Queued', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
  returned: { label: 'Returned', tone: 'warn' },
}

function LevelList({ state, levels }) {
  if (!levels?.length) return <p className="hint">Not in approval.</p>
  return (
    <ol className="trail">
      {levels.map((level, index) => {
        const who = level.actorId || level.designatedUserId
        return (
          <li key={`${level.role}-${index}`}>
            <i className={`trail-dot ${level.status}`} aria-hidden="true" />
            <span className="trail-status">
              <StatusBadge map={LEVEL_STATUS} status={level.status} />
            </span>
            <div>
              <strong>{roleLabel(level.role)}{who ? ` — ${personName(state, who)}` : ''}</strong>
              <span>{level.actorId ? '' : 'No decision yet'}</span>
              {level.comment ? <p>{level.comment}</p> : null}
            </div>
            <time>{level.at ? formatWhen(level.at) : ''}</time>
          </li>
        )
      })}
    </ol>
  )
}

function RequestDecision({ request, level, user, state, store }) {
  const [comment, setComment] = useState('')
  const allowed = userMayDecide(state, user, level) && !alreadyActed(request.approval.levels, user)
  if (!allowed) {
    return <Notice>Waiting for the {roleLabel(level.role)}. You will be notified if it reaches your desk.</Notice>
  }
  const acting = actingFor(state, user, level)
  const block = approvalBlock(state, request, 'request')
  return (
    <article className="card card-pad stack">
      <h2>Your decision</h2>
      <StepDocuments request={request} through="request" />
      <DecisionForm
        comment={comment}
        setComment={setComment}
        note={block || (acting.length ? `You are acting for ${acting.map((person) => person.name).join(', ')}.` : `This is the ${roleLabel(level.role)} level.`)}
        approveDisabled={Boolean(block)}
        approveLabel="Approve level"
        onApprove={() => store.decideRequest(request.id, 'approve', comment)}
        onReturn={() => store.decideRequest(request.id, 'return', comment)}
        onReject={() => store.decideRequest(request.id, 'reject', comment)}
      />
    </article>
  )
}

function QuoteBoard({ request, quotes, canSource, user, state, store, quoteLevel }) {
  const [form, setForm] = useState({ supplierId: state.suppliers[0]?.id || '', reference: '', amount: '', deliveryTerms: '', leadDays: '', validity: '', warranty: '', notes: '', attachmentName: '', priceNote: '', deliveryNote: '', qualityNote: '', complianceNote: '' })
  const [chosen, setChosen] = useState(quotes.find((quote) => quote.status === 'received')?.id || '')
  const [justification, setJustification] = useState('')
  const [comment, setComment] = useState('')
  if (!quotes.length && !canSource) return null
  const canDecide = quoteLevel && userMayDecide(state, user, quoteLevel) && !alreadyActed(request.quoteApproval.levels, user)
  return (
    <article className="card card-pad stack">
      <div className="card-head"><h2>Quotations</h2></div>
      {quotes.length ? (
        <div className="compare">
          {quotes.map((quote) => {
            const supplier = supplierById(state, quote.supplierId)
            return (
              <label key={quote.id} className={`quote-card ${quote.status === 'recommended' || quote.status === 'approved' ? 'pick' : ''}`}>
                {canSource && quote.status === 'received' ? (
                  <input type="radio" name="recommend" checked={chosen === quote.id} onChange={() => setChosen(quote.id)} />
                ) : null}
                <StatusBadge map={QUOTE_STATUS} status={quote.status} />
                <strong>{supplier?.name}</strong>
                <b>{money(quote.amount)}</b>
                <span>{quote.reference} · {quote.leadDays} days · {quote.deliveryTerms}</span>
                <span>Warranty {quote.warranty || '—'} · valid {quote.validity || '—'}</span>
                <span>{[quote.priceNote, quote.deliveryNote, quote.qualityNote, quote.complianceNote].filter(Boolean).join(' · ')}</span>
                {quote.justification ? <p>{quote.justification}</p> : null}
                {quote.attachmentName ? <em className="chip">{quote.attachmentName}</em> : null}
              </label>
            )
          })}
        </div>
      ) : <p className="hint">No quotations yet.</p>}
      {canSource ? (
        <form className="stack" onSubmit={(event) => {
          event.preventDefault()
          store.addQuotation({ ...form, requestId: request.id, amount: Number(form.amount), leadDays: Number(form.leadDays) })
        }}>
          <h3>Record a quotation</h3>
          <div className="form-grid">
            <Field label="Supplier">
              <select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
                {state.suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </Field>
            <Field label="Supplier reference"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} required /></Field>
            <Field label="Amount (NGN)"><input type="number" min="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field>
            <Field label="Lead time (days)"><input type="number" min="0" value={form.leadDays} onChange={(event) => setForm({ ...form, leadDays: event.target.value })} /></Field>
            <Field label="Delivery terms" className="span-2"><input value={form.deliveryTerms} onChange={(event) => setForm({ ...form, deliveryTerms: event.target.value })} required /></Field>
            <Field label="Valid until"><input type="date" value={form.validity} onChange={(event) => setForm({ ...form, validity: event.target.value })} /></Field>
            <Field label="Warranty"><input value={form.warranty} onChange={(event) => setForm({ ...form, warranty: event.target.value })} /></Field>
            <Field label="Price note"><input value={form.priceNote} onChange={(event) => setForm({ ...form, priceNote: event.target.value })} /></Field>
            <Field label="Delivery note"><input value={form.deliveryNote} onChange={(event) => setForm({ ...form, deliveryNote: event.target.value })} /></Field>
            <Field label="Quality note"><input value={form.qualityNote} onChange={(event) => setForm({ ...form, qualityNote: event.target.value })} /></Field>
            <Field label="Compliance note"><input value={form.complianceNote} onChange={(event) => setForm({ ...form, complianceNote: event.target.value })} /></Field>
            {canFileDocuments(user) ? (
              <Field label="Quotation file" className="span-2">
                <input type="file" onChange={(event) => setForm({ ...form, attachmentName: event.target.files?.[0]?.name || '' })} />
              </Field>
            ) : <p className="hint span-2">The quotation file is added on the request by the HOD, accounts, the MD or the site admin.</p>}
          </div>
          <button className="btn btn-teal" type="submit">Add quotation</button>
        </form>
      ) : null}
      {canSource && request.status === 'sourcing' ? (
        <div className="stack">
          <Field label="Why this quotation">
            <textarea rows={3} value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Price, delivery, quality and compliance." />
          </Field>
          <button className="btn btn-primary" type="button" onClick={() => store.recommendQuotation(request.id, chosen, justification)}>Send recommendation</button>
        </div>
      ) : null}
      {canDecide ? (
        <>
          <StepDocuments request={request} through="quotation" />
          <DecisionForm
            comment={comment}
            setComment={setComment}
            note={approvalBlock(state, request, 'quotation') || (actingFor(state, user, quoteLevel).length ? `You are acting for ${actingFor(state, user, quoteLevel).map((person) => person.name).join(', ')}.` : 'Designated quotation approval. Approving issues the purchase order.')}
            approveDisabled={Boolean(approvalBlock(state, request, 'quotation'))}
            approveLabel="Approve and issue order"
            onApprove={() => store.decideQuotation(request.id, 'approve', comment)}
            onReject={() => store.decideQuotation(request.id, 'reject', comment)}
          />
        </>
      ) : null}
      {quoteLevel && !canDecide ? <Notice>The recommendation is with {quoteLevel.designatedUserId ? personName(state, quoteLevel.designatedUserId) : roleLabel(quoteLevel.role)}.</Notice> : null}
    </article>
  )
}

function CommentBox({ requestId }) {
  const { comment } = useStore()
  const [text, setText] = useState('')
  return (
    <form className="stack" onSubmit={(event) => { event.preventDefault(); comment(requestId, text); setText('') }}>
      <textarea rows={2} aria-label="Add a comment" placeholder="Add a comment..." value={text} onChange={(event) => setText(event.target.value)} />
      <button className="btn btn-primary rq-add" type="submit">Add to history</button>
    </form>
  )
}
