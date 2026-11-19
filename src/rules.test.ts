import { describe, it, expect } from 'vitest'
import { traceCheck, emptyReq, type Req } from './model'
import { defaultConfig, normalize } from './config'
import { check, nextIdFor, allowedNext, gateFor } from './rules'

const full = (o: Partial<Req> = {}): Req => ({
  ...emptyReq('REQ-001'), release: 'MVP 1.0', type: 'Functional', source: 'Ops', parent: 'BR-1',
  statement: 'As a user…', design_required: 'No', priority: 'High', owner: 'PO', ...o,
})
const cases: Partial<Req>[] = [
  {}, { parent: '' }, { release: '' }, { id: '' }, { design_required: '' }, { design_required: 'Yes' },
  { design_required: 'Yes', design_link: 'f', design_status: 'In Progress' },
  { design_required: 'Yes', design_link: 'f', design_status: 'Approved' },
  { delivery: 'In QA' }, { test_exec: 'Failed' }, { test_exec: 'Failed', defect: 'B' }, { delivery: 'Done', story_id: 'S' },
  { status: 'Approved' }, { status: 'Approved', test_case: 'T' }, { status: 'Approved', test_case: 'T', test_case_status: 'Approved' }, { owner: '', priority: '' },
]

describe('check() with default config = Excel formula', () => {
  for (const c of cases) it(JSON.stringify(c), () => expect(check(full(c), defaultConfig())).toBe(traceCheck(full(c))))
})

describe('configuration', () => {
  it('rule off skips it', () => {
    const cfg = defaultConfig(); cfg.rules.approvedNeedsTest = false
    expect(check(full({ status: 'Approved' }), cfg)).toBe('COVERED')
  })
  it('optional field no longer required', () => {
    const cfg = defaultConfig(); cfg.fields.parent.required = false
    expect(check(full({ parent: '' }), cfg)).toBe('COVERED')
  })
  it('hidden field not required', () => {
    const cfg = defaultConfig(); cfg.fields.source.visible = false
    expect(check(full({ source: '' }), cfg)).toBe('COVERED')
  })
  it('custom required field', () => {
    const cfg = defaultConfig(); cfg.custom.push({ key: 'c_x', label: 'Regulation', type: 'text', options: [], required: true, inTable: false })
    expect(check(full(), cfg)).toBe('MISSING REGULATION')
    expect(check(full({ extra: { c_x: '21 CFR 11' } }), cfg)).toBe('COVERED')
  })
  it('custom ID prefix', () => {
    const cfg = defaultConfig(); cfg.id = { prefix: 'BR-', digits: 4 }
    expect(nextIdFor([full({ id: 'BR-0007' }), full({ id: 'REQ-050' })], cfg)).toBe('BR-0008')
  })
  it('workflow not enforced → any status', () => {
    const cfg = defaultConfig(); cfg.workflow.enforce = false
    expect(allowedNext('Draft', cfg)).toContain('Approved')
  })
  it('new requirement starts in initial status', () => expect(allowedNext('', defaultConfig())).toEqual(['Draft']))
  it('leaving Draft needs required fields', () => expect(gateFor(full({ owner: '' }), 'Ready for Review', 'Draft', defaultConfig())).toContain('Owner'))
  it('normalize keeps locked values and drops unknown transitions', () => {
    const cfg = normalize({ lists: { status: ['Draft', 'Done!'] }, workflow: { transitions: { Draft: ['Done!', 'Ghost'] } } })
    expect(cfg.lists.status).toContain('Approved')
    expect(cfg.workflow.transitions.Draft).toEqual(['Done!'])
  })
})
