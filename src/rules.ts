// Config-aware Traceability Check, ID numbering and status workflow.
// With the default config, check() returns exactly what the Excel formula returns (see rules.test.ts).
import { type Req } from './model'
import { type Config, type FieldKey, getVal, fieldLabel } from './config'

// Excel wording for built-in "MISSING …" messages.
const MISSING: Partial<Record<FieldKey, string>> = {
  id: 'REQ ID', date_added: 'DATE', release: 'RELEASE', type: 'TYPE', source: 'SOURCE', parent: 'PARENT',
  design_required: 'DESIGN DECISION', priority: 'PRIORITY', status: 'REQUIREMENT STATUS', owner: 'OWNER', delivery: 'DELIVERY STATUS',
}
// Excel order: core required fields up to the design decision, then design rules, then the rest.
const BEFORE_DESIGN: FieldKey[] = ['id', 'date_added', 'release', 'type', 'category', 'source', 'spec_link', 'parent', 'epic_id', 'epic_title', 'story_id', 'acceptance', 'design_required']
const AFTER_DESIGN: FieldKey[] = ['priority', 'status', 'owner', 'delivery', 'dependency', 'test_case', 'test_case_status', 'test_exec', 'defect', 'notes']

const empty = (v: string | undefined) => !v || !v.trim()

export function check(r: Req, cfg: Config): string {
  if (empty(r.statement)) return ''
  const R = cfg.rules
  const missing = (keys: string[]): string => {
    if (!R.requiredFields) return ''
    for (const k of keys) {
      const f = (cfg.fields as Record<string, { visible: boolean; required: boolean }>)[k]
      const isCustom = k.startsWith('c_')
      const req = isCustom ? cfg.custom.find(c => c.key === k)?.required : f?.visible && f?.required
      if (req && empty(getVal(r, k))) return 'MISSING ' + (MISSING[k as FieldKey] ?? fieldLabel(cfg, k).toUpperCase())
    }
    return ''
  }
  let m = missing(BEFORE_DESIGN); if (m) return m
  if (R.design && cfg.fields.design_required.visible && r.design_required === 'Yes') {
    if (empty(r.design_link)) return 'MISSING DESIGN'
    if (empty(r.design_status)) return 'MISSING DESIGN STATUS'
    if (r.design_status !== 'Approved') return 'DESIGN NOT APPROVED'
    if (empty(r.design_owner)) return 'MISSING DESIGN OWNER'
  }
  m = missing([...AFTER_DESIGN, ...cfg.custom.map(c => c.key)]); if (m) return m
  if (R.storyLink && r.delivery && r.delivery !== 'Not Started' && r.delivery !== 'Deferred' && empty(r.story_id)) return 'MISSING STORY LINK'
  if (R.defectForFailed && r.test_exec === 'Failed' && empty(r.defect)) return 'MISSING DEFECT'
  if (R.failedTest && r.test_exec === 'Failed') return 'FAILED TEST'
  if (R.doneNeedsPass && r.delivery === 'Done' && r.test_exec !== 'Passed' && r.test_exec !== 'N/A') return 'TEST NOT PASSED'
  if (R.approvedNeedsTest && r.status === 'Approved') {
    if (empty(r.test_case)) return 'MISSING TEST'
    if (empty(r.test_case_status)) return 'MISSING TEST STATUS'
    if (r.test_case_status !== 'Approved' && r.test_case_status !== 'N/A') return 'TEST NOT APPROVED'
  }
  return 'COVERED'
}

export function nextIdFor(rows: Req[], cfg: Config): string {
  const esc = cfg.id.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('^' + esc + '(\\d+)$', 'i')
  const max = rows.reduce((mx, r) => { const n = re.exec(r.id.trim()); return n ? Math.max(mx, Number(n[1])) : mx }, 0)
  return cfg.id.prefix + String(max + 1).padStart(cfg.id.digits, '0')
}

export function allowedNext(from: string, cfg: Config): string[] {
  const all = cfg.lists.status
  if (!from) return [cfg.workflow.initial]
  if (!cfg.workflow.enforce) return all
  return [from, ...(cfg.workflow.transitions[from] ?? [])]
}

// Before leaving the initial status, the required fields must be filled; retire/hold/reject needs a reason.
export function gateFor(r: Req, to: string, from: string, cfg: Config): string[] {
  if (to === from) return []
  const out: string[] = []
  if (from === cfg.workflow.initial) {
    for (const [k, f] of Object.entries(cfg.fields)) if (f.visible && f.required && empty(getVal(r, k))) out.push(f.label)
    for (const c of cfg.custom) if (c.required && empty(getVal(r, c.key))) out.push(c.label)
  }
  if (['Rejected', 'On Hold', 'Obsolete'].includes(to) && empty(r.notes)) out.push(fieldLabel(cfg, 'notes') + ' (reason / rationale)')
  return out
}

export function isLive(r: Req): boolean {
  return !!r.statement && r.status !== 'Obsolete' && r.status !== 'Rejected'
}
