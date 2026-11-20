import { useState } from 'react'
import { INVOICE_STATUS } from '../domain/constants.js'
import { canFileDocuments } from '../domain/documents.js'
import { currentUser, effectiveInvoiceStatus, personName, projectById, supplierById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { invoiceOutstanding } from '../domain/workflow.js'
import { formatDate, formatWhen, money, todayISO } from '../lib/format.js'
import { downloadCsv, downloadExcel } from '../lib/export.js'
import { Empty, Field, Notice, PageHead, StatusBadge, Timeline } from '../components/ui.jsx'

export function Invoices() {
  const { state } = useStore()
  const user = currentUser(state)
  const [status, setStatus] = useState('')
  const own = new Set(state.requests.filter((request) => request.requesterId === user.id).map((request) => request.id))
  const rows = state.invoices
    .filter((invoice) => user.role !== 'requester' || own.has(invoice.requestId))
    .filter((invoice) => !status || invoice.status === status || effectiveInvoiceStatus(invoice) === status)

  function exportRows(kind) {
    const data = rows.map((invoice) => ({
      Reference: invoice.reference,
      Supplier: supplierById(state, invoice.supplierId)?.name || '',
      Due: invoice.dueDate,
      Amount: invoice.amount,
      Outstanding: invoiceOutstanding(invoice),
      Status: effectiveInvoiceStatus(invoice),
    }))
    if (kind === 'csv') downloadCsv('hydroferric-invoices.csv', data)
    else downloadExcel('hydroferric-invoices.xls', data)
  }

  return (
    <>
      <PageHead kicker="03 / Payments" title="Invoices" lead="Invoices are tied to a purchase order. Duplicates and amounts above the order are flagged before anyone can schedule a payment.">
        {['finance', 'procurement', 'admin'].includes(user.role) ? <a className="btn btn-primary" href="#/invoices/new">Record invoice</a> : null}
        <button className="btn btn-ghost btn-small" type="button" onClick={() => exportRows('csv')}>CSV</button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => exportRows('xls')}>Excel</button>
      </PageHead>
      <div className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Invoice status">
          <option value="">All statuses</option>
          <option value="overdue">Overdue</option>
          {Object.entries(INVOICE_STATUS).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
      </div>
      {rows.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr><th>Reference</th><th>Supplier</th><th>Project</th><th>Due</th><th>Status</th><th>Outstanding</th></tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const tone = effectiveInvoiceStatus(invoice)
                return (
                  <tr key={invoice.id}>
                    <td><a className="link" href={`#/invoices/${invoice.id}`}>{invoice.reference}</a></td>
                    <td>{supplierById(state, invoice.supplierId)?.name}</td>
                    <td>{projectById(state, invoice.projectId)?.code}</td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td>{tone === 'overdue' ? <StatusBadge map={{ overdue: { label: 'Overdue', tone: 'bad' } }} status="overdue" /> : <StatusBadge map={INVOICE_STATUS} status={invoice.status} />}</td>
                    <td className="num">{money(invoiceOutstanding(invoice))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No invoices in this view" />}
    </>
  )
}

export function InvoiceForm({ poId }) {
  const { state, saveInvoice } = useStore()
  const user = currentUser(state)
  const orders = state.orders.filter((order) => order.status === 'issued')
  const [form, setForm] = useState({
    poId: poId || orders[0]?.id || '',
    reference: '',
    invoiceDate: todayISO(),
    dueDate: '',
    amount: '',
    description: '',
    attachmentName: '',
  })
  const order = state.orders.find((item) => item.id === form.poId)
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  return (
    <>
      <PageHead kicker="03 / Payments" title="Record an invoice" lead="Use the supplier’s own invoice reference. A repeated reference is kept and flagged, not silently dropped." />
      <form className="card card-pad stack" onSubmit={(event) => { event.preventDefault(); saveInvoice({ ...form, amount: Number(form.amount) }) }}>
        <div className="form-grid">
          <Field label="Purchase order" className="span-2">
            <select value={form.poId} onChange={set('poId')}>
              {orders.map((item) => <option key={item.id} value={item.id}>{item.number} · {supplierById(state, item.supplierId)?.name} · {money(item.total)}</option>)}
            </select>
          </Field>
          <Field label="Supplier reference"><input value={form.reference} onChange={set('reference')} required /></Field>
          <Field label="Amount"><input type="number" min="1" value={form.amount} onChange={set('amount')} required /></Field>
          <Field label="Invoice date"><input type="date" value={form.invoiceDate} onChange={set('invoiceDate')} required /></Field>
          <Field label="Due date"><input type="date" value={form.dueDate} onChange={set('dueDate')} required /></Field>
          <Field label="Description" className="span-2"><textarea rows={2} value={form.description} onChange={set('description')} /></Field>
          {canFileDocuments(user) ? (
            <Field label="Supporting document" className="span-2">
              <input type="file" onChange={(event) => setForm({ ...form, attachmentName: event.target.files?.[0]?.name || '' })} />
            </Field>
          ) : <p className="hint span-2">The invoice file is added on the project by the HOD, accounts, the MD or the site admin.</p>}
        </div>
        {order ? <p className="hint">Order total {money(order.total)}. Supplier {supplierById(state, order.supplierId)?.name}.</p> : null}
        <button className="btn btn-primary" type="submit">Save invoice</button>
      </form>
    </>
  )
}

export function InvoiceDetail({ id }) {
  const { state, resolveInvoice } = useStore()
  const user = currentUser(state)
  const invoice = state.invoices.find((item) => item.id === id)
  const [comment, setComment] = useState('')
  if (!invoice) return <Empty title="Invoice not found" />
  const request = state.requests.find((item) => item.id === invoice.requestId)
  if (user.role === 'requester' && request?.requesterId !== user.id) return <Empty title="This invoice is not on your desk" />
  const order = state.orders.find((item) => item.id === invoice.poId)
  const duplicate = state.invoices.find((item) => item.id === invoice.duplicateOf)
  const tone = effectiveInvoiceStatus(invoice)
  const finance = ['finance', 'admin'].includes(user.role)
  return (
    <>
      <PageHead kicker="03 / Payments" title={invoice.reference} lead={invoice.description || invoice.matchNote}>
        {tone === 'overdue' ? <StatusBadge map={{ overdue: { label: 'Overdue', tone: 'bad' } }} status="overdue" /> : <StatusBadge map={INVOICE_STATUS} status={invoice.status} />}
      </PageHead>
      <article className="card card-pad">
        <dl className="meta">
          <div><dt>Supplier</dt><dd><a href={`#/suppliers/${invoice.supplierId}`}>{supplierById(state, invoice.supplierId)?.name}</a></dd></div>
          <div><dt>Purchase order</dt><dd><a href={`#/orders/${order?.id}`}>{order?.number}</a></dd></div>
          <div><dt>Project</dt><dd><a href={`#/projects/${invoice.projectId}`}>{projectById(state, invoice.projectId)?.name}</a></dd></div>
          <div><dt>Request</dt><dd><a href={`#/requests/${invoice.requestId}`}>{request?.number}</a></dd></div>
          <div><dt>Invoice date</dt><dd>{formatDate(invoice.invoiceDate)}</dd></div>
          <div><dt>Due</dt><dd>{formatDate(invoice.dueDate)}</dd></div>
          <div><dt>Amount</dt><dd>{money(invoice.amount)}</dd></div>
          <div><dt>Paid</dt><dd>{money(invoice.paidAmount)}</dd></div>
          <div><dt>Outstanding</dt><dd>{money(invoiceOutstanding(invoice))}</dd></div>
          <div><dt>Document</dt><dd>{invoice.attachmentName || '—'}</dd></div>
        </dl>
        <Notice tone={invoice.status === 'duplicate' || invoice.status === 'mismatch' ? 'warn' : 'teal'}>{invoice.matchNote}</Notice>
        {duplicate ? <p>Possible duplicate of <a href={`#/invoices/${duplicate.id}`}>{duplicate.reference}</a> recorded {formatDate(duplicate.createdAt)}.</p> : null}
      </article>
      {finance && ['submitted', 'mismatch', 'duplicate'].includes(invoice.status) ? (
        <form className="card card-pad stack" onSubmit={(event) => event.preventDefault()}>
          <h2>Match review</h2>
          <Field label="Comment"><textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
          <div className="btn-row">
            {invoice.status === 'submitted' ? <button className="btn btn-primary" type="button" onClick={() => resolveInvoice(invoice.id, 'accept', comment)}>Accept match</button> : null}
            {invoice.status === 'mismatch' ? <button className="btn btn-primary" type="button" onClick={() => resolveInvoice(invoice.id, 'accept-variance', comment)}>Accept variance</button> : null}
            {invoice.status === 'duplicate' ? <button className="btn btn-teal" type="button" onClick={() => resolveInvoice(invoice.id, 'release', comment)}>Release duplicate</button> : null}
            <button className="btn btn-danger" type="button" onClick={() => resolveInvoice(invoice.id, 'reject', comment)}>Reject</button>
          </div>
        </form>
      ) : null}
      {invoice.status === 'held' ? <Notice tone="warn">Payment is held until project verification is approved.</Notice> : null}
      <article className="card card-pad">
        <h2>History</h2>
        <Timeline items={[...invoice.history].reverse().map((item) => ({
          id: item.id,
          action: item.action,
          meta: `${personName(state, item.actorId)} · ${formatWhen(item.at)}`,
          comment: item.comment,
        }))} />
      </article>
    </>
  )
}
