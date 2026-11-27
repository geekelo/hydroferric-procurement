import { deskOf } from '../domain/desk.js'
import { filterDisbursements, filterInvoices, filterProjects, filterRequests, requestCommitted, requestPaid } from '../domain/reports.js'
import { effectiveInvoiceStatus, myTasks, projectFigures } from '../domain/selectors.js'
import { invoiceOutstanding, requestTotal } from '../domain/workflow.js'
import { money } from '../lib/format.js'

function Chip({ label, value, note }) {
  return (
    <div className="rs-chip">
      <span>{label}</span>
      <b>{value}</b>
      {note ? <em>{note}</em> : null}
    </div>
  )
}

const CLOSED = ['closed', 'rejected', 'cancelled', 'draft']
const sum = (list, pick) => list.reduce((total, item) => total + Number(pick(item) || 0), 0)

function strip(state, user, kind, filters) {
  const desk = deskOf(user)

  if (kind === 'invoices') {
    const invoices = filterInvoices(state, filters)
    const today = new Date().toISOString().slice(0, 10)
    const overdue = invoices.filter((invoice) => effectiveInvoiceStatus(invoice, today) === 'overdue')
    return [
      { label: 'Invoices', value: invoices.length },
      { label: 'Overdue', value: money(sum(overdue, invoiceOutstanding)), note: overdue.length ? `${overdue.length} invoice${overdue.length === 1 ? '' : 's'}` : 'None past due' },
      { label: 'Outstanding', value: money(sum(invoices, invoiceOutstanding)) },
      { label: 'Paid', value: money(sum(invoices, (invoice) => invoice.paidAmount)) },
    ]
  }

  if (kind === 'disbursements') {
    const entries = filterDisbursements(state, filters)
    return [
      { label: 'Payments', value: new Set(entries.map((entry) => entry.payment.id)).size },
      { label: 'Amount recorded', value: money(sum(entries, (entry) => entry.item.amount)) },
      { label: 'Suppliers', value: new Set(entries.map((entry) => entry.payment.supplierId)).size },
      { label: 'Projects', value: new Set(entries.map((entry) => entry.payment.projectId)).size },
    ]
  }

  if (kind === 'projects') {
    const projects = filterProjects(state, filters)
    const figures = projects.map((project) => projectFigures(state, project.id))
    return [
      { label: 'Projects', value: projects.length },
      { label: 'Approved cost', value: money(sum(figures, (item) => item.approved)) },
      { label: 'Amount committed', value: money(sum(figures, (item) => item.committed)) },
      { label: 'Total cost', value: money(sum(figures, (item) => item.total)) },
    ]
  }

  const requests = filterRequests(state, filters)
  const open = requests.filter((request) => !CLOSED.includes(request.status))
  const closed = requests.filter((request) => request.status === 'closed')
  if (desk === 'department') {
    const procurement = user.role === 'procurement'
    const mine = procurement
      ? requests.filter((request) => ['approved', 'sourcing', 'recommended'].includes(request.status)).length
      : requests.filter((request) => request.status === 'draft' || request.status === 'returned').length
    return [
      { label: 'Open', value: open.length },
      { label: procurement ? 'To source' : 'Drafts and returns', value: mine },
      { label: 'Projects', value: new Set(requests.map((request) => request.projectId)).size },
      { label: 'Closed', value: closed.length },
    ]
  }
  return [
    { label: 'Requests', value: requests.length },
    { label: 'Open', value: open.length },
    { label: 'Amount committed', value: money(sum(requests, (request) => requestCommitted(state, request))) },
    { label: 'Paid', value: money(sum(requests, (request) => requestPaid(state, request))) },
  ]
}

function hasFilter(filters, locked) {
  return Object.entries(filters).some(([key, value]) => value && !(locked && key === 'department'))
}

// The old Overview page, folded into a compact strip at the top of Reports. Every figure follows the filters.
export function ReportSummary({ state, user, kind, filters, locked = '' }) {
  const desk = deskOf(user)
  const chips = strip(state, user, kind, filters)
  const filtered = hasFilter(filters, locked)
  const showDepartments = (desk === 'executive' || desk === 'admin') && kind === 'requests'
  const waiting = desk === 'executive' || desk === 'admin' ? myTasks(state, user).filter((task) => task.kind === 'decision') : []
  const departments = showDepartments
    ? [...filterRequests(state, filters).reduce((map, request) => {
        const row = map.get(request.department) || { department: request.department, requests: 0, open: 0, committed: 0, estimate: 0 }
        row.requests += 1
        if (!CLOSED.includes(request.status)) row.open += 1
        row.committed += requestCommitted(state, request)
        row.estimate += requestTotal(request)
        map.set(request.department, row)
        return map
      }, new Map()).values()].sort((a, b) => a.department.localeCompare(b.department))
    : []
  return (
    <>
      <section className="rs-strip" aria-label="Summary">
        {chips.map((chip) => <Chip key={chip.label} {...chip} />)}
      </section>
      {filtered ? <p className="rs-note">Figures follow the filters below.</p> : null}
      {waiting.length ? (
        <p className="rs-waiting">
          <strong>Waiting for you</strong>
          {waiting.map((task) => <a key={task.id} href={task.href}>{task.title}</a>)}
        </p>
      ) : null}
      {showDepartments && departments.length ? (
        <details className="rs-dept card" open>
          <summary>By department</summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Department</th><th>Requests</th><th>Open</th><th>Estimate</th><th>Amount committed</th></tr>
              </thead>
              <tbody>
                {departments.map((row) => (
                  <tr key={row.department}>
                    <td data-label="Department"><a className="link" href={`#/requests?department=${encodeURIComponent(row.department)}`}>{row.department}</a></td>
                    <td data-label="Requests">{row.requests}</td>
                    <td data-label="Open">{row.open}</td>
                    <td data-label="Estimate">{money(row.estimate)}</td>
                    <td data-label="Amount committed">{money(row.committed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </>
  )
}
