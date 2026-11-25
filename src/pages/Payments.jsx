import { useMemo, useState } from 'react'
import { PAYMENT_CONTROL, PAYMENT_STATUS, SCHEDULE_STATUS } from '../domain/constants.js'
import { currentUser, personName, supplierById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { disbursed, invoiceOutstanding, lockedAmount, pendingLevel, userMayDecide, alreadyActed } from '../domain/workflow.js'
import { formatDate, formatWhen, money, todayISO } from '../lib/format.js'
import { DecisionForm, Empty, Field, Notice, PageHead, StatusBadge, Timeline } from '../components/ui.jsx'

function shift(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return todayISO(date)
}

export function Payments() {
  const { state, createSchedule } = useStore()
  const user = currentUser(state)
  const [from, setFrom] = useState(shift(-45))
  const [to, setTo] = useState(shift(30))
  const [picked, setPicked] = useState({})
  const finance = ['finance', 'admin'].includes(user.role)
  const own = new Set(state.requests.filter((request) => request.requesterId === user.id).map((request) => request.id))
  const eligible = useMemo(() => state.invoices.filter((invoice) => {
    if (!['approved', 'partially_paid'].includes(invoice.status)) return false
    if (invoice.dueDate < from || invoice.dueDate > to) return false
    return invoiceOutstanding(invoice) - lockedAmount(state, invoice.id) > 0
  }), [state, from, to])

  function toggle(invoice) {
    setPicked((current) => {
      const next = { ...current }
      if (next[invoice.id]) delete next[invoice.id]
      else next[invoice.id] = invoiceOutstanding(invoice) - lockedAmount(state, invoice.id)
      return next
    })
  }

  const visibleSchedules = state.schedules.filter((schedule) => user.role !== 'requester' || schedule.lines.some((line) => own.has(state.invoices.find((invoice) => invoice.id === line.invoiceId)?.requestId)))
  const visiblePayments = state.payments.filter((payment) => user.role !== 'requester' || own.has(state.invoices.find((invoice) => invoice.id === payment.invoiceId)?.requestId))

  return (
    <>
      <PageHead kicker="03 / Payments" title="Payments" lead="Collate invoices that fall due in a window, obtain authorisation, then record the bank confirmation and receipt." />
      <Notice>{PAYMENT_CONTROL}</Notice>
      {finance ? (
        <form className="card card-pad stack" onSubmit={(event) => {
          event.preventDefault()
          const lines = Object.entries(picked).map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) }))
          createSchedule({ from, to, lines })
        }}>
          <div className="card-head"><h2>Payment window</h2></div>
          <div className="form-grid">
            <Field label="From"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          </div>
          {eligible.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th></th><th>Invoice</th><th>Supplier</th><th>Due</th><th>Open</th><th>Schedule</th></tr></thead>
                <tbody>
                  {eligible.map((invoice) => {
                    const open = invoiceOutstanding(invoice) - lockedAmount(state, invoice.id)
                    return (
                      <tr key={invoice.id}>
                        <td><input type="checkbox" checked={Boolean(picked[invoice.id])} onChange={() => toggle(invoice)} aria-label={`Include ${invoice.reference}`} /></td>
                        <td data-label="Invoice"><a href={`#/invoices/${invoice.id}`}>{invoice.reference}</a></td>
                        <td data-label="Supplier">{supplierById(state, invoice.supplierId)?.name}</td>
                        <td data-label="Due">{formatDate(invoice.dueDate)}</td>
                        <td className="num" data-label="Open">{money(open)}</td>
                        <td data-label="Schedule">{picked[invoice.id] ? <input type="number" min="1" max={open} value={picked[invoice.id]} onChange={(event) => setPicked({ ...picked, [invoice.id]: event.target.value })} aria-label="Amount" /> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="hint">No approved invoice is due inside this window.</p>}
          <button className="btn btn-primary" type="submit">Create schedule</button>
        </form>
      ) : null}
      <section className="split">
        <article className="card card-pad">
          <h2>Schedules</h2>
          {visibleSchedules.map((schedule) => (
            <p key={schedule.id}><a href={`#/payments/${schedule.id}`}>{schedule.number}</a> · {formatDate(schedule.from)} – {formatDate(schedule.to)} · <StatusBadge map={SCHEDULE_STATUS} status={schedule.status} /></p>
          ))}
        </article>
        <article className="card card-pad">
          <h2>Disbursements</h2>
          {visiblePayments.map((payment) => (
            <p key={payment.id}><a href={`#/payments/${payment.id}`}>{payment.number}</a> · {supplierById(state, payment.supplierId)?.name} · {money(disbursed(payment))} of {money(payment.approvedAmount)}</p>
          ))}
        </article>
      </section>
    </>
  )
}

export function PaymentRecord({ id }) {
  const { state } = useStore()
  const schedule = state.schedules.find((item) => item.id === id)
  if (schedule) return <ScheduleDetail schedule={schedule} />
  const payment = state.payments.find((item) => item.id === id)
  if (payment) return <PaymentDetail payment={payment} />
  return <Empty title="Payment record not found" />
}

function ScheduleDetail({ schedule }) {
  const { state, submitSchedule, decideSchedule } = useStore()
  const user = currentUser(state)
  const [comment, setComment] = useState('')
  const level = schedule.status === 'pending_approval' ? pendingLevel(schedule.approval?.levels) : null
  const canDecide = level && userMayDecide(state, user, level) && !alreadyActed(schedule.approval?.levels || [], user)
  const total = schedule.lines.reduce((sum, line) => sum + Number(line.amount), 0)
  return (
    <>
      <PageHead kicker="03 / Payments" title={schedule.number} lead={`${formatDate(schedule.from)} to ${formatDate(schedule.to)} · prepared by ${personName(state, schedule.createdBy)}`}>
        <StatusBadge map={SCHEDULE_STATUS} status={schedule.status} />
      </PageHead>
      <Notice>{PAYMENT_CONTROL}</Notice>
      <article className="card card-pad">
        <table className="table">
          <thead><tr><th>Invoice</th><th>Supplier</th><th>Due</th><th>Scheduled</th></tr></thead>
          <tbody>
            {schedule.lines.map((line) => {
              const invoice = state.invoices.find((item) => item.id === line.invoiceId)
              return (
                <tr key={line.invoiceId}>
                  <td data-label="Invoice"><a href={`#/invoices/${invoice?.id}`}>{invoice?.reference}</a></td>
                  <td data-label="Supplier">{supplierById(state, invoice?.supplierId)?.name}</td>
                  <td data-label="Due">{formatDate(invoice?.dueDate)}</td>
                  <td className="num" data-label="Scheduled">{money(line.amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="po-total">Schedule total <strong>{money(total)}</strong></p>
      </article>
      {schedule.status === 'draft' && ['finance', 'admin'].includes(user.role) ? (
        <button className="btn btn-primary" type="button" onClick={() => submitSchedule(schedule.id)}>Submit for authorisation</button>
      ) : null}
      {canDecide ? (
        <article className="card card-pad">
          <DecisionForm
            comment={comment}
            setComment={setComment}
            approveLabel="Authorise"
            note="This authorises the record. It does not execute a bank transfer."
            onApprove={() => decideSchedule(schedule.id, 'approve', comment)}
            onReject={() => decideSchedule(schedule.id, 'reject', comment)}
          />
        </article>
      ) : null}
      <article className="card card-pad">
        <h2>Payments on this schedule</h2>
        {state.payments.filter((payment) => payment.scheduleId === schedule.id).map((payment) => (
          <p key={payment.id}><a href={`#/payments/${payment.id}`}>{payment.number}</a> · {payment.status} · {money(disbursed(payment))}</p>
        ))}
      </article>
    </>
  )
}

function PaymentDetail({ payment }) {
  const { state, confirmPayment, notifySupplier } = useStore()
  const user = currentUser(state)
  const invoice = state.invoices.find((item) => item.id === payment.invoiceId)
  const supplier = supplierById(state, payment.supplierId)
  const remaining = Number(payment.approvedAmount) - disbursed(payment)
  const [form, setForm] = useState({ date: todayISO(), reference: '', amount: remaining > 0 ? remaining : '', receiptName: '' })
  const finance = ['finance', 'admin'].includes(user.role)
  const failed = [...payment.notifications].reverse().find((item) => item.status === 'failed')
  return (
    <>
      <PageHead kicker="03 / Payments" title={payment.number} lead={`${supplier?.name || 'Supplier'} · invoice ${invoice?.reference || ''}`}>
        <StatusBadge map={PAYMENT_STATUS} status={payment.status} />
      </PageHead>
      <Notice>{PAYMENT_CONTROL}</Notice>
      <article className="card card-pad">
        <dl className="meta">
          <div><dt>Authorised</dt><dd>{money(payment.approvedAmount)}</dd></div>
          <div><dt>Recorded</dt><dd>{money(disbursed(payment))}</dd></div>
          <div><dt>Remaining</dt><dd>{money(remaining)}</dd></div>
          <div><dt>Department</dt><dd>{payment.department}</dd></div>
        </dl>
        <h2>Confirmations</h2>
        {payment.disbursements.length ? (
          <table className="table">
            <thead><tr><th>Date</th><th>Reference</th><th>Receipt</th><th>By</th><th>Amount</th></tr></thead>
            <tbody>
              {payment.disbursements.map((item) => (
                <tr key={item.id}>
                  <td data-label="Date">{formatDate(item.date)}</td>
                  <td data-label="Reference">{item.reference}</td>
                  <td data-label="Receipt">{item.receiptName}</td>
                  <td data-label="By">{personName(state, item.recordedBy)}</td>
                  <td className="num" data-label="Amount">{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="hint">No bank confirmation has been recorded yet.</p>}
      </article>
      {finance && remaining > 0 ? (
        <form className="card card-pad stack" onSubmit={(event) => {
          event.preventDefault()
          confirmPayment({ id: payment.id, ...form, amount: Number(form.amount) })
        }}>
          <h2>Record payment confirmation</h2>
          <div className="form-grid">
            <Field label="Payment date"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></Field>
            <Field label="Bank reference"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} required /></Field>
            <Field label="Amount"><input type="number" min="1" max={remaining} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field>
            <Field label="Transaction receipt">
              <input type="file" onChange={(event) => setForm({ ...form, receiptName: event.target.files?.[0]?.name || '' })} />
            </Field>
          </div>
          {form.receiptName ? <p className="hint">Receipt on file: {form.receiptName}</p> : <p className="hint">Upload the receipt before saving. A full or partial amount is allowed.</p>}
          <button className="btn btn-primary" type="submit">Record confirmation</button>
        </form>
      ) : null}
      <article className="card card-pad stack">
        <div className="card-head">
          <h2>Supplier notification</h2>
          {finance && payment.disbursements.length ? (
            <button className="btn btn-teal" type="button" onClick={() => notifySupplier(payment.id)}>{failed ? 'Retry notice' : 'Notify supplier'}</button>
          ) : null}
        </div>
        <p className="hint">Notices go out only after a confirmation is on file. To {supplier?.email || 'no email'}.</p>
        {payment.notifications.length ? (
          <Timeline items={[...payment.notifications].reverse().map((item) => ({
            id: item.id,
            action: `Attempt ${item.attempt} · ${item.status}`,
            meta: `${item.to} · ${formatWhen(item.at)}`,
            comment: item.detail,
          }))} />
        ) : <p className="hint">No attempts yet.</p>}
      </article>
    </>
  )
}
