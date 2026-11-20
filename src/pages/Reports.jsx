import { useState } from 'react'
import { DEPARTMENTS, INVOICE_STATUS, REQUEST_STATUS } from '../domain/constants.js'
import { reportKinds } from '../domain/desk.js'
import { buildReport } from '../domain/reports.js'
import { currentUser } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { downloadCsv, downloadExcel } from '../lib/export.js'
import { Empty, PageHead } from '../components/ui.jsx'

const KINDS = [
  { id: 'requests', label: 'Requests' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'disbursements', label: 'Payments' },
  { id: 'projects', label: 'Projects' },
]

const STATUS = {
  requests: REQUEST_STATUS,
  invoices: { ...INVOICE_STATUS, overdue: { label: 'Overdue' } },
}

export function Reports() {
  const { state } = useStore()
  const user = currentUser(state)
  const allowed = reportKinds(user)
  const kinds = KINDS.filter((item) => allowed.includes(item.id))
  const lockedDepartment = user.role === 'requester' ? user.department : ''
  const [kind, setKind] = useState(kinds[0].id)
  const [filters, setFilters] = useState({ department: lockedDepartment, projectId: '', status: '', from: '', to: '' })
  const rows = buildReport(state, kind, lockedDepartment ? { ...filters, department: lockedDepartment } : filters)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  const set = (key) => (event) => setFilters({ ...filters, [key]: event.target.value })

  return (
    <>
      <PageHead kicker={user.role === 'finance' ? 'Accounts' : user.role === 'requester' ? user.department : 'Reports'} title="Reports" lead={user.role === 'finance' ? 'Payments and the invoices behind them.' : 'Export the current list to CSV or Excel.'}>
        <button className="btn btn-ghost" type="button" onClick={() => downloadCsv(`hydroferric-${kind}.csv`, rows)}>CSV</button>
        <button className="btn btn-primary" type="button" onClick={() => downloadExcel(`hydroferric-${kind}.xls`, rows)}>Excel</button>
      </PageHead>
      <div className="tabs">
        {kinds.map((item) => (
          <button key={item.id} type="button" className={`tab ${kind === item.id ? 'on' : ''}`} onClick={() => { setKind(item.id); setFilters({ ...filters, status: '' }) }}>{item.label}</button>
        ))}
      </div>
      <div className="toolbar">
        {lockedDepartment ? null : (
          <select value={filters.department} onChange={set('department')} aria-label="Department">
            <option value="">All departments</option>
            {DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        )}
        <select value={filters.projectId} onChange={set('projectId')} aria-label="Project">
          <option value="">All projects</option>
          {state.projects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}
        </select>
        {STATUS[kind] ? (
          <select value={filters.status} onChange={set('status')} aria-label="Status">
            <option value="">All</option>
            {Object.entries(STATUS[kind]).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
          </select>
        ) : null}
        <input type="date" value={filters.from} onChange={set('from')} aria-label="From" />
        <input type="date" value={filters.to} onChange={set('to')} aria-label="To" />
      </div>
      {rows.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>{headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Nothing matches this filter" />}
    </>
  )
}
