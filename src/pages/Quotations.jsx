import { useState } from 'react'
import { QUOTE_STATUS } from '../domain/constants.js'
import { currentUser, requestById, supplierById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { money, formatDate } from '../lib/format.js'
import { Empty, PageHead, StatusBadge } from '../components/ui.jsx'

export function Quotations() {
  const { state } = useStore()
  const user = currentUser(state)
  const [status, setStatus] = useState('')
  const own = new Set(state.requests.filter((request) => request.requesterId === user.id).map((request) => request.id))
  const rows = state.quotations
    .filter((quote) => user.role !== 'requester' || own.has(quote.requestId))
    .filter((quote) => !status || quote.status === status)
    .sort((a, b) => b.number.localeCompare(a.number))

  return (
    <>
      <PageHead kicker="02 / Procurement" title="Quotations" lead="Compare price, delivery, warranty and the notes recorded against each offer. A purchase order is created only after the designated approver accepts a recommendation." />
      <div className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Quotation status">
          <option value="">All statuses</option>
          {Object.entries(QUOTE_STATUS).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
      </div>
      {rows.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Quotation</th>
                <th>Supplier</th>
                <th>Request</th>
                <th>Lead</th>
                <th>Valid</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => {
                const request = requestById(state, quote.requestId)
                return (
                  <tr key={quote.id}>
                    <td data-label="Quotation"><a className="link" href={`#/requests/${quote.requestId}`}>{quote.number}</a><span className="muted">{quote.reference}</span></td>
                    <td data-label="Supplier">{supplierById(state, quote.supplierId)?.name}</td>
                    <td data-label="Request">{request?.number}<span className="muted">{request?.title}</span></td>
                    <td data-label="Lead">{quote.leadDays} days</td>
                    <td data-label="Valid">{formatDate(quote.validity)}</td>
                    <td data-label="Status"><StatusBadge map={QUOTE_STATUS} status={quote.status} /></td>
                    <td className="num" data-label="Amount">{money(quote.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No quotations in this view" />}
    </>
  )
}
