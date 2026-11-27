import { useMemo, useState } from 'react'
import { DEPARTMENTS, REQUEST_STATUS, URGENCIES } from '../domain/constants.js'
import { currentUser, projectById, visibleRequests } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { requestDates, requestMatches, vesselsOf } from '../domain/filters.js'
import { requestTotal } from '../domain/workflow.js'
import { formatDate, money } from '../lib/format.js'
import { Badge, Empty, PageHead, StatusBadge } from '../components/ui.jsx'

export function Requests({ department: initialDepartment = '' }) {
  const { state } = useStore()
  const user = currentUser(state)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [department, setDepartment] = useState(initialDepartment)
  const [vendor, setVendor] = useState('')
  const [vessel, setVessel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const wide = user.role === 'management' || user.role === 'admin'
  const canCreate = user.role === 'requester' || user.role === 'admin'
  const visible = useMemo(() => visibleRequests(state, user), [state, user])
  const vessels = useMemo(() => vesselsOf(visible), [visible])
  const rows = useMemo(() => visible
    .filter((request) => !status || request.status === status)
    .filter((request) => !department || request.department === department)
    .filter((request) => requestMatches(state, request, { keyword: query, from, to, vessel, vendor }))
    .sort((a, b) => b.number.localeCompare(a.number)), [state, visible, query, status, department, vendor, vessel, from, to])

  const lead = user.role === 'procurement'
    ? 'Requisitions sent in for sourcing, comparison and purchase orders.'
    : wide
      ? 'Every department. Open a row to follow that requisition.'
      : `Requisitions for ${user.department}.`

  return (
    <>
      <PageHead kicker={wide ? 'All departments' : user.department} title="Requests" lead={lead}>
        {canCreate ? <a className="btn btn-primary" href="#/requests/new">New request</a> : null}
      </PageHead>
      <div className="toolbar filter-grid">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keyword: number, title, vessel or vendor" aria-label="Keyword" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(REQUEST_STATUS).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
        {wide ? (
          <select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        ) : null}
        <select value={vendor} onChange={(event) => setVendor(event.target.value)} aria-label="Vendor">
          <option value="">All vendors</option>
          {[...state.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
        <select value={vessel} onChange={(event) => setVessel(event.target.value)} aria-label="Vessel where used" disabled={!vessels.length}>
          <option value="">All vessels</option>
          {vessels.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <label className="filter-date">
          <span>Started from</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Started from" />
        </label>
        <label className="filter-date">
          <span>to</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Started to" />
        </label>
      </div>
      {rows.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Request</th>
                <th>Project</th>
                <th>Urgency</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Closed (paid)</th>
                <th>Estimate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => {
                const dates = requestDates(state, request)
                return (
                  <tr key={request.id}>
                    <td data-label="Number"><a className="link" href={`#/requests/${request.id}`}>{request.number}</a></td>
                    <td data-label="Request">
                      <strong>{request.title}</strong>
                      <span className="muted">{request.department}{request.vessel ? ` · ${request.vessel}` : ''}</span>
                    </td>
                    <td data-label="Project">{projectById(state, request.projectId)?.code}</td>
                    <td data-label="Urgency"><Badge tone={request.urgency === 'critical' || request.urgency === 'high' ? 'warn' : 'neutral'}>{URGENCIES.find((item) => item.id === request.urgency)?.label}</Badge></td>
                    <td data-label="Status"><StatusBadge map={REQUEST_STATUS} status={request.status} /></td>
                    <td data-label="Start">{formatDate(dates.start)}</td>
                    <td data-label="End">{formatDate(dates.end)}</td>
                    <td data-label="Closed (paid)">{formatDate(dates.paid)}</td>
                    <td className="num" data-label="Estimate">{money(requestTotal(request))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No requests in this view" text="Clear a filter, or raise a new request." />}
    </>
  )
}
