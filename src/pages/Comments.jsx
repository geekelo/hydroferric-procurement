import { menuComments } from '../domain/documents.js'
import { currentUser } from '../domain/selectors.js'
import { useStore } from '../domain/store.jsx'
import { CommentEntry } from '../components/Documents.jsx'
import { Empty, PageHead } from '../components/ui.jsx'

export function Comments() {
  const { state } = useStore()
  const user = currentUser(state)
  const rows = menuComments(state, user)
  const open = rows.filter((comment) => !comment.resolved)
  const resolved = rows.filter((comment) => comment.resolved)
  return (
    <>
      <PageHead
        kicker="Comments"
        title="Comments"
        lead="New comments are the ones still unresolved. A resolved comment stays on this list until the HOD hides it."
      />
      <section className="card stack">
        <h2>New comments</h2>
        {open.length ? open.map((comment) => <CommentRow key={comment.id} state={state} comment={comment} />) : <Empty title="No unresolved comments" text="New comments on uploaded documents appear here." />}
      </section>
      <section className="card stack">
        <h2>Resolved</h2>
        {resolved.length ? resolved.map((comment) => <CommentRow key={comment.id} state={state} comment={comment} />) : <p className="hint">Resolved comments stay here until they are hidden.</p>}
      </section>
    </>
  )
}

function CommentRow({ state, comment }) {
  return (
    <article className="stack">
      <p>
        <a href={`#/projects/${comment.projectId}?request=${comment.request.id}`}>{comment.request.number}</a>
        {' · '}
        {comment.documentName}
        {comment.description ? ` · ${comment.description}` : ''}
      </p>
      <CommentEntry
        state={state}
        request={comment.request}
        projectId={comment.projectId}
        documentId={comment.documentId}
        comment={comment}
      />
    </article>
  )
}
