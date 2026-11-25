import { useState } from 'react'
import { DEPARTMENTS } from '../domain/constants.js'
import { currentUser, personName, projectFigures, visibleProjects } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { RequestList } from '../components/Documents.jsx'
import { approvalBlock } from '../domain/documents.js'
import { Empty, Field, PageHead } from '../components/ui.jsx'

export function Projects() {
  const { state } = useStore()
  const user = currentUser(state)
  const projects = visibleProjects(state, user)
  return (
    <>
      <PageHead kicker={user.role === 'finance' ? 'Accounts' : user.department} title="Projects" lead="Each project lists the requisitions raised against it.">
        {user.role === 'admin' ? <a className="btn btn-ghost" href="#/projects/new">New project</a> : null}
      </PageHead>
      <div className="stack">
        {projects.map((project) => {
          const figures = projectFigures(state, project.id)
          const committed = figures.budget ? Math.min(100, (figures.committed / figures.budget) * 100) : 0
          const actual = figures.budget ? Math.min(100, (figures.actual / figures.budget) * 100) : 0
          return (
            <a key={project.id} className="card card-pad budget-row" href={`#/projects/${project.id}`}>
              <div>
                <strong>{project.code} · {project.name}</strong>
                <span>{personName(state, project.ownerId)} · {project.site} · {project.paymentHold ? 'Payment hold on' : 'No payment hold'}</span>
              </div>
              <div className="bar" aria-hidden="true"><b style={{ width: `${committed}%` }} /><i style={{ width: `${actual}%` }} /></div>
            </a>
          )
        })}
      </div>
    </>
  )
}

export function ProjectForm({ id }) {
  const { state, saveProject } = useStore()
  const user = currentUser(state)
  const existing = state.projects.find((project) => project.id === id)
  const [form, setForm] = useState(() => existing || {
    name: '', code: '', department: 'Projects', ownerId: user.id, budget: '', site: '', paymentHold: true, status: 'active', description: '', startDate: '', endDate: '', milestones: [{ name: '', dueDate: '', status: 'pending', verificationRequired: true }],
  })
  if (user.role !== 'admin') return <Empty title="Projects are maintained by an administrator" />
  if (id && !existing) return <Empty title="Project not found" />
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })
  return (
    <>
      <PageHead kicker="04 / Delivery" title={existing ? existing.name : 'New project'} />
      <form className="card card-pad stack" onSubmit={(event) => { event.preventDefault(); saveProject({ ...form, id: existing?.id, budget: Number(form.budget) }) }}>
        <div className="form-grid">
          <Field label="Name" className="span-2"><input value={form.name} onChange={set('name')} required /></Field>
          <Field label="Code"><input value={form.code} onChange={set('code')} required /></Field>
          <Field label="Approved cost"><input type="number" min="1" value={form.budget} onChange={set('budget')} required /></Field>
          <Field label="Department">
            <select value={form.department} onChange={set('department')}>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select>
          </Field>
          <Field label="Owner">
            <select value={form.ownerId} onChange={set('ownerId')}>{state.users.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </Field>
          <Field label="Site" className="span-2"><input value={form.site} onChange={set('site')} /></Field>
          <Field label="Description" className="span-2"><textarea rows={2} value={form.description} onChange={set('description')} /></Field>
          <label className="check span-2"><input type="checkbox" checked={Boolean(form.paymentHold)} onChange={set('paymentHold')} /> Hold payment until delivery or milestone verification is approved</label>
        </div>
        <h2>Milestones</h2>
        {form.milestones.map((milestone, index) => (
          <div className="line-edit" key={milestone.id || index}>
            <input aria-label="Milestone" placeholder="Milestone" value={milestone.name} onChange={(event) => {
              const milestones = form.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)
              setForm({ ...form, milestones })
            }} />
            <input aria-label="Due" type="date" value={milestone.dueDate} onChange={(event) => {
              const milestones = form.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: event.target.value } : item)
              setForm({ ...form, milestones })
            }} />
            <label className="check"><input type="checkbox" checked={Boolean(milestone.verificationRequired)} onChange={(event) => {
              const milestones = form.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, verificationRequired: event.target.checked } : item)
              setForm({ ...form, milestones })
            }} /> Verify</label>
          </div>
        ))}
        <button className="btn btn-ghost btn-small" type="button" onClick={() => setForm({ ...form, milestones: [...form.milestones, { name: '', dueDate: '', status: 'pending', verificationRequired: true }] })}>Add milestone</button>
        <button className="btn btn-primary" type="submit">Save project</button>
      </form>
    </>
  )
}

export function ProjectDetail({ id, verificationId, requestId = '' }) {
  const { state, saveVerification } = useStore()
  const user = currentUser(state)
  const project = state.projects.find((item) => item.id === id)
  if (!project) return <Empty title="Project not found" />
  const verifications = state.verifications.filter((item) => item.projectId === id)
  const namedVerification = verifications.find((item) => item.id === verificationId)
  const focus = namedVerification || verifications.find((item) => item.status === 'assigned')
  return (
    <>
      <PageHead kicker={project.department} title={project.name} lead={project.description}>
        {user.role === 'admin' ? <a className="btn btn-ghost" href={`#/projects/${project.id}/edit`}>Edit</a> : null}
      </PageHead>
      <RequestList key={requestId || namedVerification?.requestId || 'list'} project={project} openRequestId={requestId || namedVerification?.requestId || ''} />
      {focus?.status === 'assigned' ? <VerificationCard verification={focus} user={user} assignee={personName(state, focus.assigneeId)} saveVerification={saveVerification} /> : null}
    </>
  )
}

function VerificationCard({ verification, user, assignee, saveVerification }) {
  const { state } = useStore()
  const [checklist, setChecklist] = useState(verification.checklist)
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(verification.deliveryConfirmed)
  const [remarks, setRemarks] = useState(verification.remarks)
  const allowed = user.role === 'admin' || user.id === verification.assigneeId
  if (verification.status !== 'assigned') return null
  const payload = { id: verification.id, checklist, deliveryConfirmed, remarks, evidence: verification.evidence }
  const documentBlock = approvalBlock(state, state.requests.find((item) => item.id === verification.requestId), 'po_waybill')
  return (
    <article className="card card-pad stack">
      <h2>{verification.number} · delivery checklist</h2>
      {!allowed ? <p className="hint">Assigned to {assignee}. Sign in as that verifier to complete it.</p> : null}
      <div className="check-list">
        {checklist.map((item) => (
          <label key={item.id} className="check">
            <input type="checkbox" checked={item.done} disabled={!allowed} onChange={(event) => setChecklist(checklist.map((line) => line.id === item.id ? { ...line, done: event.target.checked } : line))} />
            {item.label}
          </label>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={deliveryConfirmed} disabled={!allowed} onChange={(event) => setDeliveryConfirmed(event.target.checked)} /> Delivery confirmed</label>
      <p className="hint">Photographs and the waybill are filed on the request by the HOD, accounts, the MD or the site admin. An approver cannot upload them.</p>
      <div className="chips">{(verification.evidence || []).map((file) => <span key={file.id} className="chip">{file.name}</span>)}</div>
      <Field label="Remarks"><textarea rows={3} value={remarks} disabled={!allowed} onChange={(event) => setRemarks(event.target.value)} /></Field>
      {documentBlock ? <p className="hint">{documentBlock}</p> : null}
      {allowed ? (
        <div className="btn-row">
          <button className="btn btn-ghost" type="button" onClick={() => saveVerification(payload)}>Save progress</button>
          <button className="btn btn-primary" type="button" onClick={() => saveVerification({ ...payload, decision: 'approve' })} disabled={Boolean(documentBlock)}>Approve verification</button>
          <button className="btn btn-danger" type="button" onClick={() => saveVerification({ ...payload, decision: 'reject' })}>Refuse delivery</button>
        </div>
      ) : null}
    </article>
  )
}
