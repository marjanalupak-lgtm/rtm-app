import { describe, expect, it } from 'vitest'
import { applyRename, planRename, replaceIds, toMap } from './idRename'
import { detectScheme } from './idScheme'
import { emptyReq, LISTS } from './model'

const req = (id: string, type: string, parent = '', dependency = '') => ({ ...emptyReq(id), type, parent, dependency })
const TYPES = [...LISTS.type]
const rows = [
  req('BR-01', 'Business'), req('SR-01', 'Stakeholder', 'BR-01 Effortless access'),
  req('ST-FR-001', 'Functional', 'SR-01 Staff use one identity', 'ST-FR-0010, ST-FR-002'),
  req('ST-FR-002', 'Functional', 'SR-01'), req('PA-FR-001', 'Functional', 'SR-01'),
]
const s = detectScheme(rows, TYPES)

describe('ID rename', () => {
  it('replaces whole IDs only', () => {
    expect(replaceIds('BR-01 Effortless, BR-010, XBR-01, (BR-01)', { 'BR-01': 'BO-01' })).toBe('BO-01 Effortless, BR-010, XBR-01, (BO-01)')
    expect(replaceIds('A-1, B-1', { 'A-1': 'B-1', 'B-1': 'A-1' })).toBe('B-1, A-1')   // swap, no chain
  })
  it('renames IDs and the links to them', () => {
    const ch = applyRename(rows, { 'SR-01': 'SR-001', 'ST-FR-002': 'ST-FR-099' })
    expect(ch.map(c => c.after.id)).toEqual(['SR-001', 'ST-FR-001', 'ST-FR-099', 'PA-FR-001'])
    expect(ch[1].after.parent).toBe('SR-001 Staff use one identity')
    expect(ch[1].after.dependency).toBe('ST-FR-0010, ST-FR-099')
  })
  it('plans a new type code and area code', () => {
    const next = structuredClone(s)
    next.types['Functional'].code = 'FN'
    next.areas[0].code = 'SF'
    next.types['Stakeholder'].digits = 3
    expect(planRename(rows, s, next).items.map(i => `${i.from}>${i.to}`)).toEqual(
      ['SR-01>SR-001', 'ST-FR-001>SF-FN-001', 'ST-FR-002>SF-FN-002', 'PA-FR-001>PA-FN-001'])
  })
  it('a type change gets the next free number when the ID is taken', () => {
    const changed = rows.map(r => r.id === 'ST-FR-002' ? { ...r, type: 'Non-functional' } : r)
    const extra = [...changed, req('ST-NFR-002', 'Non-functional')]
    const p = planRename(extra, s, s)
    expect(p.items).toEqual([{ from: 'ST-FR-002', to: 'ST-NFR-003', renumbered: true }])
    expect(toMap(p.items)).toEqual({ 'ST-FR-002': 'ST-NFR-003' })
  })
  it('nothing to do when IDs already follow the structure', () => {
    expect(planRename(rows, s, s).items).toEqual([])
  })
})
