import { describe, expect, it } from 'vitest'
import { cardProblem, planApply, type Defaults } from './apply'
import type { Proposal } from './prompt'
import { defaultConfig } from '../config'
import { emptyReq } from '../model'

const cfg = defaultConfig()
cfg.id.scheme = { on: true, sep: '-', areas: [{ code: 'ST', name: 'Studio' }, { code: 'PA', name: '' }], types: {
  Business: { code: 'BR', area: true, digits: 2 }, Stakeholder: { code: 'SR', area: true, digits: 2 },
  Functional: { code: 'FR', area: true, digits: 3 }, 'Non-functional': { code: 'NFR', area: true, digits: 3 }, Transition: { code: 'TR', area: true, digits: 2 },
} }
const rows = [{ ...emptyReq('ST-FR-089'), type: 'Functional', statement: 'old', priority: 'High' }, { ...emptyReq('ST-SR-01'), type: 'Stakeholder' }]
const d: Defaults = { release: 'v1', owner: 'me@x', source: 'AI intake 2026-11-19', date: '2026-11-19' }
const p = (o: Partial<Proposal>): Proposal => ({ kind: 'new', tmpId: '', existingId: '', type: 'Functional', area: 'ST', parent: '', statement: 's', acceptance: '',
  priority: '', category: '', designRequired: '', changes: {}, source: '', reason: 'r', ...o })

describe('AI apply planner', () => {
  it('new requirements of the same type and area get consecutive free IDs', () => {
    const r = planApply([p({ tmpId: 'tmp-1' }), p({ tmpId: 'tmp-2' })], rows, cfg, d)
    expect(r.creates.map(c => c.id)).toEqual(['ST-FR-090', 'ST-FR-091'])
    expect(r.idMap).toEqual({ 'tmp-1': 'ST-FR-090', 'tmp-2': 'ST-FR-091' })
  })
  it('a parent pointing at another new proposal gets its new ID', () => {
    const r = planApply([p({ tmpId: 'tmp-1', type: 'Stakeholder' }), p({ tmpId: 'tmp-2', parent: 'tmp-1' })], rows, cfg, d)
    expect(r.creates[1].parent).toBe('ST-SR-02')
  })
  it('a parent naming a tmp ID outside the batch stays as text with a warning', () => {
    const r = planApply([p({ tmpId: 'tmp-1', parent: 'tmp-9' })], rows, cfg, d)
    expect(r.creates[0].parent).toBe('tmp-9')
    expect(r.warnings.join()).toContain('tmp-9 not in this batch')
  })
  it('fills batch defaults and workflow start values', () => {
    const c = planApply([p({ tmpId: 'tmp-1', priority: 'High', designRequired: 'No' })], rows, cfg, d).creates[0]
    expect(c).toMatchObject({ release: 'v1', owner: 'me@x', source: 'AI intake 2026-11-19', date_added: '2026-11-19', status: cfg.workflow.initial,
      delivery: 'Not Started', priority: 'High', design_required: 'No', type: 'Functional', notes: 'From AI intake: r' })
  })
  it('the proposal source overrides the batch source', () => {
    expect(planApply([p({ tmpId: 'tmp-1', source: 'Anna (CRO)' })], rows, cfg, d).creates[0].source).toBe('Anna (CRO)')
  })
  it('updates change only the allowed fields', () => {
    const r = planApply([p({ kind: 'update', existingId: 'ST-FR-089', changes: { statement: 'new', type: 'Business' } })], rows, cfg, d)
    expect(r.updates[0].next).toMatchObject({ id: 'ST-FR-089', statement: 'new', type: 'Functional', priority: 'High' })
    expect(r.updates[0].prev.statement).toBe('old')
    expect(r.warnings.join()).toContain('type')
  })
  it('duplicates are ignored', () => {
    const r = planApply([p({ kind: 'duplicate', existingId: 'ST-FR-089' })], rows, cfg, d)
    expect(r.creates).toEqual([]); expect(r.updates).toEqual([])
  })
  it('flags problems on a card', () => {
    expect(cardProblem(p({ area: 'XX' }), rows, cfg)).toBe('unknown area')
    expect(cardProblem(p({ type: 'Epic' }), rows, cfg)).toBe('missing type')
    expect(cardProblem(p({ kind: 'update', existingId: 'NOPE-1' }), rows, cfg)).toBe('unknown requirement')
    expect(cardProblem(p({}), rows, cfg)).toBeNull()
  })
})
