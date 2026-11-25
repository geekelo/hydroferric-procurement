import { useState } from 'react'
import { DEPARTMENTS, ROLES, roleLabel } from '../domain/constants.js'
import { currentUser, personName } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { paymentLevels, quotationLevels, requestLevels } from '../domain/workflow.js'
import { money } from '../lib/format.js'
import { downloadJson } from '../lib/export.js'
import { Badge, Empty, Field, Modal, PageHead } from '../components/ui.jsx'

export function Admin() {
  const { state } = useStore()
  const user = currentUser(state)
  const [tab, setTab] = useState('people')
  if (user.role !== 'admin') return <Empty title="Administration is limited to administrators" />
  return (
    <>
      <PageHead kicker="Administration" title="Users and roles" lead="Add an officer, choose their role, and place them in a department." />
      <div className="tabs">
        {[['people', 'People'], ['policy', 'Approval policy'], ['backup', 'Backup']].map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'people' ? <People /> : null}
      {tab === 'policy' ? <Policy /> : null}
      {tab === 'backup' ? <Backup /> : null}
    </>
  )
}

function People() {
  const { state, saveUser } = useStore()
  const [editing, setEditing] = useState(null)
  return (
    <>
      <div className="head-actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" type="button" onClick={() => setEditing({ name: '', email: '', role: 'requester', department: 'Projects', title: '', active: true })}>Add person</button>
      </div>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Delegate</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {state.users.map((person) => (
              <tr key={person.id}>
                <td data-label="Name"><strong>{person.name}</strong><span className="muted">{person.email}</span></td>
                <td data-label="Role"><Badge tone="purple">{roleLabel(person.role)}</Badge></td>
                <td data-label="Department">{person.department}</td>
                <td data-label="Delegate">{person.delegateActive ? personName(state, person.delegateId) : '—'}</td>
                <td data-label="Status">{person.active ? 'Active' : 'Inactive'}</td>
                <td><button className="btn btn-ghost btn-small" type="button" onClick={() => setEditing(person)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? <PersonModal person={editing} onClose={() => setEditing(null)} onSave={(payload) => { saveUser(payload); setEditing(null) }} /> : null}
    </>
  )
}

function PersonModal({ person, onClose, onSave }) {
  const { state } = useStore()
  const [form, setForm] = useState({ ...person, delegateId: person.delegateId || '', delegateActive: Boolean(person.delegateActive) })
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })
  return (
    <Modal title={person.id ? person.name : 'New person'} onClose={onClose}>
      <form className="stack" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, active: form.active !== false, delegateActive: Boolean(form.delegateActive) }) }}>
        {!person.id ? <Field label="Name"><input value={form.name} onChange={set('name')} required /></Field> : null}
        {!person.id ? <Field label="Email"><input type="email" value={form.email} onChange={set('email')} required /></Field> : null}
        <Field label="Title"><input value={form.title || ''} onChange={set('title')} /></Field>
        <Field label="Role">
          <select value={form.role} onChange={set('role')}>{ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select>
        </Field>
        <Field label="Department">
          <select value={form.department} onChange={set('department')}>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select>
        </Field>
        <Field label="Delegate">
          <select value={form.delegateId || ''} onChange={set('delegateId')}>
            <option value="">None</option>
            {state.users.filter((item) => item.id !== person.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <label className="check"><input type="checkbox" checked={Boolean(form.delegateActive)} onChange={set('delegateActive')} /> Delegation active</label>
        {person.id ? <label className="check"><input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label> : null}
        <button className="btn btn-primary" type="submit">Save</button>
      </form>
    </Modal>
  )
}

function Policy() {
  const { state, savePolicy } = useStore()
  const [policy, setPolicy] = useState(state.policy)
  const [sample, setSample] = useState(2400000)
  const set = (key) => (event) => setPolicy({ ...policy, [key]: event.target.value })
  const levels = requestLevels(Number(sample) || 0, { ...policy, singleLevelBelow: Number(policy.singleLevelBelow), bandStandard: Number(policy.bandStandard), bandElevated: Number(policy.bandElevated) })
  const quotes = quotationLevels(Number(sample) || 0, { ...policy, quotationManagementAbove: Number(policy.quotationManagementAbove), quotationApproverId: policy.quotationApproverId })
  const pays = paymentLevels(Number(sample) || 0, { ...policy, paymentManagementAbove: Number(policy.paymentManagementAbove) })
  return (
    <form className="card card-pad stack" onSubmit={(event) => { event.preventDefault(); savePolicy(policy) }}>
      <p className="hint">A request at or under the first ceiling can skip review. The next ceiling adds finance. Above that, management joins the chain. An officer who already approved an earlier level cannot approve the next one.</p>
      <div className="form-grid">
        <Field label="Single approver up to"><input type="number" min="0" value={policy.singleLevelBelow} onChange={set('singleLevelBelow')} /></Field>
        <Field label="Reviewer and approver up to"><input type="number" min="0" value={policy.bandStandard} onChange={set('bandStandard')} /></Field>
        <Field label="Finance joins up to"><input type="number" min="0" value={policy.bandElevated} onChange={set('bandElevated')} /></Field>
        <Field label="Quotation needs management above"><input type="number" min="0" value={policy.quotationManagementAbove} onChange={set('quotationManagementAbove')} /></Field>
        <Field label="Payment needs management above"><input type="number" min="0" value={policy.paymentManagementAbove} onChange={set('paymentManagementAbove')} /></Field>
        <Field label="Invoice variance allowed (NGN)"><input type="number" min="0" value={policy.varianceTolerance} onChange={set('varianceTolerance')} /></Field>
        <Field label="Designated quotation approver" className="span-2">
          <select value={policy.quotationApproverId} onChange={set('quotationApproverId')}>
            {state.users.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {roleLabel(item.role)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Preview an amount">
        <input type="number" min="0" value={sample} onChange={(event) => setSample(event.target.value)} />
      </Field>
      <p>{money(sample)} request: {levels.map(roleLabel).join(' → ')}</p>
      <p>Quotation: {quotes.map((level) => roleLabel(level.role)).join(' → ')}</p>
      <p>Payment schedule: {pays.map((level) => roleLabel(level.role)).join(' → ')}</p>
      <button className="btn btn-primary" type="submit">Save policy</button>
    </form>
  )
}

function Backup() {
  const { state, restore, resetDemo } = useStore()
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="card card-pad stack">
      <p>Download the workspace, or restore a file exported from this desk. Restoring replaces requests, payments and people.</p>
      <div className="btn-row">
        <button className="btn btn-primary" type="button" onClick={() => {
          const { flash, ...rest } = state
          void flash
          downloadJson(`hydroferric-backup-${new Date().toISOString().slice(0, 10)}.json`, rest)
        }}>Download backup</button>
        <label className="btn btn-ghost">
          Restore backup
          <input className="sr" type="file" accept="application/json" onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              try { restore(JSON.parse(String(reader.result))) } catch { restore(null) }
            }
            reader.readAsText(file)
          }} />
        </label>
        <button className="btn btn-danger" type="button" onClick={() => setConfirm(true)}>Restore demonstration data</button>
      </div>
      {confirm ? (
        <Modal title="Restore demonstration data" onClose={() => setConfirm(false)}>
          <p>This replaces the current workspace with the original Hydroferric records.</p>
          <div className="btn-row">
            <button className="btn btn-danger" type="button" onClick={() => { resetDemo(); setConfirm(false) }}>Restore</button>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirm(false)}>Keep current data</button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
