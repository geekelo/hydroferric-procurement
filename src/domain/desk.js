const APPROVING = ['reviewer', 'approver', 'verifier']

export function deskOf(user) {
  if (!user) return null
  if (APPROVING.includes(user.role)) return 'approving'
  if (user.role === 'finance') return 'accounts'
  if (user.role === 'management') return 'executive'
  if (user.role === 'admin') return 'admin'
  return 'department'
}

export function homeHash(user) {
  return deskOf(user) === 'approving' ? '#/pending' : '#/overview'
}

export function deskLabel(user) {
  const desk = deskOf(user)
  if (desk === 'approving') return 'Approving'
  if (desk === 'accounts') return 'Accounts'
  if (desk === 'executive') return 'Managing director'
  if (desk === 'admin') return 'Administration'
  return user?.department || 'Department'
}

const NAV = {
  approving: [
    { href: '#/pending', label: 'Pending', icon: 'check', badge: 'pending' },
    { href: '#/done', label: 'Done', icon: 'audit' },
    { href: '#/notifications', label: 'Notifications', icon: 'bell', badge: 'notes' },
  ],
  department: [
    { href: '#/projects', label: 'Projects', icon: 'project' },
    { href: '#/requests', label: 'Requests', icon: 'file' },
    { href: '#/notifications', label: 'Notifications', icon: 'bell', badge: 'notes' },
    { href: '#/reports', label: 'Reports', icon: 'chart' },
    { href: '#/overview', label: 'Overview', icon: 'grid' },
  ],
  accounts: [
    { href: '#/notifications', label: 'Notifications', icon: 'bell', badge: 'notes' },
    { href: '#/payments', label: 'Payments', icon: 'pay' },
    { href: '#/projects', label: 'Projects', icon: 'project' },
    { href: '#/reports', label: 'Reports', icon: 'chart' },
    { href: '#/overview', label: 'Overview', icon: 'grid' },
  ],
  executive: [
    { href: '#/activity', label: 'Activity', icon: 'audit' },
    { href: '#/projects', label: 'Projects', icon: 'project' },
    { href: '#/notifications', label: 'Notifications', icon: 'bell', badge: 'notes' },
    { href: '#/requests', label: 'Requests', icon: 'file' },
    { href: '#/payments', label: 'Payments', icon: 'pay' },
    { href: '#/reports', label: 'Reports', icon: 'chart' },
    { href: '#/overview', label: 'Overview', icon: 'grid' },
  ],
}

export function navFor(user) {
  const desk = deskOf(user)
  const items = desk === 'admin' ? [...NAV.executive, { href: '#/admin', label: 'Users and roles', icon: 'admin' }] : NAV[desk] || NAV.department
  return items
}

export function reportKinds(user) {
  const desk = deskOf(user)
  if (desk === 'accounts') return ['disbursements', 'invoices']
  if (desk === 'department') return ['requests', 'projects']
  return ['requests', 'disbursements', 'projects']
}
