import { useState } from 'react'
import { currentUser, personName } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { formatWhen } from '../lib/format.js'
import { downloadCsv, downloadExcel } from '../lib/export.js'
import { Empty, PageHead } from '../components/ui.jsx'

export function Audit() {
  const { state } = useStore()
  const user = currentUser(state)
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  if (!['admin', 'management', 'finance'].includes(user.role)) {
    return <Empty title="The audit trail is open to finance, management and administrators" />
  }
  const needle = query.trim().toLowerCase()
  const rows = state.audit
    .filter((entry) => !type || entry.entityType === type)
    .filter((entry) => !needle || `${entry.action} ${entry.detail}`.toLowerCase().includes(needle))
  const data = rows.map((entry) => ({
    When: formatWhen(entry.at),
    Officer: personName(state, entry.actorId),
    Action: entry.action,
    Record: entry.entityType,
    Detail: entry.detail,
  }))
  return (
    <>
      <PageHead kicker="05 / Oversight" title="Audit trail" lead="Decisions, revisions, payment confirmations and supplier notices are kept with the officer and the time.">
        <button className="btn btn-ghost btn-small" type="button" onClick={() => downloadCsv('hydroferric-audit.csv', data)}>CSV</button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => downloadExcel('hydroferric-audit.xls', data)}>Excel</button>
      </PageHead>
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the trail" aria-label="Search audit" />
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Record type">
          <option value="">All records</option>
          {['request', 'quotation', 'order', 'invoice', 'payment', 'verification', 'schedule', 'supplier', 'project', 'user', 'policy'].map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>When</th><th>Officer</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td>{formatWhen(entry.at)}</td>
                <td>{personName(state, entry.actorId)}</td>
                <td>{entry.action}<span className="muted">{entry.entityType}</span></td>
                <td>{entry.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
