import { useEffect, useRef, useState } from 'react'
import { canResolveRequestComments, menuComments } from '../domain/documents.js'
import { currentUser, personName } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { ResolveNoteForm } from '../components/Documents.jsx'
import { Icon } from '../components/Icons.jsx'
import { PageHead } from '../components/ui.jsx'
import { formatWhen, monthKey, monthLabel } from '../lib/format.js'
import { AVATAR_TONES, initials } from '../lib/people.js'

const whenResolved = (comment) => comment.resolvedAt || comment.at

export function Comments() {
  const store = useStore()
  const { state } = store
  const user = currentUser(state)
  const rows = menuComments(state, user)
  const open = rows.filter((comment) => !comment.resolved)
  const resolved = rows.filter((comment) => comment.resolved && !comment.archived)
  const archived = rows.filter((comment) => comment.resolved && comment.archived)
  const [tab, setTab] = useState('new')

  const manageable = resolved.filter((comment) => canResolveRequestComments(user, comment.request))
  const months = [...manageable.reduce((map, comment) => {
    const key = monthKey(whenResolved(comment))
    return map.set(key, (map.get(key) || 0) + 1)
  }, new Map())].sort((a, b) => b[0].localeCompare(a[0]))

  const tabs = [
    { id: 'new', label: 'New comments', short: 'New', icon: 'comment', count: open.length },
    { id: 'resolved', label: 'Resolved', icon: 'check', count: resolved.length },
    { id: 'archive', label: 'Archive', icon: 'archive', count: archived.length },
  ]

  return (
    <div className="cm-page">
      <PageHead
        kicker="Comments"
        title="Comments"
        lead="New comments are the ones still unresolved. A resolved comment stays on this list until the HOD hides or archives it."
      />

      <div className="cm-tabs" role="tablist" aria-label="Comment lists">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`cm-tab-${item.id}`}
            className={`cm-tab ${tab === item.id ? 'on' : ''} ${item.id === 'new' && item.count ? 'alert' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="cm-panel"
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={18} />
            <span className="cm-tab-long">{item.label}</span>
            <span className="cm-tab-short">{item.short || item.label}</span>
            ({item.count})
          </button>
        ))}
      </div>

      <section className="cm-panel" id="cm-panel" role="tabpanel" aria-labelledby={`cm-tab-${tab}`}>
        {tab === 'new' ? (
          open.length ? open.map((comment) => (
            <CommentItem key={comment.id} state={state} user={user} store={store} comment={comment} mode="new" />
          )) : (
            <Empty icon="check" title="No unresolved comments" text="New comments on uploaded documents appear here." />
          )
        ) : null}

        {tab === 'resolved' ? (
          <>
            <header className="cm-panel-head">
              <h2><span className="cm-head-ico"><Icon name="check" size={16} /></span> Resolved ({resolved.length})</h2>
              {months.length ? (
                <div className="cm-archive-tool">
                  <Menu
                    trigger={<><Icon name="archive" size={16} /> Archive <Icon name="chevron" size={14} /></>}
                    triggerClass="cm-menu-btn"
                    label="Archive resolved comments by month"
                  >
                    <p className="cm-menu-title">Archive a month</p>
                    {months.map(([key, count]) => (
                      <button key={key} className="cm-menu-item" type="button" role="menuitem" onClick={() => store.archiveCommentMonth(key)}>
                        <Icon name="calendar" size={16} />
                        <span>{monthLabel(key)}</span>
                        <small>{count} {count === 1 ? 'comment' : 'comments'}</small>
                      </button>
                    ))}
                  </Menu>
                  <small><Icon name="calendar" size={13} /> Archive to {monthLabel(months[0][0], true)}</small>
                </div>
              ) : null}
            </header>
            {resolved.length
              ? resolved.map((comment) => <CommentItem key={comment.id} state={state} user={user} store={store} comment={comment} mode="resolved" />)
              : <p className="hint">Resolved comments stay here until they are hidden or archived.</p>}
          </>
        ) : null}

        {tab === 'archive' ? <ArchiveList state={state} user={user} store={store} rows={archived} /> : null}
      </section>
    </div>
  )
}

function ArchiveList({ state, user, store, rows }) {
  if (!rows.length) {
    return <Empty icon="archive" title="Nothing archived yet" text="Archive resolved comments to keep them here, grouped by year and month." />
  }
  const years = new Map()
  for (const comment of rows) {
    const key = monthKey(whenResolved(comment))
    const year = key.slice(0, 4)
    if (!years.has(year)) years.set(year, new Map())
    const months = years.get(year)
    months.set(key, [...(months.get(key) || []), comment])
  }
  return [...years.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, months]) => (
    <section key={year} className="cm-year">
      <h2 className="cm-year-title">{year}</h2>
      {[...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, list]) => (
        <div key={key} className="cm-month">
          <h3><Icon name="calendar" size={16} /> {monthLabel(key)} <small>{list.length} {list.length === 1 ? 'comment' : 'comments'}</small></h3>
          {list.map((comment) => <CommentItem key={comment.id} state={state} user={user} store={store} comment={comment} mode="archived" />)}
        </div>
      ))}
    </section>
  ))
}

function CommentItem({ state, user, store, comment, mode }) {
  const [resolving, setResolving] = useState(false)
  const name = personName(state, comment.authorId)
  const tone = AVATAR_TONES[name.length % AVATAR_TONES.length]
  const canManage = canResolveRequestComments(user, comment.request)
  const month = monthLabel(monthKey(whenResolved(comment)), true)
  return (
    <article className={`cm-item ${mode}`}>
      <div className="cm-doc">
        <Icon name="file" size={16} />
        <a href={`#/projects/${comment.projectId}?request=${comment.request.id}`}>{comment.request.number}</a>
        <span className="cm-dot" aria-hidden="true">•</span>
        <span className="cm-doc-name">{comment.documentName}</span>
        {comment.description ? (
          <>
            <span className="cm-dot cm-dot-desc" aria-hidden="true">•</span>
            <span className="cm-doc-desc">{comment.description}</span>
          </>
        ) : null}
        <a className="cm-ext" href={`#/requests/${comment.request.id}`} aria-label={`Open ${comment.request.number}`}>
          <Icon name="external" size={16} />
        </a>
      </div>

      <div className="cm-row">
        <span className={`avatar tone-${tone}`} aria-hidden="true">{initials(name)}</span>
        <div className="cm-main">
          <div className="cm-meta">
            <strong>{name}</strong>
            <time>{formatWhen(comment.at)}</time>
            {mode === 'new' ? <span className="cm-tag new">New</span> : null}
          </div>
          <p>{comment.text}</p>
          {mode !== 'new' ? (
            <span className="cm-state done">
              <Icon name="check" size={14} />
              <span>
                Resolved{comment.resolvedBy ? ` by ${personName(state, comment.resolvedBy)}` : ''}
                {comment.resolutionNote ? ` · ${comment.resolutionNote}` : ''}
              </span>
            </span>
          ) : null}
        </div>

        <div className="cm-actions">
          {mode === 'new' ? (
            canManage ? (
              <button className="btn btn-primary cm-resolve-btn" type="button" aria-expanded={resolving} onClick={() => setResolving((value) => !value)}>
                <Icon name="check" size={16} /> Resolve
              </button>
            ) : <span className="cm-state open">Waiting for the HOD</span>
          ) : null}

          {mode === 'resolved' && canManage ? (
            <Menu
              trigger={<Icon name="eyeoff" size={18} />}
              triggerClass="cm-icon-btn"
              label="Hide or archive this comment"
            >
              <button className="cm-menu-item" type="button" role="menuitem" onClick={() => store.archiveDocumentComment(comment.projectId, comment.documentId, comment.id, true)}>
                <Icon name="archive" size={16} />
                <span>Archive to {month}</span>
              </button>
              <button className="cm-menu-item danger" type="button" role="menuitem" onClick={() => store.hideDocumentComment(comment.projectId, comment.documentId, comment.id)}>
                <Icon name="eyeoff" size={16} />
                <span>Hide completely</span>
              </button>
              <p className="cm-menu-note">Hidden comments leave every list. They stay in the record.</p>
            </Menu>
          ) : null}

          {mode === 'archived' && canManage ? (
            <button className="btn btn-small btn-ghost" type="button" onClick={() => store.archiveDocumentComment(comment.projectId, comment.documentId, comment.id, false)}>
              <Icon name="restore" size={16} /> Restore
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'new' && resolving ? (
        <ResolveNoteForm
          onCancel={() => setResolving(false)}
          onResolve={(note) => store.resolveDocumentComment(comment.projectId, comment.documentId, comment.id, note)}
        />
      ) : null}
    </article>
  )
}

function Menu({ trigger, triggerClass, label, children }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  return (
    <div className="cm-menu" ref={box}>
      <button className={triggerClass} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((value) => !value)}>
        {trigger}
      </button>
      {open ? <div className="cm-menu-pop" role="menu" onClick={() => setOpen(false)}>{children}</div> : null}
    </div>
  )
}

function Empty({ icon, title, text }) {
  return (
    <div className="cm-empty">
      <span className="cm-empty-ico"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}
