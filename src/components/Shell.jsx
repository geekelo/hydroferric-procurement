import { useEffect, useState } from 'react'
import logo from '../assets/logo.png'
import { ROLE_TONE, roleLabel } from '../domain/constants.js'
import { deskOf, homeHash, navFor } from '../domain/desk.js'
import { currentUser, pendingItems } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { Icon } from './Icons.jsx'
import { Badge, Modal, Field } from './ui.jsx'

export function Shell({ hash, children }) {
  const { state, logout, saveUser } = useStore()
  const user = currentUser(state)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [delegateOpen, setDelegateOpen] = useState(false)
  const [seenHash, setSeenHash] = useState(hash)
  if (hash !== seenHash) {
    setSeenHash(hash)
    setOpen(false)
    setMenu(false)
  }
  const pending = user ? pendingItems(state, user).length : 0
  const unread = state.notifications.filter((item) => item.userId === user?.id && !item.read).length
  const path = hash.split('?')[0]
  const home = homeHash(user)
  const canDelegate = deskOf(user) === 'approving'

  useEffect(() => {
    if (state.flash?.focus && window.location.hash !== state.flash.focus) {
      window.location.hash = state.flash.focus
    }
  }, [state.flash])

  return (
    <div className="app">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <a className="brand" href={home}>
          <img src={logo} alt="" />
          <span className="brand-copy">
            <strong>Hydroferric</strong>
            <span>Requisitions</span>
          </span>
        </a>
        <nav>
          {navFor(user).map((item) => {
            const active = path === item.href || (item.href !== home && path.startsWith(`${item.href}/`))
            const count = item.badge === 'pending' ? pending : item.badge === 'notes' ? unread : 0
            return (
              <a key={item.href} className={`nav-link ${active ? 'active' : ''}`} href={item.href}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {count > 0 ? <em className="nav-badge">{count}</em> : null}
              </a>
            )
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" type="button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((value) => !value)}>
            <Icon name="menu" />
          </button>
          <button className="user-btn" type="button" onClick={() => setMenu((value) => !value)}>
            <span>{user.name}</span>
            <Badge tone={ROLE_TONE[user.role]}>{roleLabel(user.role)}</Badge>
          </button>
          {menu ? (
            <div className="menu">
              <p className="hint">{user.title} · {user.department}</p>
              {canDelegate ? <button type="button" className="menu-item" onClick={() => { setDelegateOpen(true); setMenu(false) }}>Delegation</button> : null}
              <button type="button" className="menu-item" onClick={logout}>Sign out</button>
            </div>
          ) : null}
        </header>
        <div className="page">{children}</div>
      </div>
      {state.flash ? <div className={`toast tone-${state.flash.tone === 'bad' ? 'bad' : 'good'}`} role="status">{state.flash.text}</div> : null}
      {delegateOpen ? (
        <DelegateModal
          user={user}
          users={state.users}
          onClose={() => setDelegateOpen(false)}
          onSave={(payload) => {
            saveUser(payload)
            setDelegateOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function DelegateModal({ user, users, onClose, onSave }) {
  const [delegateId, setDelegateId] = useState(user.delegateId || '')
  const [active, setActive] = useState(Boolean(user.delegateActive))
  return (
    <Modal title="Delegation" onClose={onClose}>
      <p className="hint">While this is on, your delegate can decide the steps that are waiting for you. Their name is stored on the record.</p>
      <Field label="Delegate">
        <select value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
          <option value="">No delegate</option>
          {users.filter((item) => item.id !== user.id && item.active).map((item) => (
            <option key={item.id} value={item.id}>{item.name} · {roleLabel(item.role)}</option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Delegation is active
      </label>
      <div className="btn-row">
        <button className="btn btn-primary" type="button" onClick={() => onSave({ id: user.id, delegateId, delegateActive: active })}>Save delegation</button>
      </div>
    </Modal>
  )
}
