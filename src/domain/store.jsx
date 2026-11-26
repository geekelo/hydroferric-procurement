import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { createSeed } from './seed.js'
import { reducer } from './reducer.js'

const KEY = 'hydroferric.procurement.v1'
const StoreContext = createContext(null)

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.version === 1 && Array.isArray(parsed.users) && Array.isArray(parsed.requests) && parsed.policy) {
        return { ...parsed, flash: null }
      }
    }
  } catch {
    /* A damaged local record falls back to the demonstration workspace. */
  }
  return { ...createSeed(), flash: null }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)

  useEffect(() => {
    const { flash, ...rest } = state
    void flash
    try {
      localStorage.setItem(KEY, JSON.stringify(rest))
    } catch {
      /* The workspace still runs if the browser refuses the write. */
    }
  }, [state])

  useEffect(() => {
    if (!state.flash) return undefined
    const timer = window.setTimeout(() => dispatch({ type: 'clear-flash' }), 5200)
    return () => window.clearTimeout(timer)
  }, [state.flash])

  const api = useMemo(
    () => ({
      login: (userId) => dispatch({ type: 'login', userId }),
      logout: () => dispatch({ type: 'logout' }),
      readNotifications: () => dispatch({ type: 'read-notifications' }),
      readNotification: (id) => dispatch({ type: 'read-notification', id }),
      saveRequest: (request) => dispatch({ type: 'save-request', request }),
      submitRequest: (id) => dispatch({ type: 'submit-request', id }),
      decideRequest: (id, decision, comment) => dispatch({ type: 'decide-request', id, decision, comment }),
      comment: (id, comment) => dispatch({ type: 'comment', id, comment }),
      addQuotation: (quotation) => dispatch({ type: 'add-quotation', quotation }),
      recommendQuotation: (requestId, quotationId, justification) =>
        dispatch({ type: 'recommend-quotation', requestId, quotationId, justification }),
      decideQuotation: (requestId, decision, comment) => dispatch({ type: 'decide-quotation', requestId, decision, comment }),
      revisePo: (payload) => dispatch({ type: 'revise-po', ...payload }),
      decideIncrease: (id, decision, comment) => dispatch({ type: 'decide-increase', id, decision, comment }),
      cancelPo: (id, reason) => dispatch({ type: 'cancel-po', id, reason }),
      saveSupplier: (supplier) => dispatch({ type: 'save-supplier', supplier }),
      saveInvoice: (invoice) => dispatch({ type: 'save-invoice', invoice }),
      resolveInvoice: (id, decision, comment) => dispatch({ type: 'resolve-invoice', id, decision, comment }),
      saveVerification: (payload) => dispatch({ type: 'save-verification', ...payload }),
      createSchedule: (payload) => dispatch({ type: 'create-schedule', ...payload }),
      updateSchedule: (id, lines) => dispatch({ type: 'update-schedule', id, lines }),
      submitSchedule: (id) => dispatch({ type: 'submit-schedule', id }),
      decideSchedule: (id, decision, comment) => dispatch({ type: 'decide-schedule', id, decision, comment }),
      confirmPayment: (payload) => dispatch({ type: 'confirm-payment', ...payload }),
      notifySupplier: (id) => dispatch({ type: 'notify-supplier', id }),
      closeRequest: (id) => dispatch({ type: 'close-request', id }),
      saveProject: (project) => dispatch({ type: 'save-project', project }),
      projectUpdate: (id, text) => dispatch({ type: 'project-update', id, text }),
      addProjectDocument: (payload) => dispatch({ type: 'add-project-document', ...payload }),
      approveDocument: (projectId, documentId) => dispatch({ type: 'approve-document', projectId, documentId }),
      rejectDocument: (projectId, documentId, reason) => dispatch({ type: 'reject-document', projectId, documentId, reason }),
      deleteDocument: (projectId, documentId) => dispatch({ type: 'delete-document', projectId, documentId }),
      setMobilizationPayment: (projectId, documentId, paymentStatus) => dispatch({ type: 'set-mobilization-payment', projectId, documentId, paymentStatus }),
      addMobilizationReceipt: (payload) => dispatch({ type: 'add-mobilization-receipt', ...payload }),
      addDocumentComment: (projectId, documentId, text) => dispatch({ type: 'add-document-comment', projectId, documentId, text }),
      resolveDocumentComment: (projectId, documentId, commentId, resolutionNote) => dispatch({ type: 'resolve-document-comment', projectId, documentId, commentId, resolutionNote }),
      hideDocumentComment: (projectId, documentId, commentId) => dispatch({ type: 'hide-document-comment', projectId, documentId, commentId }),
      archiveDocumentComment: (projectId, documentId, commentId, archived = true) => dispatch({ type: 'archive-document-comment', projectId, documentId, commentId, archived }),
      archiveCommentMonth: (month) => dispatch({ type: 'archive-comment-month', month }),
      saveUser: (user) => dispatch({ type: 'save-user', user }),
      savePolicy: (policy) => dispatch({ type: 'save-policy', policy }),
      restore: (data) => dispatch({ type: 'restore', data }),
      resetDemo: () => dispatch({ type: 'reset-demo' }),
    }),
    [],
  )

  const value = useMemo(() => ({ state, ...api }), [state, api])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// The hook lives beside the provider so the context object stays private.
// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('The procurement store is missing.')
  return value
}
