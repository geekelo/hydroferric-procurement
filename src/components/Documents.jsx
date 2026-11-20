import { useState } from 'react'
import { canFileOnProject, documentsForRequest, DOCUMENT_STEPS, missingSteps, projectDocumentSpaces } from '../domain/documents.js'
import { currentUser, personName, requestById } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { fileSize, formatWhen } from '../lib/format.js'

export function DocumentSpaces({ project }) {
  const { state, addProjectDocument } = useStore()
  const spaces = projectDocumentSpaces(state, project.id)
  const allowed = canFileOnProject(currentUser(state), project)
  const requests = state.requests.filter((request) => request.projectId === project.id)
  return (
    <section className="stack">
      <div className="card-head">
        <h2>Documents</h2>
      </div>
      <p className="hint">
        {allowed
          ? 'Each step needs a document before the next approval. Approvers can read these files. They cannot upload them.'
          : 'Approvers can read every document already filed. Only the HOD, accounts, the MD and the site admin can add one.'}
      </p>
      <div className="doc-grid">
        {spaces.map((space) => (
          <article key={space.id} className="card card-pad stack">
            <h3>{space.label}</h3>
            <p className="hint">Required before {space.before}.</p>
            <FileList state={state} files={space.files} />
            {allowed ? (
              <UploadForm
                requests={requests}
                onFile={(file, requestId) => addProjectDocument({
                  projectId: project.id,
                  category: space.id,
                  requestId,
                  name: file.name,
                  size: file.size,
                })}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export function StepDocuments({ request, through }) {
  const { state } = useStore()
  if (!request) return null
  const end = DOCUMENT_STEPS.findIndex((step) => step.id === through)
  const steps = DOCUMENT_STEPS.slice(0, end + 1)
  const files = documentsForRequest(state, request)
  const missing = missingSteps(state, request, through)
  return (
    <div className="stack">
      {missing.length ? <p className="hint">{missing.map((step) => step.label).join(', ')} must be on the project before this can be approved.</p> : null}
      {steps.map((step) => {
        const rows = files.filter((file) => file.category === step.id)
        return (
          <div key={step.id}>
            <strong>{step.label}</strong>
            <FileList state={state} files={rows} />
          </div>
        )
      })}
      <p className="hint"><a href={`#/projects/${request.projectId}`}>Open the project documents</a></p>
    </div>
  )
}

function FileList({ state, files }) {
  if (!files.length) return <p className="hint">Nothing filed yet.</p>
  return (
    <ul className="doc-list">
      {files.map((file) => {
        const request = requestById(state, file.requestId)
        return (
          <li key={file.id}>
            <strong>{file.name}</strong>
            <span>
              {file.source}
              {request ? ` · ${request.number}` : ''}
              {file.uploadedBy ? ` · ${personName(state, file.uploadedBy)}` : ''}
              {file.uploadedAt ? ` · ${formatWhen(file.uploadedAt)}` : ''}
              {file.size ? ` · ${fileSize(file.size)}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function UploadForm({ requests, onFile }) {
  const [requestId, setRequestId] = useState(requests[0]?.id || '')
  return (
    <form className="stack" onSubmit={(event) => event.preventDefault()}>
      {requests.length ? (
        <label className="field">
          <span>Request</span>
          <select value={requestId} onChange={(event) => setRequestId(event.target.value)} aria-label="Request">
            <option value="">Whole project</option>
            {requests.map((request) => <option key={request.id} value={request.id}>{request.number}</option>)}
          </select>
        </label>
      ) : null}
      <input
        type="file"
        aria-label="Upload document"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file, requestId)
          event.target.value = ''
        }}
      />
    </form>
  )
}
