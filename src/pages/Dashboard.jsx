import {
  currentUser,
  requestById,
  decidedItems,
  pendingItems,
  personName,
} from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { formatWhen } from '../lib/format.js'
import { StepDocuments } from '../components/Documents.jsx'
import { approvalBlock } from '../domain/documents.js'
import { DecisionForm, Empty, PageHead } from '../components/ui.jsx'
import { useState } from 'react'

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
      const block = approvalBlock(state, requestById(state, invoice?.requestId), 'mobilization')
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
      {request ? <StepDocuments request={request} through={task.type === 'quotation' ? 'quotation' : task.type === 'increase' ? 'po_waybill' : task.type === 'schedule' ? 'mobilization' : 'request'} /> : null}
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
