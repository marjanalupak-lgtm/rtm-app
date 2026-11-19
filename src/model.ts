// RTM data model — mirrors the RTM.xlsm template (sheet "RTM", columns A–AB).

export const LISTS = {
  type: ['Business', 'Stakeholder', 'Functional', 'Non-functional', 'Transition'],
  category: ['Regulatory / Compliance', 'Security', 'Privacy', 'Data', 'Integration', 'Performance', 'Reporting', 'Accessibility / Usability', 'Operational', 'Other'],
  priority: ['Critical', 'High', 'Medium', 'Low'],
  status: ['Draft', 'Ready for Review', 'In Review', 'Approved', 'Rejected', 'On Hold', 'Obsolete'],
  delivery: ['Not Started', 'In Development', 'Ready for QA', 'In QA', 'Done', 'Blocked', 'Deferred'],
  testCase: ['Not Started', 'In Progress', 'Ready for Review', 'Approved', 'Blocked', 'N/A'],
  testExec: ['Not Run', 'Passed', 'Failed', 'Blocked', 'Skipped', 'N/A'],
  designRequired: ['Yes', 'No', 'N/A'],
  designStatus: ['Not Started', 'In Progress', 'Ready for Review', 'In Review', 'Approved', 'Changes Required', 'Blocked', 'N/A'],
} as const

export type ListKey = keyof typeof LISTS

export type Req = {
  id: string            // A Requirement ID*
  date_added: string    // B
  release: string       // C
  type: string          // D
  category: string      // E
  source: string        // F
  spec_link: string     // G
  parent: string        // H
  epic_id: string       // I
  epic_title: string    // J
  story_id: string      // K
  statement: string     // L
  acceptance: string    // M
  design_required: string // N
  design_link: string   // O
  design_status: string // P
  design_owner: string  // Q
  priority: string      // R
  status: string        // S
  owner: string         // T
  delivery: string      // U
  dependency: string    // V
  test_case: string     // W
  test_case_status: string // X
  test_exec: string     // Y
  defect: string        // Z
  notes: string         // AB
  extra?: Record<string, string> // custom fields (per-project config)
  updated_at?: string
  updated_by?: string
}

export type Field = {
  key: keyof Req
  label: string
  req: '*' | '†' | ''
  list?: ListKey
  long?: boolean
  link?: boolean
  group: 'Core' | 'Traceability' | 'Design' | 'Governance' | 'Verification'
  help?: string
}

// Order = Excel column order (A..AB, without calculated AA).
export const FIELDS: Field[] = [
  { key: 'id', label: 'Requirement ID', req: '*', group: 'Core', help: 'Stable ID, e.g. REQ-001. Never reuse.' },
  { key: 'date_added', label: 'Date Added', req: '*', group: 'Core' },
  { key: 'release', label: 'Release / Version', req: '*', group: 'Core' },
  { key: 'type', label: 'Requirement Type', req: '*', list: 'type', group: 'Core' },
  { key: 'category', label: 'Requirement Category', req: '', list: 'category', group: 'Core' },
  { key: 'source', label: 'Source / Stakeholder', req: '*', group: 'Core' },
  { key: 'spec_link', label: 'Specification / Confluence Link', req: '', link: true, group: 'Traceability' },
  { key: 'parent', label: 'Parent Requirement / Business Objective', req: '*', group: 'Traceability' },
  { key: 'epic_id', label: 'Epic ID / Link', req: '', link: true, group: 'Traceability' },
  { key: 'epic_title', label: 'Epic Title', req: '', group: 'Traceability' },
  { key: 'story_id', label: 'User Story ID / Link', req: '†', link: true, group: 'Traceability', help: 'Required once delivery has started.' },
  { key: 'statement', label: 'User Story / Requirement', req: '*', long: true, group: 'Core' },
  { key: 'acceptance', label: 'Acceptance Criteria (if separate) / Link', req: '†', long: true, group: 'Core' },
  { key: 'design_required', label: 'Design Required?', req: '*', list: 'designRequired', group: 'Design' },
  { key: 'design_link', label: 'Design ID / Figma Link', req: '†', link: true, group: 'Design', help: 'Required if Design Required = Yes.' },
  { key: 'design_status', label: 'Design Status', req: '†', list: 'designStatus', group: 'Design' },
  { key: 'design_owner', label: 'Design Owner', req: '†', group: 'Design' },
  { key: 'priority', label: 'Priority', req: '*', list: 'priority', group: 'Governance' },
  { key: 'status', label: 'Requirement Status', req: '*', list: 'status', group: 'Governance' },
  { key: 'owner', label: 'Owner', req: '*', group: 'Governance' },
  { key: 'delivery', label: 'Delivery Status', req: '*', list: 'delivery', group: 'Governance' },
  { key: 'dependency', label: 'Dependency / Related ID', req: '', group: 'Governance' },
  { key: 'test_case', label: 'Test Case ID / Link', req: '†', link: true, group: 'Verification', help: 'Required for Approved requirements.' },
  { key: 'test_case_status', label: 'Test Case Status', req: '†', list: 'testCase', group: 'Verification' },
  { key: 'test_exec', label: 'Test Execution Status', req: '†', list: 'testExec', group: 'Verification' },
  { key: 'defect', label: 'Defect ID / Link', req: '†', link: true, group: 'Verification', help: 'Required if Test Execution = Failed.' },
  { key: 'notes', label: 'Notes', req: '', long: true, group: 'Governance' },
]

export const EXCEL_TRACE_COL = 27 // AA (1-based), inserted between defect (Z) and notes (AB)

export function emptyReq(id = ''): Req {
  const r = Object.fromEntries(FIELDS.map(f => [f.key, ''])) as unknown as Req
  r.id = id
  r.date_added = new Date().toISOString().slice(0, 10)
  r.status = 'Draft'
  r.delivery = 'Not Started'
  return r
}

export function nextId(rows: Req[]): string {
  const max = rows.reduce((m, r) => {
    const n = /^REQ-(\d+)$/i.exec(r.id.trim())
    return n ? Math.max(m, Number(n[1])) : m
  }, 0)
  return 'REQ-' + String(max + 1).padStart(3, '0')
}

// Exact port of the Excel "Traceability Check" formula (column AA).
export function traceCheck(r: Req): string {
  const e = (v: string | undefined) => !v || !v.trim()
  if (e(r.statement)) return ''
  if (e(r.id)) return 'MISSING REQ ID'
  if (e(r.date_added)) return 'MISSING DATE'
  if (e(r.release)) return 'MISSING RELEASE'
  if (e(r.type)) return 'MISSING TYPE'
  if (e(r.source)) return 'MISSING SOURCE'
  if (e(r.parent)) return 'MISSING PARENT'
  if (e(r.design_required)) return 'MISSING DESIGN DECISION'
  if (r.design_required === 'Yes') {
    if (e(r.design_link)) return 'MISSING DESIGN'
    if (e(r.design_status)) return 'MISSING DESIGN STATUS'
    if (r.design_status !== 'Approved') return 'DESIGN NOT APPROVED'
    if (e(r.design_owner)) return 'MISSING DESIGN OWNER'
  }
  if (e(r.priority)) return 'MISSING PRIORITY'
  if (e(r.status)) return 'MISSING REQUIREMENT STATUS'
  if (e(r.owner)) return 'MISSING OWNER'
  if (e(r.delivery)) return 'MISSING DELIVERY STATUS'
  if (r.delivery !== 'Not Started' && r.delivery !== 'Deferred' && e(r.story_id)) return 'MISSING STORY LINK'
  if (r.test_exec === 'Failed' && e(r.defect)) return 'MISSING DEFECT'
  if (r.test_exec === 'Failed') return 'FAILED TEST'
  if (r.delivery === 'Done' && r.test_exec !== 'Passed' && r.test_exec !== 'N/A') return 'TEST NOT PASSED'
  if (r.status === 'Approved') {
    if (e(r.test_case)) return 'MISSING TEST'
    if (e(r.test_case_status)) return 'MISSING TEST STATUS'
    if (r.test_case_status !== 'Approved' && r.test_case_status !== 'N/A') return 'TEST NOT APPROVED'
  }
  return 'COVERED'
}

// Requirement Status transition rules (Guide & Lists §3).
export const TRANSITIONS: Record<string, string[]> = {
  'Draft': ['Ready for Review', 'On Hold'],
  'Ready for Review': ['In Review', 'Draft', 'On Hold'],
  'In Review': ['Approved', 'Rejected', 'Draft', 'On Hold'],
  'Approved': ['On Hold', 'Obsolete', 'In Review'],
  'Rejected': ['Draft', 'Obsolete'],
  'On Hold': ['Draft', 'In Review', 'Approved', 'Obsolete'],
  'Obsolete': [],
}

export const GATES: Record<string, string> = {
  'Draft': 'ID, source, objective, type, owner',
  'Ready for Review': 'Statement complete; links and design decision recorded',
  'In Review': 'Named reviewers; comments tracked',
  'Approved': 'Decision authority accepted scope and evidence',
  'Rejected': 'Decision and reason recorded',
  'On Hold': 'Reason, owner, and review date recorded',
  'Obsolete': 'Replacement or retirement rationale linked',
}

export function allowedStatuses(from: string): string[] {
  if (!from) return [...LISTS.status]
  return [from, ...(TRANSITIONS[from] ?? [])]
}

// Fields that must be filled before leaving a status (the "Required before transition" gate).
export function gateErrors(r: Req, to: string): string[] {
  const out: string[] = []
  const need = (k: keyof Req, label: string) => { if (!String(r[k] ?? '').trim()) out.push(label) }
  if (to === 'Ready for Review') {
    need('id', 'Requirement ID'); need('source', 'Source'); need('parent', 'Parent / Objective')
    need('type', 'Type'); need('owner', 'Owner'); need('statement', 'Statement'); need('design_required', 'Design Required?')
  }
  if ((to === 'Rejected' || to === 'On Hold' || to === 'Obsolete') && !r.notes.trim()) out.push('Notes (reason / rationale)')
  return out
}

export function severity(check: string): 'ok' | 'warn' | 'bad' | 'none' {
  if (!check) return 'none'
  if (check === 'COVERED') return 'ok'
  if (check === 'FAILED TEST' || check === 'MISSING DEFECT' || check.startsWith('MISSING REQ')) return 'bad'
  return 'warn'
}
