import { useEffect, useState } from 'react'
import { Shell } from './components/Shell.jsx'
import { StoreProvider, useStore } from './domain/store.jsx'
import { currentUser } from './domain/selectors.js'
import { deskOf, homeHash } from './domain/desk.js'
import { Admin } from './pages/Admin.jsx'
import { Comments } from './pages/Comments.jsx'
import { Activity, Done, Notifications, Pending } from './pages/Dashboard.jsx'
import { InvoiceDetail, InvoiceForm } from './pages/Invoices.jsx'
import { Login } from './pages/Login.jsx'
import { OrderDetail } from './pages/Orders.jsx'
import { PaymentRecord, Payments } from './pages/Payments.jsx'
import { ProjectDetail, ProjectForm, Projects } from './pages/Projects.jsx'
import { Reports } from './pages/Reports.jsx'
import { RequestDetail } from './pages/RequestDetail.jsx'
import { RequestForm } from './pages/RequestForm.jsx'
import { Requests } from './pages/Requests.jsx'
import { SupplierDetail, SupplierForm } from './pages/Suppliers.jsx'
import { Drawer, Empty } from './components/ui.jsx'

function parseRoute(hash) {
  const raw = (hash || '#/').replace(/^#/, '')
  const [path, search = ''] = raw.split('?')
  return { parts: path.split('/').filter(Boolean), search: new URLSearchParams(search) }
}

// A single request opens in a panel over the page the user came from.
function isRequestPanel(hash) {
  const [section, id, action] = parseRoute(hash).parts
  return section === 'requests' && Boolean(id) && id !== 'new' && action !== 'edit'
}

function Workspace() {
  const { state } = useStore()
  const [nav, setNav] = useState(() => {
    const first = window.location.hash || '#/'
    return { hash: first, base: isRequestPanel(first) ? '' : first, fromPanel: false }
  })
  const hash = nav.hash
  useEffect(() => {
    const onChange = () => {
      const next = window.location.hash || '#/'
      setNav((prev) => ({
        hash: next,
        base: isRequestPanel(next) ? prev.base : next,
        fromPanel: isRequestPanel(prev.hash) && !isRequestPanel(next),
      }))
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const panelOpen = isRequestPanel(hash)
  const keepScroll = panelOpen || nav.fromPanel
  useEffect(() => {
    if (!keepScroll) window.scrollTo(0, 0)
  }, [hash, keepScroll])

  const user = currentUser(state)
  const [section, id] = parseRoute(hash).parts
  const title = {
    requests: 'Requests',
    pending: 'Pending',
    done: 'Done',
    notifications: 'Notifications',
    comments: 'Comments',
    activity: 'Activity',
    quotations: 'Quotations',
    orders: 'Purchase orders',
    suppliers: 'Suppliers',
    invoices: 'Invoices',
    projects: 'Projects',
    payments: 'Payments',
    reports: 'Reports',
    admin: 'Users and roles',
  }[section] || 'Requisitions'
  useEffect(() => {
    document.title = `${user ? title : 'Sign in'} · Hydroferric Requisitions`
  }, [title, user])

  const desk = deskOf(user)
  const home = user ? homeHash(user) : '#/'
  useEffect(() => {
    if (!user) return
    if (!section || section === 'overview' || section === 'dashboard' || section === 'approvals' && desk !== 'approving') {
      if (window.location.hash !== home) window.location.hash = home
    }
    if (section === 'approvals' && desk === 'approving' && window.location.hash !== '#/pending') {
      window.location.hash = '#/pending'
    }
  }, [user, section, desk, home])

  if (!user) return <Login />
  const homeLink = <a className="btn btn-primary" href={home}>Back to your desk</a>
  const build = (target) => {
    const route = parseRoute(target)
    const [part, key, verb] = route.parts
    const query = route.search
    if (!part || part === 'overview' || part === 'dashboard' || part === 'approvals') return build(home)
    if (!pageAllowed(desk, part, key)) return <Empty title="That page is not on your desk" action={homeLink} />
    if (part === 'pending') return <Pending />
    if (part === 'done') return <Done />
    if (part === 'notifications') return <Notifications />
    if (part === 'comments') return <Comments />
    if (part === 'activity') return <Activity />
    if (part === 'requests' && key === 'new') return <RequestForm key={query.get('project') || 'new'} projectId={query.get('project') || ''} />
    if (part === 'requests' && verb === 'edit') return <RequestForm key={key} id={key} />
    if (part === 'requests' && key) return <RequestDetail key={key} id={key} />
    if (part === 'requests') return <Requests key={query.get('department') || 'all'} department={query.get('department') || ''} />
    if (part === 'orders' && key) return <OrderDetail key={key} id={key} />
    if (part === 'suppliers' && key === 'new') return <SupplierForm key="new" />
    if (part === 'suppliers' && key) return <SupplierDetail key={key} id={key} />
    if (part === 'invoices' && key === 'new') return <InvoiceForm key={query.get('po') || 'new'} poId={query.get('po') || ''} />
    if (part === 'invoices' && key) return <InvoiceDetail key={key} id={key} />
    if (part === 'projects' && key === 'new') return <ProjectForm key="new" />
    if (part === 'projects' && verb === 'edit') return <ProjectForm key={key} id={key} />
    if (part === 'projects' && key) return <ProjectDetail key={key} id={key} verificationId={query.get('verification') || ''} requestId={query.get('request') || ''} />
    if (part === 'projects') return <Projects />
    if (part === 'payments' && key) return <PaymentRecord key={key} id={key} />
    if (part === 'payments') return <Payments />
    if (part === 'reports') return <Reports />
    if (part === 'admin') return <Admin />
    return <Empty title="That page is not on your desk" action={homeLink} />
  }

  // A request opens over the page the user came from. A direct link falls back to its project.
  const request = panelOpen ? state.requests.find((item) => item.id === id) : null
  const fallback = request?.projectId && desk !== 'approving' && desk !== 'accounts' ? `#/projects/${request.projectId}` : home
  const base = panelOpen ? nav.base || fallback : hash
  const close = () => { window.location.hash = base }
  return (
    <Shell hash={base}>
      {build(base)}
      {panelOpen ? (
        <Drawer title={request ? request.number : 'Requisition'} onClose={close}>
          {build(hash)}
        </Drawer>
      ) : null}
    </Shell>
  )
}

function pageAllowed(desk, section, id) {
  if (!section || section === 'overview' || section === 'dashboard' || section === 'approvals') return true
  const lists = {
    approving: ['pending', 'done', 'notifications', 'comments'],
    department: ['projects', 'requests', 'notifications', 'comments', 'reports'],
    accounts: ['notifications', 'comments', 'payments', 'projects', 'reports'],
    executive: ['activity', 'projects', 'notifications', 'comments', 'requests', 'payments', 'reports'],
    admin: ['activity', 'projects', 'notifications', 'comments', 'requests', 'payments', 'reports', 'admin'],
  }
  if ((lists[desk] || []).includes(section)) return true
  if (section === 'requests' && id === 'new') return desk === 'department' || desk === 'admin'
  if (section === 'invoices' && id === 'new') return desk !== 'approving'
  if (section === 'projects' && id === 'new') return desk === 'admin'
  if (section === 'suppliers' && id === 'new') return desk !== 'approving'
  const records = ['requests', 'projects', 'payments', 'orders', 'invoices', 'suppliers']
  return Boolean(id) && records.includes(section)
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  )
}
