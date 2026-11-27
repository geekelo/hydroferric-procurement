import { useState } from 'react'
import { PAYMENT_TERMS } from '../domain/filters.js'
import { currentUser } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { disbursed, invoiceOutstanding } from '../domain/workflow.js'
import { money } from '../lib/format.js'
import { Badge, Empty, Field, Modal, PageHead } from '../components/ui.jsx'

const EMPTY = { name: '', category: 'General', contactName: '', email: '', phone: '', address: '', taxId: '', status: 'active', paymentTerms: '', paymentDays: '', documentName: '' }

export function Suppliers() {
  const { state } = useStore()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const rows = state.suppliers.filter((supplier) => !needle || `${supplier.name} ${supplier.category}`.toLowerCase().includes(needle))
  return (
    <>
      <PageHead kicker="02 / Procurement" title="Suppliers" lead="Profiles, quotation history, invoices and the email used for payment notices.">
        <a className="btn btn-ghost" href="#/suppliers/new">Add supplier</a>
      </PageHead>
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers" aria-label="Search suppliers" />
      </div>
      <div className="cards">
        {rows.map((supplier) => {
          const paid = state.payments.filter((payment) => payment.supplierId === supplier.id).reduce((sum, payment) => sum + disbursed(payment), 0)
          const open = state.invoices.filter((invoice) => invoice.supplierId === supplier.id && !['rejected', 'duplicate'].includes(invoice.status)).reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0)
          return (
            <a key={supplier.id} className="card card-pad supplier-card" href={`#/suppliers/${supplier.id}`}>
              <Badge tone={supplier.status === 'active' ? 'good' : 'neutral'}>{supplier.status}</Badge>
              <strong>{supplier.name}</strong>
              <span>{supplier.category}</span>
              <span>{supplier.email || 'No email — notices will fail'}</span>
              <em>Paid {money(paid)} · open {money(open)}</em>
            </a>
          )
        })}
      </div>
    </>
  )
}

export function SupplierForm({ id }) {
  const { state, saveSupplier } = useStore()
  const existing = state.suppliers.find((supplier) => supplier.id === id)
  const [form, setForm] = useState(existing ? { ...existing, documentName: '' } : EMPTY)
  if (id && !existing) return <Empty title="Supplier not found" />
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  return (
    <>
      <PageHead kicker="02 / Procurement" title={existing ? existing.name : 'New supplier'} />
      <form className="card card-pad stack" onSubmit={(event) => { event.preventDefault(); saveSupplier(form) }}>
        <div className="form-grid">
          <Field label="Name" className="span-2"><input value={form.name} onChange={set('name')} required /></Field>
          <Field label="Category"><input value={form.category} onChange={set('category')} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Payment terms">
            <select value={form.paymentTerms || ''} onChange={set('paymentTerms')}>
              <option value="">Not agreed</option>
              {PAYMENT_TERMS.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
            </select>
          </Field>
          {form.paymentTerms === 'days' ? (
            <Field label="Number of days" hint="Counted from the invoice date">
              <input type="number" min="1" value={form.paymentDays || ''} onChange={set('paymentDays')} />
            </Field>
          ) : null}
          <Field label="Contact"><input value={form.contactName} onChange={set('contactName')} /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="Needed for payment notices" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Tax ID"><input value={form.taxId} onChange={set('taxId')} /></Field>
          <Field label="Address" className="span-2"><input value={form.address} onChange={set('address')} /></Field>
          <Field label="Add a document on file" className="span-2"><input value={form.documentName} onChange={set('documentName')} placeholder="Certificate name" /></Field>
        </div>
        <button className="btn btn-primary" type="submit">Save supplier</button>
      </form>
    </>
  )
}

export function SupplierDetail({ id }) {
  const { state } = useStore()
  const user = currentUser(state)
  const supplier = state.suppliers.find((item) => item.id === id)
  const [open, setOpen] = useState(false)
  if (!supplier) return <Empty title="Supplier not found" />
  const quotes = state.quotations.filter((quote) => quote.supplierId === id)
  const invoices = state.invoices.filter((invoice) => invoice.supplierId === id)
  const payments = state.payments.filter((payment) => payment.supplierId === id)
  return (
    <>
      <PageHead kicker="02 / Procurement" title={supplier.name} lead={`${supplier.category} · ${supplier.contactName || 'No contact'} · ${supplier.email || 'No email on file'}`}>
        {['procurement', 'finance', 'admin'].includes(user.role) ? <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>Edit</button> : null}
      </PageHead>
      <article className="card card-pad">
        <dl className="meta">
          <div><dt>Phone</dt><dd>{supplier.phone || '—'}</dd></div>
          <div><dt>Address</dt><dd>{supplier.address || '—'}</dd></div>
          <div><dt>Tax ID</dt><dd>{supplier.taxId || '—'}</dd></div>
          <div><dt>Status</dt><dd>{supplier.status}</dd></div>
        </dl>
        <div className="chips">{supplier.documents.map((doc) => <span key={doc.id} className="chip">{doc.name}</span>)}</div>
      </article>
      <div className="split">
        <article className="card card-pad">
          <h2>Quotations</h2>
          {quotes.length ? quotes.map((quote) => <p key={quote.id}><a href={`#/requests/${quote.requestId}`}>{quote.number}</a> · {money(quote.amount)} · {quote.status}</p>) : <p className="hint">No quotations.</p>}
        </article>
        <article className="card card-pad">
          <h2>Invoices and payments</h2>
          {invoices.map((invoice) => <p key={invoice.id}><a href={`#/invoices/${invoice.id}`}>{invoice.reference}</a> · {invoice.status} · {money(invoiceOutstanding(invoice))} open</p>)}
          {payments.map((payment) => <p key={payment.id}><a href={`#/payments/${payment.id}`}>{payment.number}</a> · {money(disbursed(payment))} recorded</p>)}
          {!invoices.length && !payments.length ? <p className="hint">No invoices yet.</p> : null}
        </article>
      </div>
      {open ? <EditSupplier supplier={supplier} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function EditSupplier({ supplier, onClose }) {
  return (
    <Modal title="Edit supplier" onClose={onClose} wide>
      <SupplierFields supplier={supplier} onDone={onClose} />
    </Modal>
  )
}

function SupplierFields({ supplier, onDone }) {
  const { saveSupplier } = useStore()
  const [form, setForm] = useState({ ...supplier, documentName: '' })
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  return (
    <form className="stack" onSubmit={(event) => { event.preventDefault(); saveSupplier(form); onDone() }}>
      <Field label="Email"><input value={form.email} onChange={set('email')} /></Field>
      <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
      <Field label="Address"><input value={form.address} onChange={set('address')} /></Field>
      <Field label="Add document"><input value={form.documentName} onChange={set('documentName')} /></Field>
      <button className="btn btn-primary" type="submit">Save</button>
    </form>
  )
}
