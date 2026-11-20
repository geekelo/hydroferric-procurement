import logo from '../assets/logo.png'
import { ROLE_TONE, roleLabel } from '../domain/constants.js'
import { deskOf, homeHash } from '../domain/desk.js'
import { useStore } from '../domain/store.jsx'
import { Badge } from '../components/ui.jsx'

const GROUPS = [
  ['approving', 'Approving'],
  ['department', 'Departments'],
  ['accounts', 'Accounts'],
  ['executive', 'Managing director'],
  ['admin', 'Administration'],
]

export function Login() {
  const { state, login } = useStore()
  const groups = GROUPS.map(([desk, label]) => ({
    desk,
    label,
    users: state.users.filter((user) => user.active && deskOf(user) === desk),
  })).filter((group) => group.users.length)

  return (
    <div className="login">
      <section className="login-hero">
        <img src={logo} alt="Hydroferric Nigeria Limited" />
        <p className="kicker light">Nigeria Limited</p>
        <h1>Requisition processing</h1>
        <p>Raise a request, send it for approval, and follow it through to a recorded payment. Sign in to the desk for your role.</p>
      </section>
      <section className="login-panel">
        <p className="kicker">Sign in</p>
        <h2>Choose your desk</h2>
        {groups.map((group) => (
          <div key={group.desk} className="login-group">
            <h3>{group.label}</h3>
            <div className="person-list">
              {group.users.map((user) => (
                <button key={user.id} type="button" className="person" onClick={() => {
                  login(user.id)
                  window.location.hash = homeHash(user)
                }}>
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.department}</small>
                  </span>
                  <Badge tone={ROLE_TONE[user.role]}>{roleLabel(user.role)}</Badge>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
