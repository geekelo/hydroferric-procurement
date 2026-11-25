import { useEffect, useState } from 'react'
import { Shell } from './components/Shell.jsx'
import { StoreProvider, useStore } from './domain/store.jsx'
import { currentUser } from './domain/selectors.js'
import { deskOf, homeHash } from './domain/desk.js'
import { Admin } from './pages/Admin.jsx'
import { Comments } from './pages/Comments.jsx'
import { Activity, Done, Notifications, Overview, Pending } from './pages/Dashboard.jsx'
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
import { Empty } from './components/ui.jsx'

function parseRoute(hash) {
  const raw = (hash || '#/overview').replace(/^#/, '')
  const [path, search = ''] = raw.split('?')
  return { parts: path.split('/').filter(Boolean), search: new URLSearchParams(search) }
}

function Workspace() {
  const { state } = useStore()
  const [hash, setHash] = useState(() => window.location.hash || '#/overview')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/overview')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [hash])

  const user = currentUser(state)
  const { parts, search } = parseRoute(hash)
  const [section, id, action] = parts
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
    overview: 'Overview',
  }[section] || 'Overview'
  useEffect(() => {
    document.title = `${user ? title : 'Sign in'} · Hydroferric Requisitions`
  }, [title, user])

  const desk = deskOf(user)
  const home = user ? homeHash(user) : '#/overview'
  useEffect(() => {
    if (!user) return
    if (!section || section === 'dashboard' || section === 'approvals' && desk !== 'approving') {
      if (window.location.hash !== home) window.location.hash = home
    }
    if (section === 'approvals' && desk === 'approving' && window.location.hash !== '#/pending') {
      window.location.hash = '#/pending'
    }
  }, [user, section, desk, home])

  if (!user) return <Login />
  const homeLink = <a className="btn btn-primary" href={home}>Back to your desk</a>
  let page = desk === 'approving' ? <Pending /> : <Overview />
  if (!section || section === 'dashboard' || section === 'approvals') {
    page = desk === 'approving' ? <Pending /> : <Overview />
  } else if (!pageAllowed(desk, section, id)) {
    page = <Empty title="That page is not on your desk" action={homeLink} />
  } else if (section === 'pending') page = <Pending />
  else if (section === 'done') page = <Done />
  else if (section === 'notifications') page = <Notifications />
  else if (section === 'comments') page = <Comments />
  else if (section === 'activity') page = <Activity />
  else if (section === 'requests' && id === 'new') page = <RequestForm key={search.get('project') || 'new'} projectId={search.get('project') || ''} />
  else if (section === 'requests' && action === 'edit') page = <RequestForm key={id} id={id} />
  else if (section === 'requests' && id) page = <RequestDetail key={id} id={id} />
  else if (section === 'requests') page = <Requests key={search.get('department') || 'all'} department={search.get('department') || ''} />
  else if (section === 'orders' && id) page = <OrderDetail key={id} id={id} />
  else if (section === 'suppliers' && id === 'new') page = <SupplierForm key="new" />
  else if (section === 'suppliers' && id) page = <SupplierDetail key={id} id={id} />
  else if (section === 'invoices' && id === 'new') page = <InvoiceForm key={search.get('po') || 'new'} poId={search.get('po') || ''} />
  else if (section === 'invoices' && id) page = <InvoiceDetail key={id} id={id} />
  else if (section === 'projects' && id === 'new') page = <ProjectForm key="new" />
  else if (section === 'projects' && action === 'edit') page = <ProjectForm key={id} id={id} />
  else if (section === 'projects' && id) page = <ProjectDetail key={id} id={id} verificationId={search.get('verification') || ''} requestId={search.get('request') || ''} />
  else if (section === 'projects') page = <Projects />
  else if (section === 'payments' && id) page = <PaymentRecord key={id} id={id} />
  else if (section === 'payments') page = <Payments />
  else if (section === 'reports') page = <Reports />
  else if (section === 'admin') page = <Admin />
  else if (section && section !== 'overview') page = <Empty title="That page is not on your desk" action={homeLink} />

  return <Shell hash={hash}>{page}</Shell>
}

function pageAllowed(desk, section, id) {
  if (!section || section === 'overview' || section === 'dashboard' || section === 'approvals') return true
  const lists = {
    approving: ['pending', 'done', 'notifications', 'comments'],
    department: ['overview', 'projects', 'requests', 'notifications', 'comments', 'reports'],
    accounts: ['overview', 'notifications', 'comments', 'payments', 'projects', 'reports'],
    executive: ['overview', 'activity', 'projects', 'notifications', 'comments', 'requests', 'payments', 'reports'],
    admin: ['overview', 'activity', 'projects', 'notifications', 'comments', 'requests', 'payments', 'reports', 'admin'],
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
