import { useState } from 'react'
import { PO_CONTROL, PO_STATUS } from '../domain/constants.js'
import { currentUser, personName, projectById, requestById, supplierById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { lineAmount } from '../domain/workflow.js'
import { formatDate, formatWhen, money } from '../lib/format.js'
import { downloadCsv, downloadExcel } from '../lib/export.js'
import { downloadPurchaseOrderPdf } from '../lib/pdf.js'
import { PoDocument } from '../components/PoDocument.jsx'
import { Badge, Empty, Field, Notice, PageHead, StatusBadge, Timeline } from '../components/ui.jsx'

export function Orders() {
  const { state } = useStore()
  const user = currentUser(state)
  const [status, setStatus] = useState('')
  const own = new Set(state.requests.filter((request) => request.requesterId === user.id).map((request) => request.id))
  const rows = state.orders
    .filter((order) => user.role !== 'requester' || own.has(order.requestId))
    .filter((order) => !status || order.status === status)

  function exportRows(kind) {
    const data = rows.map((order) => ({
      Order: order.number,
      Supplier: supplierById(state, order.supplierId)?.name || '',
      Project: projectById(state, order.projectId)?.name || '',
      Total: order.total,
      Status: order.status,
      Issued: formatDate(order.issuedAt),
    }))
    if (kind === 'csv') downloadCsv('hydroferric-orders.csv', data)
    else downloadExcel('hydroferric-orders.xls', data)
  }

  return (
    <>
      <PageHead kicker="02 / Procurement" title="Purchase orders" lead={PO_CONTROL}>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => exportRows('csv')}>CSV</button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => exportRows('xls')}>Excel</button>
      </PageHead>
      <div className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Order status">
          <option value="">All statuses</option>
          {Object.entries(PO_STATUS).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
      </div>
      {rows.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Supplier</th><th>Project</th><th>Status</th><th>Total</th></tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id}>
                  <td data-label="Order"><a className="link" href={`#/orders/${order.id}`}>{order.number}</a><span className="muted">{formatDate(order.issuedAt)}</span></td>
                  <td data-label="Supplier">{supplierById(state, order.supplierId)?.name}</td>
                  <td data-label="Project">{projectById(state, order.projectId)?.code}</td>
                  <td data-label="Status">
                    <StatusBadge map={PO_STATUS} status={order.status} />
                    {order.revisions.length ? <Badge tone="teal">Revised</Badge> : null}
                    {order.increasePending ? <Badge tone="warn">Increase pending</Badge> : null}
                  </td>
                  <td className="num" data-label="Total">{money(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No purchase orders yet" text="An order appears automatically when a quotation is approved." />}
    </>
  )
}

export function OrderDetail({ id }) {
  const { state, revisePo, decideIncrease, cancelPo } = useStore()
  const user = currentUser(state)
  const order = state.orders.find((item) => item.id === id)
  const [reason, setReason] = useState('')
  const [deliveryTerms, setDeliveryTerms] = useState(order?.deliveryTerms || '')
  const [total, setTotal] = useState(order?.total || '')
  const [cancelReason, setCancelReason] = useState('')
  const [comment, setComment] = useState('')
  if (!order) return <Empty title="Purchase order not found" />
  const request = requestById(state, order.requestId)
  if (user.role === 'requester' && request?.requesterId !== user.id) return <Empty title="This order is not on your desk" />
  const supplier = supplierById(state, order.supplierId)
  const project = projectById(state, order.projectId)
  const quote = state.quotations.find((item) => item.id === order.quotationId)
  const view = {
    number: order.number,
    issued: formatDate(order.issuedAt),
    supplier: supplier?.name || 'Supplier',
    supplierAddress: supplier?.address || '',
    project: project?.name || '',
    site: project?.site || '',
    request: request?.number || '',
    quotation: quote ? `${quote.number} · ${quote.reference}` : '—',
    lines: order.items.map((item) => ({ description: item.description, qty: item.qty, unit: item.unit, amount: money(lineAmount(item)) })),
    total: money(order.total),
    deliveryTerms: order.deliveryTerms,
    approver: personName(state, order.issuedBy),
    control: PO_CONTROL,
  }
  const canRevise = ['procurement', 'admin'].includes(user.role) && order.status === 'issued'
  const canCancel = ['procurement', 'approver', 'admin'].includes(user.role) && order.status === 'issued'
  const canIncrease = order.increasePending && ['approver', 'admin', 'management'].includes(user.role)

  return (
    <>
      <PageHead kicker="02 / Procurement" title={order.number} lead={`Issued ${formatWhen(order.issuedAt)} by ${personName(state, order.issuedBy)}.`}>
        <StatusBadge map={PO_STATUS} status={order.status} />
        <button className="btn btn-ghost" type="button" onClick={() => window.print()}>Print</button>
        <button className="btn btn-primary" type="button" onClick={() => downloadPurchaseOrderPdf({
          ...view,
          total: `NGN ${order.total.toLocaleString('en-NG')}`,
          lines: order.items.map((item) => ({ ...item, amount: lineAmount(item).toLocaleString('en-NG') })),
        })}>Download PDF</button>
      </PageHead>
      <PoDocument view={view} />
      {order.cancellation ? <Notice tone="bad">Cancelled {formatWhen(order.cancellation.at)} by {personName(state, order.cancellation.by)}. {order.cancellation.reason}</Notice> : null}
      {order.revisions.length ? (
        <article className="card card-pad no-print">
          <h2>Revisions</h2>
          <Timeline items={[...order.revisions].reverse().map((item) => ({
            id: item.id,
            action: `Total ${money(item.previousTotal)} to ${money(item.total)}`,
            meta: `${personName(state, item.actorId)} · ${formatWhen(item.at)}`,
            comment: item.reason,
          }))} />
        </article>
      ) : null}
      {canIncrease ? (
        <article className="card card-pad stack no-print">
          <h2>Increase waiting</h2>
          <p>{order.increasePending.reason} Requested total {money(order.increasePending.total)}.</p>
          <Field label="Comment"><textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
          <div className="btn-row">
            <button className="btn btn-primary" type="button" onClick={() => decideIncrease(order.id, 'approve', comment)}>Approve increase</button>
            <button className="btn btn-danger" type="button" onClick={() => decideIncrease(order.id, 'reject', comment)}>Refuse</button>
          </div>
        </article>
      ) : null}
      {canRevise ? (
        <form className="card card-pad stack no-print" onSubmit={(event) => { event.preventDefault(); revisePo({ id: order.id, reason, deliveryTerms, total: Number(total) }) }}>
          <h2>Log a revision</h2>
          <p className="hint">A lower total or a delivery change is logged immediately. A higher total waits for the designated approver.</p>
          <Field label="Revised total"><input type="number" min="1" value={total} onChange={(event) => setTotal(event.target.value)} /></Field>
          <Field label="Delivery terms"><input value={deliveryTerms} onChange={(event) => setDeliveryTerms(event.target.value)} /></Field>
          <Field label="Reason"><textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} required /></Field>
          <button className="btn btn-teal" type="submit">Record revision</button>
        </form>
      ) : null}
      {canCancel ? (
        <form className="card card-pad stack no-print" onSubmit={(event) => { event.preventDefault(); cancelPo(order.id, cancelReason) }}>
          <h2>Cancel order</h2>
          <Field label="Reason"><textarea rows={2} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required /></Field>
          <button className="btn btn-danger" type="submit">Cancel purchase order</button>
        </form>
      ) : null}
    </>
  )
}
