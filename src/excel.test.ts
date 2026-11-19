import { describe, expect, it } from 'vitest'
import { exportColumns } from './excel'
import { defaultConfig } from './config'
import { emptyReq } from './model'

describe('Excel export', () => {
  it('adds Area and Area name after the ID when IDs are structured', () => {
    const cfg = defaultConfig()
    cfg.id.scheme = { on: true, sep: '-', areas: [{ code: 'PA', name: 'Participant app' }], types: {} }
    const cols = exportColumns(cfg)
    expect(cols.slice(0, 3).map(c => c.label)).toEqual(['Requirement ID*', 'Area', 'Area name'])
    const r = emptyReq('PA-FR-001')
    expect(cols.slice(1, 3).map(c => c.get(r))).toEqual(['PA', 'Participant app'])
    expect(cols[1].get(emptyReq('BR-01'))).toBe('')
  })
  it('no Area column without structured IDs', () => {
    expect(exportColumns(defaultConfig()).some(c => c.label === 'Area')).toBe(false)
  })
})
