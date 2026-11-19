import { describe, it, expect } from 'vitest'
import { traceCheck, emptyReq, nextId, allowedStatuses, gateErrors, type Req } from './model'

const full = (o: Partial<Req> = {}): Req => ({
  ...emptyReq('REQ-001'), release: 'MVP 1.0', type: 'Functional', source: 'Ops', parent: 'BR-1',
  statement: 'As a user…', design_required: 'No', priority: 'High', owner: 'PO', ...o,
})

describe('traceCheck (Excel formula port)', () => {
  it('blank statement → empty', () => expect(traceCheck(emptyReq())).toBe(''))
  it('complete draft → COVERED', () => expect(traceCheck(full())).toBe('COVERED'))
  it('missing parent', () => expect(traceCheck(full({ parent: '' }))).toBe('MISSING PARENT'))
  it('design yes, no link', () => expect(traceCheck(full({ design_required: 'Yes' }))).toBe('MISSING DESIGN'))
  it('design not approved', () => expect(traceCheck(full({ design_required: 'Yes', design_link: 'f', design_status: 'In Progress' }))).toBe('DESIGN NOT APPROVED'))
  it('delivery started without story', () => expect(traceCheck(full({ delivery: 'In QA' }))).toBe('MISSING STORY LINK'))
  it('failed without defect', () => expect(traceCheck(full({ test_exec: 'Failed' }))).toBe('MISSING DEFECT'))
  it('failed with defect', () => expect(traceCheck(full({ test_exec: 'Failed', defect: 'BUG-1' }))).toBe('FAILED TEST'))
  it('done but not passed', () => expect(traceCheck(full({ delivery: 'Done', story_id: 'S-1' }))).toBe('TEST NOT PASSED'))
  it('approved needs test', () => expect(traceCheck(full({ status: 'Approved' }))).toBe('MISSING TEST'))
  it('approved with approved test', () => expect(traceCheck(full({ status: 'Approved', test_case: 'TC', test_case_status: 'Approved' }))).toBe('COVERED'))
})

describe('rules', () => {
  it('nextId', () => expect(nextId([full({ id: 'REQ-009' }), full({ id: 'REQ-012' })])).toBe('REQ-013'))
  it('transitions', () => expect(allowedStatuses('Draft')).toEqual(['Draft', 'Ready for Review', 'On Hold']))
  it('obsolete is final', () => expect(allowedStatuses('Obsolete')).toEqual(['Obsolete']))
  it('gate needs reason for hold', () => expect(gateErrors(full(), 'On Hold')).toContain('Notes (reason / rationale)'))
})
