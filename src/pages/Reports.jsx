import { useState } from 'react'
import { DEPARTMENTS, INVOICE_STATUS, REQUEST_STATUS } from '../domain/constants.js'
import { reportKinds } from '../domain/desk.js'
import { PAYMENT_TERMS, vesselsOf } from '../domain/filters.js'
import { buildReport } from '../domain/reports.js'
import { currentUser } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { downloadCsv, downloadExcel } from '../lib/export.js'
import { Empty, PageHead } from '../components/ui.jsx'
import { ReportSummary } from './ReportSummary.jsx'

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
  const [kind, setKind] = useState((user.role === 'finance' ? kinds.find((item) => item.id === 'invoices') : null)?.id || kinds[0].id)
  const [filters, setFilters] = useState({ department: lockedDepartment, projectId: '', status: '', from: '', to: '', keyword: '', vendor: '', vessel: '', terms: '', days: '' })
  const effective = lockedDepartment ? { ...filters, department: lockedDepartment } : filters
  const rows = buildReport(state, kind, effective)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  const showTerms = ['finance', 'admin', 'management'].includes(user.role) && ['requests', 'invoices', 'disbursements'].includes(kind)
  const showVendor = ['requests', 'invoices', 'disbursements'].includes(kind)
  const vessels = vesselsOf(state.requests)
  const set = (key) => (event) => setFilters({ ...filters, [key]: event.target.value })

  return (
    <>
      <PageHead kicker={user.role === 'finance' ? 'Accounts' : user.role === 'requester' ? user.department : 'Reports'} title="Reports" lead={user.role === 'finance' ? 'Payments and the invoices behind them.' : 'Export the current list to CSV or Excel.'}>
        <button className="btn btn-ghost" type="button" onClick={() => downloadCsv(`hydroferric-${kind}.csv`, rows)}>CSV</button>
        <button className="btn btn-primary" type="button" onClick={() => downloadExcel(`hydroferric-${kind}.xls`, rows)}>Excel</button>
      </PageHead>
      <ReportSummary state={state} user={user} kind={kind} filters={effective} locked={lockedDepartment} />
      <div className="tabs">
        {kinds.map((item) => (
          <button key={item.id} type="button" className={`tab ${kind === item.id ? 'on' : ''}`} onClick={() => { setKind(item.id); setFilters({ ...filters, status: '', vendor: '', vessel: '', terms: '', days: '' }) }}>{item.label}</button>
        ))}
      </div>
      <div className="toolbar filter-grid">
        <input type="search" value={filters.keyword} onChange={set('keyword')} placeholder={kind === 'requests' ? 'Keyword: number, title, vessel or vendor' : 'Keyword'} aria-label="Keyword" />
        {showVendor ? (
          <select value={filters.vendor} onChange={set('vendor')} aria-label="Vendor">
            <option value="">All vendors</option>
            {[...state.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        ) : null}
        {kind === 'requests' ? (
          <select value={filters.vessel} onChange={set('vessel')} aria-label="Vessel where used">
            <option value="">All vessels</option>
            {vessels.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        ) : null}
        {showTerms ? (
          <>
            <select value={filters.terms} onChange={(event) => setFilters({ ...filters, terms: event.target.value, days: '' })} aria-label="Payment terms">
              <option value="">All payment terms</option>
              {PAYMENT_TERMS.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
            </select>
            {filters.terms === 'days' ? <input type="number" min="1" value={filters.days} onChange={set('days')} placeholder="Number of days" aria-label="Number of days" /> : null}
          </>
        ) : null}
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
        <label className="filter-date">{kind === 'requests' ? 'Started from' : 'From'}<input type="date" value={filters.from} onChange={set('from')} aria-label="From" /></label>
        <label className="filter-date">to<input type="date" value={filters.to} onChange={set('to')} aria-label="To" /></label>
      </div>
      {rows.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>{headers.map((header) => <td key={header} data-label={header}>{row[header]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Nothing matches this filter" />}
    </>
  )
}
