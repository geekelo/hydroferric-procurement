import { useState } from 'react'
import { QUOTE_STATUS, REQUEST_STATUS, roleLabel } from '../domain/constants.js'
import {
  currentUser,
  invoicesForRequest,
  ordersForRequest,
  personName,
  projectById,
  quotesFor,
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
import { StepDocuments } from '../components/Documents.jsx'
import { approvalBlock, canFileDocuments } from '../domain/documents.js'
import { Chain, DecisionForm, Empty, Field, Notice, PageHead, StatusBadge, Timeline } from '../components/ui.jsx'

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

  return (
    <>
      <PageHead kicker="02 / Procurement" title={request.title} lead={request.justification}>
        <StatusBadge map={REQUEST_STATUS} status={request.status} />
        {['draft', 'returned'].includes(request.status) && (user.id === request.requesterId || user.role === 'admin') ? (
          <a className="btn btn-primary" href={`#/requests/${request.id}/edit`}>Edit</a>
        ) : null}
      </PageHead>
      <Chain links={[
        { href: `#/requests/${request.id}`, label: request.number },
        quotes.find((quote) => quote.status === 'approved' || quote.recommended) ? { href: `#/quotations`, label: quotes.find((quote) => quote.status === 'approved' || quote.status === 'recommended')?.number } : null,
        order ? { href: `#/orders/${order.id}`, label: order.number } : null,
        invoices[0] ? { href: `#/invoices/${invoices[0].id}`, label: invoices[0].reference } : null,
      ]} />
      <div className="steps">
        <Step label="Submit" done={!['draft'].includes(request.status)} />
        <Step label="Initial approval" done={!['draft', 'returned', 'in_approval', 'rejected'].includes(request.status)} />
        <Step label="Quotation approved" done={['po_issued', 'closed'].includes(request.status)} />
        <Step label="Order issued" done={Boolean(order) && order?.status !== 'cancelled'} />
        <Step label="Verified and paid" done={request.status === 'closed' || invoices.some((invoice) => invoice.status === 'paid')} />
        <Step label="Closed" done={request.status === 'closed'} />
      </div>
      <section className="split">
        <div className="stack">
          <article className="card card-pad">
            <dl className="meta">
              <div><dt>Number</dt><dd>{request.number}</dd></div>
              <div><dt>Requester</dt><dd>{personName(state, request.requesterId)}</dd></div>
              <div><dt>Department</dt><dd>{request.department}</dd></div>
              <div><dt>Project</dt><dd><a href={`#/projects/${project?.id}`}>{project?.name}</a></dd></div>
              <div><dt>Urgency</dt><dd>{request.urgency}</dd></div>
              <div><dt>Estimate</dt><dd>{money(requestTotal(request))}</dd></div>
            </dl>
            <table className="table">
              <thead><tr><th>Description</th><th>Qty</th><th>Estimate</th></tr></thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.qty} {item.unit}</td>
                    <td className="num">{money(item.qty * item.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {request.attachments?.length ? (
              <div className="chips">
                {request.attachments.map((file) => <span key={file.id} className="chip">{file.name} · {fileSize(file.size)}</span>)}
              </div>
            ) : null}
          </article>
          {level ? <RequestDecision request={request} level={level} user={user} state={state} store={store} /> : null}
          {request.status === 'returned' ? <Notice tone="warn">Returned. Edit the request and resubmit so the approval chain can start again.</Notice> : null}
          {request.status === 'approved' && canSource ? <Notice>Approved. Collect at least two supplier quotations, then recommend one.</Notice> : null}
          <QuoteBoard request={request} quotes={quotes} canSource={canSource} user={user} state={state} store={store} quoteLevel={quoteLevel} />
          {canClose ? (
            <article className="card card-pad">
              <h2>Close-out</h2>
              <p className="hint">Close the request once the invoice is paid and any required verification is approved.</p>
              <button className="btn btn-primary" type="button" onClick={() => store.closeRequest(request.id)}>Close request</button>
            </article>
          ) : null}
        </div>
        <div className="stack">
          <article className="card card-pad">
            <h2>Approval trail</h2>
            <LevelList state={state} levels={request.approval?.levels} />
            {request.quoteApproval ? (
              <>
                <h3>Quotation approval</h3>
                <LevelList state={state} levels={request.quoteApproval.levels} />
              </>
            ) : null}
          </article>
          <article className="card card-pad">
            <h2>History</h2>
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
    </>
  )
}

function Step({ label, done }) {
  return <div className={`step ${done ? 'done' : ''}`}><span />{label}</div>
}

function LevelList({ state, levels }) {
  if (!levels?.length) return <p className="hint">Not in approval.</p>
  return (
    <ol className="levels">
      {levels.map((level, index) => (
        <li key={`${level.role}-${index}`}>
          <StatusBadge map={{
            pending: { label: 'Waiting', tone: 'info' },
            waiting: { label: 'Queued', tone: 'neutral' },
            approved: { label: 'Approved', tone: 'good' },
            rejected: { label: 'Rejected', tone: 'bad' },
            returned: { label: 'Returned', tone: 'warn' },
          }} status={level.status} />
          <div>
            <strong>{roleLabel(level.role)}{level.designatedUserId ? ` · ${personName(state, level.designatedUserId)}` : ''}</strong>
            <span>{level.actorId ? `${personName(state, level.actorId)} · ${formatWhen(level.at)}` : 'No decision yet'}</span>
            {level.comment ? <p>{level.comment}</p> : null}
          </div>
        </li>
      ))}
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
            ) : <p className="hint span-2">The quotation file is added on the project by the HOD, accounts, the MD or the site admin.</p>}
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
      <Field label="Add a comment">
        <textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <button className="btn btn-ghost btn-small" type="submit">Add to history</button>
    </form>
  )
}
