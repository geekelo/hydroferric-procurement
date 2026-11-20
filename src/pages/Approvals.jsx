import { useState } from 'react'
import { currentUser, myTasks, personName, requestById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { money } from '../lib/format.js'
import { requestTotal } from '../domain/workflow.js'
import { DecisionForm, Empty, PageHead } from '../components/ui.jsx'

export function Approvals() {
  const { state } = useStore()
  const user = currentUser(state)
  const tasks = myTasks(state, user).filter((task) => task.kind === 'decision')
  return (
    <>
      <PageHead kicker="02 / Procurement" title="Approvals" lead="Request reviews, quotation approvals, payment authorisations and order increases land here when they are yours to decide." />
      {tasks.length ? (
        <div className="stack">
          {tasks.map((task) => <DecisionCard key={task.id} task={task} state={state} />)}
        </div>
      ) : (
        <Empty title="Nothing is waiting for your decision" text="When a request, quotation or payment schedule reaches your level, it will appear here." />
      )}
    </>
  )
}

function DecisionCard({ task, state }) {
  const store = useStore()
  const [comment, setComment] = useState('')
  const request = task.type === 'request' || task.type === 'quotation' ? requestById(state, task.recordId) : null
  return (
    <article className="card card-pad stack">
      <div className="card-head">
        <h2>{task.title}</h2>
        <a href={task.href}>Open record</a>
      </div>
      <p>{task.detail}</p>
      {request ? <p className="hint">{request.number} · {personName(state, request.requesterId)} · {money(requestTotal(request))}</p> : null}
      {task.type === 'request' ? (
        <DecisionForm
          comment={comment}
          setComment={setComment}
          approveLabel="Approve level"
          onApprove={() => store.decideRequest(task.recordId, 'approve', comment)}
          onReturn={() => store.decideRequest(task.recordId, 'return', comment)}
          onReject={() => store.decideRequest(task.recordId, 'reject', comment)}
        />
      ) : null}
      {task.type === 'quotation' ? (
        <DecisionForm
          comment={comment}
          setComment={setComment}
          approveLabel="Approve and issue order"
          note="Approval generates the numbered purchase order."
          onApprove={() => store.decideQuotation(task.recordId, 'approve', comment)}
          onReject={() => store.decideQuotation(task.recordId, 'reject', comment)}
        />
      ) : null}
      {task.type === 'schedule' ? (
        <DecisionForm
          comment={comment}
          setComment={setComment}
          approveLabel="Authorise schedule"
          note="Authorising records the payment. It does not send a bank transfer."
          onApprove={() => store.decideSchedule(task.recordId, 'approve', comment)}
          onReject={() => store.decideSchedule(task.recordId, 'reject', comment)}
        />
      ) : null}
      {task.type === 'increase' ? (
        <DecisionForm
          comment={comment}
          setComment={setComment}
          approveLabel="Approve increase"
          onApprove={() => store.decideIncrease(task.recordId, 'approve', comment)}
          onReject={() => store.decideIncrease(task.recordId, 'reject', comment)}
        />
      ) : null}
    </article>
  )
}
