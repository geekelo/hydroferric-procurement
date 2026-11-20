import { createSeed } from '../src/domain/seed.js'
import { reducer } from '../src/domain/reducer.js'
import { myTasks, requestStage } from '../src/domain/selectors.js'

function run(state, action) {
  const next = reducer(state, action)
  if (next.flash?.tone === 'bad') throw new Error(`${action.type}: ${next.flash.text}`)
  return next
}

let state = createSeed()
const tasksFor = (userId) => myTasks({ ...state, sessionUserId: userId }, state.users.find((user) => user.id === userId))

const ada = tasksFor('u-ada').map((task) => task.title)
const ibrahim = tasksFor('u-ibrahim').map((task) => task.title)
const funmi = tasksFor('u-funmi').map((task) => task.title)
const yusuf = tasksFor('u-yusuf').map((task) => task.title)
const chinedu = tasksFor('u-chinedu').map((task) => task.title)
const ngozi = tasksFor('u-ngozi').map((task) => task.title)
const tunde = tasksFor('u-tunde').map((task) => task.title)

if (!ada.some((title) => title.includes('PR-2026-0010'))) throw new Error(`Adaeze tasks missing return: ${ada.join(' | ')}`)
if (!ibrahim.some((title) => title.includes('PR-2026-0009'))) throw new Error(`Ibrahim tasks: ${ibrahim.join(' | ')}`)
if (!funmi.some((title) => title.includes('PR-2026-0008'))) throw new Error(`Funmi request: ${funmi.join(' | ')}`)
if (!funmi.some((title) => title.includes('PR-2026-0005'))) throw new Error(`Funmi quote: ${funmi.join(' | ')}`)
if (!yusuf.some((title) => title.includes('PR-2026-0008'))) throw new Error(`Yusuf delegate missing: ${yusuf.join(' | ')}`)
if (!chinedu.some((title) => title.includes('PR-2026-0007'))) throw new Error(`Chinedu source: ${chinedu.join(' | ')}`)
if (!ngozi.some((title) => title.includes('VER-'))) throw new Error(`Ngozi verify: ${ngozi.join(' | ')}`)
if (!tunde.some((title) => title.includes('NDE-1882'))) throw new Error(`Tunde schedule: ${tunde.join(' | ')}`)
if (!tunde.some((title) => title.includes('duplicate'))) throw new Error(`Tunde duplicate: ${tunde.join(' | ')}`)
if (!tunde.some((title) => title.includes('PAY-2026-0002') || title.includes('Retry'))) throw new Error(`Tunde pay/notify: ${tunde.join(' | ')}`)

state = run(state, { type: 'login', userId: 'u-ada' })
state = run(state, { type: 'submit-request', id: 'req-draft' })
if (state.requests.find((item) => item.id === 'req-draft').status !== 'in_approval') throw new Error('draft did not submit')

state = run(state, { type: 'login', userId: 'u-ibrahim' })
state = run(state, { type: 'decide-request', id: 'req-draft', decision: 'approve', comment: 'Fine.' })
state = run(state, { type: 'login', userId: 'u-funmi' })
state = run(state, { type: 'decide-request', id: 'req-draft', decision: 'approve', comment: 'Approved.' })
if (state.requests.find((item) => item.id === 'req-draft').status !== 'approved') throw new Error('request not approved')

state = run(state, { type: 'login', userId: 'u-chinedu' })
const blocked = reducer(state, {
  type: 'recommend-quotation',
  requestId: 'req-source',
  quotationId: 'missing',
  justification: 'Not enough quotes yet',
})
if (blocked.flash?.tone !== 'bad') throw new Error('single quote recommendation should fail')

state = run(state, {
  type: 'add-quotation',
  quotation: { requestId: 'req-draft', supplierId: 's-summit', reference: 'SUM-LAB-1', amount: 148000, deliveryTerms: 'Delivered Kaduna', leadDays: 7, validity: '2026-12-20', warranty: '6 months', attachmentName: 'sum-lab.pdf', priceNote: 'Lower', deliveryNote: '7 days', qualityNote: 'Standard glass', complianceNote: 'On file' },
})
state = run(state, {
  type: 'add-quotation',
  quotation: { requestId: 'req-draft', supplierId: 's-atlantic', reference: 'ATL-LAB-2', amount: 156000, deliveryTerms: 'Ex Lagos', leadDays: 14, validity: '2026-12-18', warranty: '3 months', attachmentName: 'atl-lab.pdf' },
})
const quote = state.quotations.find((item) => item.reference === 'SUM-LAB-1')
state = run(state, { type: 'recommend-quotation', requestId: 'req-draft', quotationId: quote.id, justification: 'Lower price and a shorter lead time for a simple lab item.' })
state = run(state, { type: 'login', userId: 'u-funmi' })
state = run(state, { type: 'decide-quotation', requestId: 'req-draft', decision: 'approve', comment: 'Approved.' })
const order = state.orders.find((item) => item.requestId === 'req-draft')
if (!order || state.requests.find((item) => item.id === 'req-draft').status !== 'po_issued') throw new Error('PO was not issued')

state = run(state, { type: 'login', userId: 'u-tunde' })
state = run(state, {
  type: 'save-invoice',
  invoice: { poId: order.id, reference: 'SUM-LAB-9', invoiceDate: '2026-11-19', dueDate: '2026-12-03', amount: 148000, description: 'Glassware', attachmentName: 'sum-lab-9.pdf' },
})
const invoice = state.invoices.find((item) => item.reference === 'SUM-LAB-9')
if (invoice.status !== 'submitted') throw new Error(`expected submitted, got ${invoice.status} ${invoice.matchNote}`)
state = run(state, { type: 'resolve-invoice', id: invoice.id, decision: 'accept', comment: '' })
const held = state.invoices.find((item) => item.id === invoice.id)
if (held.status !== 'held') throw new Error(`payment hold failed: ${held.status}`)
const verification = state.verifications.find((item) => item.invoiceId === invoice.id)
if (!verification) throw new Error('verification missing')

state = run(state, { type: 'login', userId: 'u-ngozi' })
state = run(state, {
  type: 'save-verification',
  id: verification.id,
  checklist: verification.checklist.map((item) => ({ ...item, done: true })),
  deliveryConfirmed: true,
  remarks: 'Ten sets counted into the laboratory store.',
  evidence: [{ id: 'ev-lab', name: 'lab-bench.jpg', note: 'Bench after unpacking' }],
  decision: 'approve',
})
if (state.invoices.find((item) => item.id === invoice.id).status !== 'approved') throw new Error('invoice not released')

state = run(state, { type: 'login', userId: 'u-tunde' })
state = run(state, { type: 'create-schedule', from: '2026-11-01', to: '2026-12-31', lines: [{ invoiceId: invoice.id, amount: 148000 }] })
const schedule = state.schedules.find((item) => item.lines.some((line) => line.invoiceId === invoice.id) && item.status === 'draft')
state = run(state, { type: 'submit-schedule', id: schedule.id })
state = run(state, { type: 'login', userId: 'u-funmi' })
state = run(state, { type: 'decide-schedule', id: schedule.id, decision: 'approve', comment: 'Authorised.' })
const payment = state.payments.find((item) => item.invoiceId === invoice.id)
if (!payment) throw new Error('payment missing')
state = run(state, { type: 'login', userId: 'u-tunde' })
state = run(state, { type: 'confirm-payment', id: payment.id, date: '2026-11-19', reference: 'HFN-TRF-30001', amount: 148000, receiptName: 'hfn-trf-30001.pdf' })
state = run(state, { type: 'notify-supplier', id: payment.id })
if (state.payments.find((item) => item.id === payment.id).notifications.at(-1).status !== 'sent') throw new Error('notice failed')
state = run(state, { type: 'login', userId: 'u-chinedu' })
state = run(state, { type: 'close-request', id: 'req-draft' })
if (state.requests.find((item) => item.id === 'req-draft').status !== 'closed') throw new Error('not closed')
if (requestStage(state, state.requests.find((item) => item.id === 'req-draft')) !== 'close') throw new Error('stage')

const dup = reducer(state, { type: 'login', userId: 'u-tunde' })
const again = reducer(dup, { type: 'save-invoice', invoice: { poId: 'po-pay', reference: 'NDE-1882', invoiceDate: '2026-11-19', dueDate: '2026-12-01', amount: 1000, description: 'copy', attachmentName: 'copy.pdf' } })
if (again.invoices.find((item) => item.attachmentName === 'copy.pdf')?.status !== 'duplicate') throw new Error('duplicate not flagged')

const denied = reducer(state, { type: 'login', userId: 'u-ada' })
const nope = reducer(denied, { type: 'decide-request', id: 'req-review', decision: 'approve', comment: '' })
if (nope.flash?.tone !== 'bad') throw new Error('requester should not approve')

console.log('flow ok', order.number, payment.number)
