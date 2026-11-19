import { describe, expect, it } from 'vitest'
import { detectScheme, nextSchemeId, parseId, example } from './idScheme'
import { emptyReq, LISTS } from './model'

const req = (id: string, type: string) => ({ ...emptyReq(id), type })
const TYPES = [...LISTS.type]
const rows = [
  req('BR-01', 'Business'), req('BR-10', 'Business'), req('SR-31', 'Stakeholder'),
  req('ST-FR-001', 'Functional'), req('ST-FR-089', 'Functional'), req('PA-FR-064', 'Functional'),
  req('SH-NFR-010', 'Non-functional'), req('ST-TR-08', 'Transition'),
]

describe('ID structure', () => {
  it('parses area-type-number and type-number', () => {
    expect(parseId('ST-FR-001')).toEqual({ area: 'ST', code: 'FR', num: '001' })
    expect(parseId('BR-01')).toEqual({ code: 'BR', num: '01' })
    expect(parseId('free text')).toBeNull()
  })
  it('detects codes, areas and digits from existing IDs', () => {
    const s = detectScheme(rows, TYPES)
    expect(s.on).toBe(true)
    expect(s.areas.map(a => a.code)).toEqual(['ST', 'PA', 'SH'])
    expect(s.types['Business']).toEqual({ code: 'BR', area: false, digits: 2 })
    expect(s.types['Functional']).toEqual({ code: 'FR', area: true, digits: 3 })
    expect(s.types['Transition']).toEqual({ code: 'TR', area: true, digits: 2 })
    expect(example(s, 'Non-functional')).toBe('ST-NFR-001')
  })
  it('keeps area names the user already typed', () => {
    const prev = { ...detectScheme(rows, TYPES), areas: [{ code: 'ST', name: 'Staff' }] }
    expect(detectScheme(rows, TYPES, prev).areas[0]).toEqual({ code: 'ST', name: 'Staff' })
  })
  it('gives the next free number per type and area', () => {
    const s = detectScheme(rows, TYPES)
    expect(nextSchemeId(rows, s, 'Functional', 'ST')).toBe('ST-FR-090')
    expect(nextSchemeId(rows, s, 'Functional', 'SH')).toBe('SH-FR-001')
    expect(nextSchemeId(rows, s, 'Business')).toBe('BR-11')
    expect(nextSchemeId(rows, s, 'Functional')).toBeNull()   // needs an area
  })
})
