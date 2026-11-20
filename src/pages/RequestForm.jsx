import { useState } from 'react'
import { DEPARTMENTS, UNITS, URGENCIES } from '../domain/constants.js'
import { currentUser, requestById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { requestTotal } from '../domain/workflow.js'
import { money } from '../lib/format.js'
import { Empty, Field, FilesField, PageHead } from '../components/ui.jsx'

const emptyLine = (id) => ({ id, description: '', qty: 1, unit: 'pcs', unitCost: '' })

export function RequestForm({ id }) {
  const { state, saveRequest, submitRequest } = useStore()
  const user = currentUser(state)
  const existing = id ? requestById(state, id) : null
  const [title, setTitle] = useState(existing?.title || '')
  const [department, setDepartment] = useState(existing?.department || user.department)
  const [projectId, setProjectId] = useState(existing?.projectId || state.projects[0]?.id || '')
  const [urgency, setUrgency] = useState(existing?.urgency || 'normal')
  const [justification, setJustification] = useState(existing?.justification || '')
  const [items, setItems] = useState(existing?.items?.map((item) => ({ ...item, unitCost: item.unitCost })) || [emptyLine('line-1')])
  const [attachments, setAttachments] = useState(existing?.attachments || [])

  if (id && !existing) return <Empty title="Request not found" text="It may have been removed with a backup restore." />
  if (existing && !['draft', 'returned'].includes(existing.status)) {
    return <Empty title="This request can no longer be edited" action={<a className="btn btn-primary" href={`#/requests/${id}`}>Back to the request</a>} />
  }
  if (existing && user.role !== 'admin' && existing.requesterId !== user.id) {
    return <Empty title="This draft belongs to another requester" />
  }

  const preview = {
    items: items.map((item) => ({ ...item, qty: Number(item.qty) || 0, unitCost: Number(item.unitCost) || 0 })),
  }

  function payload() {
    return {
      id: existing?.id,
      title,
      department,
      projectId,
      urgency,
      justification,
      items: items.map((item) => ({ ...item, qty: Number(item.qty), unitCost: Number(item.unitCost) })),
      attachments,
    }
  }

  function save(andSubmit) {
    const body = payload()
    if (body.title.trim().length < 3 || body.justification.trim().length < 8 || !body.items.length) return
    saveRequest(body)
    if (andSubmit && existing) submitRequest(existing.id)
  }

  function updateItem(itemId, patch) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
  }

  return (
    <>
      <PageHead
        kicker="02 / Procurement"
        title={existing ? `Edit ${existing.number}` : 'New request'}
        lead={existing?.status === 'returned' ? 'Update the request from the comments, then resubmit. The approval chain starts again.' : 'Save a draft until the scope and estimate are ready to review.'}
      />
      <form className="card card-pad stack" onSubmit={(event) => { event.preventDefault(); save(false) }}>
        <div className="form-grid">
          <Field label="Title" className="span-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="Department">
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {state.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
            </select>
          </Field>
          <Field label="Urgency">
            <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
              {URGENCIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Justification" className="span-2">
            <textarea rows={3} value={justification} onChange={(event) => setJustification(event.target.value)} required />
          </Field>
        </div>
        <div className="card-head"><h2>Lines</h2><span className="num">{money(requestTotal(preview))}</span></div>
        {items.map((item) => (
          <div className="line-edit" key={item.id}>
            <input aria-label="Description" placeholder="Description" value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} />
            <input aria-label="Quantity" type="number" min="0" step="1" value={item.qty} onChange={(event) => updateItem(item.id, { qty: event.target.value })} />
            <select aria-label="Unit" value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })}>
              {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
            <input aria-label="Estimated unit cost" type="number" min="0" step="1" placeholder="Unit cost" value={item.unitCost} onChange={(event) => updateItem(item.id, { unitCost: event.target.value })} />
            <button className="btn btn-ghost btn-small" type="button" onClick={() => setItems((current) => current.filter((line) => line.id !== item.id))} disabled={items.length === 1}>Remove</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-small" type="button" onClick={() => setItems((current) => [...current, emptyLine(`line-${current.length + 1}-${Date.now()}`)])}>Add line</button>
        <FilesField label="Attachments" files={attachments} onChange={setAttachments} />
        <div className="btn-row">
          <button className="btn btn-ghost" type="submit">Save draft</button>
          {existing ? <button className="btn btn-primary" type="button" onClick={() => save(true)}>Save and submit</button> : null}
        </div>
      </form>
    </>
  )
}
