import { useMemo, useState } from 'react'
import { DEPARTMENTS, REQUEST_STATUS, URGENCIES } from '../domain/constants.js'
import { currentUser, projectById, visibleRequests } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { requestTotal } from '../domain/workflow.js'
import { money } from '../lib/format.js'
import { Badge, Empty, PageHead, StatusBadge } from '../components/ui.jsx'

export function Requests({ department: initialDepartment = '' }) {
  const { state } = useStore()
  const user = currentUser(state)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [department, setDepartment] = useState(initialDepartment)
  const wide = user.role === 'management' || user.role === 'admin'
  const canCreate = user.role === 'requester' || user.role === 'admin'
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return visibleRequests(state, user)
      .filter((request) => !status || request.status === status)
      .filter((request) => !department || request.department === department)
      .filter((request) => !needle || `${request.number} ${request.title}`.toLowerCase().includes(needle))
      .sort((a, b) => b.number.localeCompare(a.number))
  }, [state, user, query, status, department])

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
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search number or title" aria-label="Search requests" />
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
                <th>Estimate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => (
                <tr key={request.id}>
                  <td data-label="Number"><a className="link" href={`#/requests/${request.id}`}>{request.number}</a></td>
                  <td data-label="Request">
                    <strong>{request.title}</strong>
                    <span className="muted">{request.department}</span>
                  </td>
                  <td data-label="Project">{projectById(state, request.projectId)?.code}</td>
                  <td data-label="Urgency"><Badge tone={request.urgency === 'critical' || request.urgency === 'high' ? 'warn' : 'neutral'}>{URGENCIES.find((item) => item.id === request.urgency)?.label}</Badge></td>
                  <td data-label="Status"><StatusBadge map={REQUEST_STATUS} status={request.status} /></td>
                  <td className="num" data-label="Estimate">{money(requestTotal(request))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No requests in this view" text="Clear a filter, or raise a new request." />}
    </>
  )
}
