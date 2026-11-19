import { describe, it, expect } from 'vitest'
import { configFromKeys, sameColumns, allViews, PRESETS } from './tableViews'

const ALL = ['id', 'statement', 'check', 'status', 'priority', 'test_case', 'defect', 'owner']

describe('table views', () => {
  it('shows chosen keys in order, pins ID, hides the rest', () => {
    const c = configFromKeys(ALL, ['id', 'statement', 'defect', 'nope'])
    const visible = Object.entries(c).filter(([, v]) => v.isVisible).sort((a, b) => a[1].order!.localeCompare(b[1].order!)).map(([k]) => k)
    expect(visible).toEqual(['id', 'statement', 'defect'])
    expect(c.id.fix).toBe('left')
    expect(c.owner.isVisible).toBe(false)
    expect(c.nope).toBeUndefined()
  })
  it('sameColumns ignores hidden columns and unset widths', () => {
    const a = configFromKeys(ALL, ['id', 'statement', 'status'])
    const base = configFromKeys(ALL, ['id', 'statement', 'status'])
    const b = { ...base, status: { ...base.status, width: 200 } }
    expect(sameColumns(a, b)).toBe(true)
    expect(sameColumns(a, configFromKeys(ALL, ['id', 'status', 'statement']))).toBe(false)
    expect(sameColumns(a, configFromKeys(ALL, ['id', 'statement']))).toBe(false)
  })
  it('built-ins can be overridden; custom views follow', () => {
    const override = configFromKeys(ALL, ['id', 'statement'])
    const v = allViews({ custom: [{ id: 'v_1', name: 'Mine', columns: override }], overrides: { testing: override }, active: 'default', removed: [], names: {} }, ALL)
    expect(v.map(x => x.name)).toEqual([...PRESETS.map(p => p.name), 'Mine'])
    expect(v.find(x => x.id === 'testing')!.columns).toBe(override)
    expect(v.find(x => x.id === 'default')!.columns).toBeUndefined()
  })
  it('deleted built-ins are hidden, Default always stays', () => {
    const v = allViews({ custom: [], overrides: {}, active: 'default', removed: ['design', 'default'], names: { testing: 'QA' } }, ALL)
    expect(v.map(x => x.id)).toEqual(['default', 'testing', 'delivery'])
    expect(v[1].name).toBe('QA')
  })
})
