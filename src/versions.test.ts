import { describe, expect, it } from 'vitest'
import { isNewVersion, numberVersions, splitCells, versionOf, versionsFor, VERSIONED, type Version } from './versions'
import { emptyReq } from './model'

const base = { ...emptyReq('ST-FR-001'), statement: 'Sign in with SSO', acceptance: 'Given…', type: 'Functional', parent: 'ST-SR-01', status: 'Draft' }
const v = (version: number, id = 'ST-FR-001'): Version => ({ req_id: id, version, saved_at: '2026-11-1' + version, saved_by: 'a@b', snapshot: { ...base, id } })

describe('requirement versions', () => {
  it('a change to the meaning starts a new version', () => {
    for (const k of VERSIONED) expect(isNewVersion(base, { ...base, [k]: base[k] + ' changed' })).toBe(true)
  })
  it('process changes (status, delivery, tests, links) keep the same version', () => {
    expect(isNewVersion(base, { ...base, status: 'Approved', delivery: 'Done', test_case: 'TC-1', design_link: 'https://figma', defect: 'D-1' })).toBe(false)
  })
  it('whitespace-only edits are not a new version', () => {
    expect(isNewVersion(base, { ...base, statement: '  Sign in with SSO \n' })).toBe(false)
  })
  it('a new requirement is not a version change', () => {
    expect(isNewVersion(undefined, base)).toBe(false)
  })
  it('current version = saved old versions + 1', () => {
    const all = [v(1), v(2), v(1, 'OTHER-1')]
    expect(versionOf('ST-FR-001', all)).toBe(3)
    expect(versionOf('NEW-1', all)).toBe(1)
  })
  it('lists one requirement\'s old versions, newest first', () => {
    expect(versionsFor('ST-FR-001', [v(1), v(1, 'OTHER-1'), v(2)]).map(x => x.version)).toEqual([2, 1])
  })
})

describe('versions — review fixes', () => {
  it('numbers versions by their order per requirement, ignoring stored numbers', () => {
    const list = [v(1), v(1, 'OTHER-1'), v(3), v(3)]   // duplicate / gap from a failed save or a deleted row
    expect(numberVersions(list).filter(x => x.req_id === 'ST-FR-001').map(x => x.version)).toEqual([1, 2, 3])
  })
  it('splits a long snapshot into cell-sized parts and joins them back', () => {
    const json = 'x'.repeat(100_000)
    const parts = splitCells(json)
    expect(parts.every(p => p.length <= 45_000)).toBe(true)
    expect(parts.join('')).toBe(json)
  })
})
