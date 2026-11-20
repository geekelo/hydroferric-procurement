import { REQUEST_STATUS, statusMeta } from '../domain/constants.js'
import { deskOf } from '../domain/desk.js'
import {
  currentUser,
  requestById,
  decidedItems,
  departmentRollup,
  effectiveInvoiceStatus,
  myTasks,
  pendingItems,
  personName,
  projectById,
  projectFigures,
  supplierById,
  visibleProjects,
  visibleRequests,
} from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { disbursed, invoiceOutstanding } from '../domain/workflow.js'
import { formatWhen, money } from '../lib/format.js'
import { StepDocuments } from '../components/Documents.jsx'
import { approvalBlock } from '../domain/documents.js'
import { DecisionForm, Empty, PageHead } from '../components/ui.jsx'
import { useState } from 'react'

export function Overview() {
  const { state } = useStore()
  const user = currentUser(state)
  const desk = deskOf(user)
  if (desk === 'accounts') return <AccountsOverview state={state} />
  if (desk === 'executive' || desk === 'admin') return <CompanyOverview state={state} user={user} />
  return <DepartmentOverview state={state} user={user} />
}

function DepartmentOverview({ state, user }) {
  const requests = visibleRequests(state, user)
  const open = requests.filter((request) => !['closed', 'rejected', 'cancelled', 'draft'].includes(request.status))
  const mine = user.role === 'procurement'
    ? requests.filter((request) => ['approved', 'sourcing', 'recommended'].includes(request.status)).length
    : requests.filter((request) => request.status === 'draft' || request.status === 'returned').length
  const projects = visibleProjects(state, user)
  const lead = user.role === 'procurement'
    ? 'Requisitions that have reached procurement, across the departments that raised them.'
    : `Requisitions and projects for ${user.department}.`
  return (
    <>
      <PageHead kicker={user.role === 'procurement' ? 'Procurement' : user.department} title="Overview" lead={lead} />
      <section className="stat-grid">
        <Stat label="Open" value={open.length} />
        <Stat label={user.role === 'procurement' ? 'To source' : 'Drafts and returns'} value={mine} />
        <Stat label="Projects" value={projects.length} />
        <Stat label="Closed" value={requests.filter((request) => request.status === 'closed').length} />
      </section>
      <section className="card card-pad">
        <div className="card-head"><h2>Requests</h2><a href="#/requests">All requests</a></div>
        <RecordList
          rows={requests.slice().sort((a, b) => b.number.localeCompare(a.number)).slice(0, 6)}
          empty="No requisitions for this department yet."
          render={(request) => (
            <a key={request.id} className="task" href={`#/requests/${request.id}`}>
              <strong>{request.number} · {request.title}</strong>
              <span>{statusMeta(REQUEST_STATUS, request.status).label} · {projectById(state, request.projectId)?.name}</span>
            </a>
          )}
        />
      </section>
      <ProjectBars state={state} projects={projects} />
    </>
  )
}

function AccountsOverview({ state }) {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = state.invoices.filter((invoice) => effectiveInvoiceStatus(invoice, today) === 'overdue')
  const overdueValue = overdue.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0)
  const toConfirm = state.payments.filter((payment) => payment.status === 'authorised' && Number(payment.approvedAmount) - disbursed(payment) > 0)
  const confirmed = state.payments.filter((payment) => disbursed(payment) > 0)
  const projects = state.projects.filter((project) => state.payments.some((payment) => payment.projectId === project.id) || state.invoices.some((invoice) => invoice.projectId === project.id))
  return (
    <>
      <PageHead kicker="Accounts" title="Overview" lead="What is due, what is authorised, and what has been recorded against each project." />
      <section className="stat-grid">
        <Stat label="Overdue" value={money(overdueValue)} note={overdue.length ? `${overdue.length} invoice${overdue.length === 1 ? '' : 's'}` : 'None past due'} />
        <Stat label="To record" value={toConfirm.length} />
        <Stat label="Recorded" value={confirmed.length} />
        <Stat label="Projects" value={projects.length} />
      </section>
      <section className="card card-pad">
        <div className="card-head"><h2>Payments</h2><a href="#/payments">Payment desk</a></div>
        <RecordList
          rows={state.payments}
          empty="No payments recorded yet."
          render={(payment) => (
            <a key={payment.id} className="task" href={`#/payments/${payment.id}`}>
              <strong>{payment.number} · {supplierById(state, payment.supplierId)?.name}</strong>
              <span>{money(disbursed(payment))} recorded of {money(payment.approvedAmount)} · {projectById(state, payment.projectId)?.name}</span>
            </a>
          )}
        />
      </section>
      <ProjectBars state={state} projects={projects} />
    </>
  )
}

function CompanyOverview({ state, user }) {
  const waiting = myTasks(state, user).filter((task) => task.kind === 'decision')
  const rows = departmentRollup(state)
  return (
    <>
      <PageHead kicker="All departments" title="Overview" lead="Open requisitions, commitments and spend for every department." />
      {waiting.length ? (
        <section className="card card-pad">
          <div className="card-head"><h2>Waiting for you</h2></div>
          {waiting.map((task) => (
            <a key={task.id} className="task" href={task.href}>
              <strong>{task.title}</strong>
              <span>{task.detail}</span>
            </a>
          ))}
        </section>
      ) : null}
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Requests</th>
              <th>Open</th>
              <th>Committed</th>
              <th>Spent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.department}>
                <td><a className="link" href={`#/requests?department=${encodeURIComponent(row.department)}`}>{row.department}</a></td>
                <td>{row.requests}</td>
                <td>{row.open}</td>
                <td>{money(row.committed)}</td>
                <td>{money(row.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card card-pad">
        <div className="card-head"><h2>Latest activity</h2><a href="#/activity">Activity</a></div>
        <ul className="timeline compact">
          {[...state.audit].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5).map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.action}</strong>
                <span>{personName(state, item.actorId)} · {formatWhen(item.at)}</span>
              </div>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

export function Pending() {
  const { state } = useStore()
  const user = currentUser(state)
  const tasks = pendingItems(state, user)
  return (
    <>
      <PageHead kicker="Approving" title="Pending" lead="Items waiting for your decision." />
      {tasks.length ? (
        <div className="stack">
          {tasks.map((task) => <PendingCard key={task.id} task={task} />)}
        </div>
      ) : <Empty title="Nothing is pending" text="When a requisition, quotation, payment or delivery reaches you, it will appear here." />}
    </>
  )
}

function taskRequest(state, task) {
  if (task.type === 'request' || task.type === 'quotation') return requestById(state, task.recordId)
  if (task.type === 'increase') return requestById(state, state.orders.find((order) => order.id === task.recordId)?.requestId)
  return null
}

function taskBlock(state, task) {
  if (task.type === 'request') return approvalBlock(state, taskRequest(state, task), 'request')
  if (task.type === 'quotation') return approvalBlock(state, taskRequest(state, task), 'quotation')
  if (task.type === 'increase') return approvalBlock(state, taskRequest(state, task), 'po_waybill')
  if (task.type === 'schedule') {
    const schedule = state.schedules.find((item) => item.id === task.recordId)
    for (const line of schedule?.lines || []) {
      const invoice = state.invoices.find((item) => item.id === line.invoiceId)
      const block = approvalBlock(state, requestById(state, invoice?.requestId), 'invoice')
      if (block) return block
    }
  }
  return ''
}

function PendingCard({ task }) {
  const store = useStore()
  const [comment, setComment] = useState('')
  const block = taskBlock(store.state, task)
  const request = taskRequest(store.state, task)
  if (task.type === 'verify') {
    return (
      <a className="card card-pad task" href={task.href}>
        <strong>{task.title}</strong>
        <span>{task.detail}</span>
      </a>
    )
  }
  return (
    <article className="card card-pad stack">
      <div className="card-head">
        <h2>{task.title}</h2>
        <a href={task.href}>Open</a>
      </div>
      {request ? <StepDocuments request={request} through={task.type === 'quotation' ? 'quotation' : task.type === 'increase' ? 'po_waybill' : task.type === 'schedule' ? 'invoice' : 'request'} /> : null}
      <p>{task.detail}</p>
      {task.type === 'request' ? (
        <DecisionForm comment={comment} setComment={setComment} approveLabel="Approve" note={block} approveDisabled={Boolean(block)} onApprove={() => store.decideRequest(task.recordId, 'approve', comment)} onReturn={() => store.decideRequest(task.recordId, 'return', comment)} onReject={() => store.decideRequest(task.recordId, 'reject', comment)} />
      ) : null}
      {task.type === 'quotation' ? (
        <DecisionForm comment={comment} setComment={setComment} approveLabel="Approve and issue order" note={block || 'Approval issues the numbered purchase order.'} approveDisabled={Boolean(block)} onApprove={() => store.decideQuotation(task.recordId, 'approve', comment)} onReject={() => store.decideQuotation(task.recordId, 'reject', comment)} />
      ) : null}
      {task.type === 'schedule' ? (
        <DecisionForm comment={comment} setComment={setComment} approveLabel="Authorise" note={block || 'This records the payment. It does not send a bank transfer.'} approveDisabled={Boolean(block)} onApprove={() => store.decideSchedule(task.recordId, 'approve', comment)} onReject={() => store.decideSchedule(task.recordId, 'reject', comment)} />
      ) : null}
      {task.type === 'increase' ? (
        <DecisionForm comment={comment} setComment={setComment} approveLabel="Approve increase" note={block} approveDisabled={Boolean(block)} onApprove={() => store.decideIncrease(task.recordId, 'approve', comment)} onReject={() => store.decideIncrease(task.recordId, 'reject', comment)} />
      ) : null}
    </article>
  )
}

export function Done() {
  const { state } = useStore()
  const user = currentUser(state)
  const rows = decidedItems(state, user)
  return (
    <>
      <PageHead kicker="Approving" title="Done" lead="Decisions you have already recorded." />
      {rows.length ? (
        <section className="card card-pad">
          {rows.map((row) => (
            <a key={row.id} className="task" href={row.href}>
              <strong>{row.title}</strong>
              <span>{row.detail} · {formatWhen(row.at)}</span>
            </a>
          ))}
        </section>
      ) : <Empty title="No decisions yet" />}
    </>
  )
}

export function Notifications() {
  const { state, readNotifications, readNotification } = useStore()
  const user = currentUser(state)
  const notes = state.notifications.filter((item) => item.userId === user.id)
  return (
    <>
      <PageHead kicker="Inbox" title="Notifications" lead="Updates on requisitions, approvals and payments that involve you.">
        {notes.some((item) => !item.read) ? <button className="btn btn-ghost" type="button" onClick={readNotifications}>Mark all read</button> : null}
      </PageHead>
      {notes.length ? (
        <section className="card card-pad">
          {notes.map((item) => (
            <a key={item.id} className={`task ${item.read ? '' : 'unread-row'}`} href={item.href} onClick={() => readNotification(item.id)}>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
            </a>
          ))}
        </section>
      ) : <Empty title="No notifications" />}
    </>
  )
}

export function Activity() {
  const { state } = useStore()
  return (
    <>
      <PageHead kicker="All departments" title="Activity" lead="What has happened across requisitions, deliveries and payments." />
      <ul className="timeline card card-pad">
        {[...state.audit].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.action}</strong>
              <span>{personName(state, item.actorId)} · {formatWhen(item.at)}</span>
            </div>
            <p>{item.detail}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function ProjectBars({ state, projects }) {
  if (!projects.length) return null
  return (
    <section className="card card-pad">
      <div className="card-head"><h2>Projects</h2><a href="#/projects">All projects</a></div>
      <div className="stack">
        {projects.map((project) => {
          const figures = projectFigures(state, project.id)
          const committed = figures.budget ? Math.min(100, (figures.committed / figures.budget) * 100) : 0
          const actual = figures.budget ? Math.min(100, (figures.actual / figures.budget) * 100) : 0
          return (
            <a key={project.id} className="budget-row" href={`#/projects/${project.id}`}>
              <div>
                <strong>{project.name}</strong>
                <span>{money(figures.actual)} spent · {money(figures.committed)} committed</span>
              </div>
              <div className="bar" aria-hidden="true">
                <b style={{ width: `${committed}%` }} />
                <i style={{ width: `${actual}%` }} />
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function RecordList({ rows, empty, render }) {
  if (!rows.length) return <p className="hint">{empty}</p>
  return <div className="stack">{rows.map(render)}</div>
}

function Stat({ label, value, note }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {note ? <em>{note}</em> : null}
    </article>
  )
}
