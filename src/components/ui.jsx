import { useEffect } from 'react'
import { statusMeta } from '../domain/constants.js'

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

export function StatusBadge({ map, status }) {
  const meta = statusMeta(map, status)
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export function PageHead({ kicker, title, lead, children }) {
  return (
    <header className="page-head">
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {children ? <div className="head-actions">{children}</div> : null}
    </header>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <small className="hint">{hint}</small> : null}
    </label>
  )
}

export function Modal({ title, onClose, children, wide = false, className = '', head = null }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          {head || <h2>{title}</h2>}
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action || null}
    </div>
  )
}

export function Notice({ children, tone = 'teal' }) {
  return <div className={`notice tone-${tone}`}>{children}</div>
}

export function Timeline({ items }) {
  if (!items?.length) return <p className="hint">No history yet.</p>
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id}>
          <div>
            <strong>{item.action}</strong>
            <span>{item.meta}</span>
          </div>
          {item.comment ? <p>{item.comment}</p> : null}
        </li>
      ))}
    </ol>
  )
}

export function Chain({ links }) {
  const visible = links.filter(Boolean)
  if (!visible.length) return null
  return (
    <ol className="chain">
      {visible.map((link) => (
        <li key={link.href}>
          <a href={link.href}>{link.label}</a>
        </li>
      ))}
    </ol>
  )
}

export function DecisionForm({
  comment,
  setComment,
  onApprove,
  onReturn,
  onReject,
  approveLabel = 'Approve',
  note,
  approveDisabled = false,
}) {
  return (
    <div className="stack">
      {note ? <p className="hint">{note}</p> : null}
      <Field label="Comment">
        <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Stored with your name and the time." />
      </Field>
      <div className="btn-row">
        <button className="btn btn-primary" type="button" onClick={onApprove} disabled={approveDisabled}>{approveLabel}</button>
        {onReturn ? <button className="btn btn-ghost" type="button" onClick={onReturn}>Return</button> : null}
        {onReject ? <button className="btn btn-danger" type="button" onClick={onReject}>Reject</button> : null}
      </div>
    </div>
  )
}

export function FilesField({ label, files, onChange }) {
  return (
    <div className="field">
      <span>{label}</span>
      <input
        type="file"
        multiple
        onChange={(event) => {
          const picked = [...event.target.files].map((file) => ({
            id: `${file.name}-${file.size}-${file.lastModified}`,
            name: file.name,
            size: file.size,
            type: file.type,
          }))
          onChange([...(files || []), ...picked])
          event.target.value = ''
        }}
      />
      <div className="chips">
        {(files || []).map((file) => (
          <button
            key={file.id}
            type="button"
            className="chip"
            onClick={() => onChange(files.filter((item) => item.id !== file.id))}
          >
            {file.name} ×
          </button>
        ))}
      </div>
    </div>
  )
}
