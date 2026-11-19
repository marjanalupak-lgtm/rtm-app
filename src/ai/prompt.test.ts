import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, parseResult, RESULT_SCHEMA } from './prompt'
import { defaultConfig } from '../config'
import { emptyReq } from '../model'

const cfg = defaultConfig()
cfg.id.scheme = { on: true, sep: '-', areas: [{ code: 'ST', name: 'Studio' }, { code: 'PA', name: 'Participant app' }], types: {
  Business: { code: 'BR', area: true, digits: 2 }, Stakeholder: { code: 'SR', area: true, digits: 2 },
  Functional: { code: 'FR', area: true, digits: 3 }, 'Non-functional': { code: 'NFR', area: true, digits: 3 }, Transition: { code: 'TR', area: true, digits: 2 },
} }
const r = (id: string, type: string, parent: string, statement: string) => ({ ...emptyReq(id), type, parent, statement })
const rows = [r('ST-FR-002', 'Functional', 'ST-SR-01', 'Second'), r('ST-FR-001', 'Functional', 'ST-SR-01 Staff use', 'As a   user\nI want  SSO')]

describe('AI prompt', () => {
  it('lists every requirement as one compact line', () => {
    const p = buildSystemPrompt(rows, cfg)
    expect(p).toContain('ST-FR-001 | Functional | ST | ST-SR-01 Staff use | As a user I want SSO')
  })
  it('is deterministic (sorted by id) so it caches', () => {
    const p = buildSystemPrompt(rows, cfg)
    expect(p).toBe(buildSystemPrompt([...rows].reverse(), cfg))
    expect(p.indexOf('ST-FR-001 |')).toBeLessThan(p.indexOf('ST-FR-002 |'))
  })
  it('cuts long statements to 300 characters', () => {
    const p = buildSystemPrompt([r('X-1', 'Functional', '', 'a'.repeat(500))], cfg)
    const line = p.split('\n').find(l => l.startsWith('X-1 |'))!
    expect(line.split(' | ')[4].length).toBeLessThanOrEqual(300)
  })
  it('includes types, areas with names and the ID rule', () => {
    const p = buildSystemPrompt(rows, cfg)
    for (const t of cfg.lists.type) expect(p).toContain(t)
    expect(p).toContain('ST = Studio')
    expect(p).toContain('Never invent IDs for new items; use tmp-1, tmp-2')
  })
  it('parses a result and turns changes into a record', () => {
    const json = JSON.stringify({ summary: 's', structure: [], questions: ['q'], nextSteps: [], proposals: [{
      kind: 'update', tmpId: '', existingId: 'ST-FR-001', type: '', area: '', parent: '', statement: '', acceptance: '',
      priority: '', category: '', designRequired: '', changes: [{ field: 'statement', value: 'x' }], source: 'p1', reason: 'r' }] })
    const res = parseResult(json)
    expect(res.proposals[0].changes).toEqual({ statement: 'x' })
    expect(res.questions).toEqual(['q'])
  })
  it('throws bad-json on broken output', () => {
    expect(() => parseResult('{')).toThrow('bad-json')
  })
  it('schema requires every field and forbids extras', () => {
    expect(RESULT_SCHEMA.additionalProperties).toBe(false)
    expect(RESULT_SCHEMA.required).toEqual(['summary', 'structure', 'proposals', 'questions', 'nextSteps'])
  })
})
