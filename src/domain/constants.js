export const PAYMENT_CONTROL =
  'The system authorises and records payments. It does not itself execute bank transfers. Automatic payment verification or direct bank transfers require a separately approved bank integration. Supplier notifications are sent only after an authorised user records payment confirmation.'

export const PO_CONTROL =
  'Purchase orders are generated only after the required quotation approval. Approval, verification and payment controls follow the authorised workflow.'

export const ROLES = [
  { id: 'requester', label: 'HOD', summary: 'Raise the department requisition and file the documents for each step.' },
  { id: 'reviewer', label: 'Reviewer', summary: 'Check scope, cost and project fit before approval.' },
  { id: 'approver', label: 'Approver', summary: 'Give designated approval for requests, quotations and payments.' },
  { id: 'procurement', label: 'Procurement', summary: 'Source quotations, compare offers and issue purchase orders.' },
  { id: 'verifier', label: 'Project verifier', summary: 'Confirm delivery, milestones and evidence before payment.' },
  { id: 'finance', label: 'Accounts', summary: 'Record payments and follow project balances.' },
  { id: 'management', label: 'MD', summary: 'See every department and approve high-value steps.' },
  { id: 'admin', label: 'Site admin', summary: 'Manage people and roles, and file documents on any project.' },
]

export const DEPARTMENTS = [
  'Engineering',
  'Projects',
  'Operations',
  'Procurement',
  'Finance',
  'Administration',
  'Executive',
]

export const URGENCIES = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
]

export const UNITS = ['pcs', 'sets', 'lots', 'kg', 'litres', 'metres', 'days']

export const FLOW = [
  { id: 'request', index: '01', title: 'Request and approval', text: 'Submission, review and initial approval.' },
  { id: 'quotation', index: '02', title: 'Quotation', text: 'Sourcing, comparison, recommendation and designated approval.' },
  { id: 'po', index: '03', title: 'Purchase order', text: 'A numbered order is issued only after quotation approval.' },
  { id: 'verify', index: '04', title: 'Verify delivery', text: 'Match the invoice to the order, then confirm the milestone.' },
  { id: 'pay', index: '05', title: 'Payment', text: 'Schedule, authorise, record confirmation and notify the supplier.' },
  { id: 'close', index: '06', title: 'Close-out', text: 'Reconcile expenditure, commitments and the audit history.' },
]

export const REQUEST_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  returned: { label: 'Returned', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'bad' },
  in_approval: { label: 'In approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'good' },
  sourcing: { label: 'Sourcing', tone: 'teal' },
  recommended: { label: 'With approver', tone: 'purple' },
  po_issued: { label: 'Order issued', tone: 'good' },
  closed: { label: 'Closed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}

export const QUOTE_STATUS = {
  received: { label: 'Received', tone: 'info' },
  recommended: { label: 'Recommended', tone: 'purple' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Not selected', tone: 'bad' },
  superseded: { label: 'Superseded', tone: 'neutral' },
}

export const PO_STATUS = {
  issued: { label: 'Issued', tone: 'good' },
  closed: { label: 'Closed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}

export const INVOICE_STATUS = {
  submitted: { label: 'Awaiting match', tone: 'info' },
  mismatch: { label: 'Mismatch', tone: 'warn' },
  duplicate: { label: 'Duplicate', tone: 'bad' },
  held: { label: 'Payment held', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  scheduled: { label: 'Scheduled', tone: 'purple' },
  partially_paid: { label: 'Partially paid', tone: 'teal' },
  paid: { label: 'Fully paid', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
}

export const VERIFY_STATUS = {
  assigned: { label: 'Assigned', tone: 'info' },
  approved: { label: 'Verified', tone: 'good' },
  rejected: { label: 'Refused', tone: 'bad' },
}

export const SCHEDULE_STATUS = {
  draft: { label: 'Draft schedule', tone: 'neutral' },
  pending_approval: { label: 'Awaiting authorisation', tone: 'info' },
  authorised: { label: 'Authorised', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
  completed: { label: 'Completed', tone: 'neutral' },
}

export const PAYMENT_STATUS = {
  authorised: { label: 'Authorised', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'good' },
}

export const ROLE_TONE = {
  requester: 'info',
  reviewer: 'teal',
  approver: 'purple',
  procurement: 'warn',
  verifier: 'good',
  finance: 'info',
  management: 'purple',
  admin: 'neutral',
}

export function roleLabel(role) {
  return ROLES.find((item) => item.id === role)?.label || role
}

export function statusMeta(map, status) {
  return map[status] || { label: status || '—', tone: 'neutral' }
}
