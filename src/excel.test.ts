import { describe, expect, it } from 'vitest'
import { exportColumns, versionSheet } from './excel'
import { defaultConfig } from './config'
import { emptyReq } from './model'

describe('Excel export', () => {
  it('adds Area and Area name after the ID when IDs are structured', () => {
    const cfg = defaultConfig()
    cfg.id.scheme = { on: true, sep: '-', areas: [{ code: 'PA', name: 'Participant app' }], types: {} }
    const cols = exportColumns(cfg)
    expect(cols.slice(0, 4).map(c => c.label)).toEqual(['Requirement ID*', 'Version', 'Area', 'Area name'])
    const r = emptyReq('PA-FR-001')
    expect(cols.slice(2, 4).map(c => c.get(r))).toEqual(['PA', 'Participant app'])
    expect(cols[2].get(emptyReq('BR-01'))).toBe('')
  })
  it('no Area column without structured IDs', () => {
    expect(exportColumns(defaultConfig()).some(c => c.label === 'Area')).toBe(false)
  })
})

describe('Excel export — versions', () => {
  const v = { req_id: 'PA-FR-001', version: 1, saved_at: '2026-11-19T10:00:00Z', saved_by: 'a@b', snapshot: { ...emptyReq('PA-FR-001'), statement: 'old', test_case: 'TC-9' } }
  it('has a Version column after the ID showing the current version', () => {
    const cols = exportColumns(defaultConfig(), [v])
    expect(cols[1].label).toBe('Version')
    expect(cols[1].get(emptyReq('PA-FR-001'))).toBe('v2')
    expect(cols[1].get(emptyReq('X-1'))).toBe('v1')
  })
  it('old versions go to their own sheet with every field', () => {
    const { head, rows } = versionSheet([v], defaultConfig(), ['PA-FR-001'])
    expect(head.slice(0, 4)).toEqual(['Requirement ID', 'Version', 'Replaced at', 'Replaced by'])
    expect(rows[0].slice(0, 2)).toEqual(['PA-FR-001', 'v1'])
    expect(rows[0]).toContain('old'); expect(rows[0]).toContain('TC-9')
  })
  it('the versions sheet follows the exported (filtered) requirements', () => {
    expect(versionSheet([v], defaultConfig(), ['OTHER-1']).rows).toEqual([])
  })
})
