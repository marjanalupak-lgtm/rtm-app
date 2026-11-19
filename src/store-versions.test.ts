import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
const mem = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } })
const store = await import('./store')
const { emptyReq } = await import('./model')

const r1 = { ...emptyReq('A-1'), statement: 'old text', test_case: 'TC-1', type: 'Functional' }

describe('versions in the store (local)', () => {
  beforeEach(() => mem.clear())
  it('changing the text keeps the old version with its links', async () => {
    await store.saveReq('p1', r1, undefined)
    await store.saveReq('p1', { ...r1, statement: 'new text' }, r1)
    const vs = await store.listVersions('p1')
    expect(vs).toHaveLength(1)
    expect(vs[0]).toMatchObject({ req_id: 'A-1', version: 1, snapshot: { statement: 'old text', test_case: 'TC-1' } })
    const h = (await store.history('p1', 'A-1'))[0]
    expect(h.changes).toContainEqual({ field: 'Version', from: 'v1', to: 'v2' })
  })
  it('a status change does not create a version', async () => {
    await store.saveReq('p1', r1, undefined)
    await store.saveReq('p1', { ...r1, status: 'Approved' }, r1)
    expect(await store.listVersions('p1')).toEqual([])
  })
  it('the third meaning change is saved as version 2', async () => {
    await store.saveReq('p1', r1, undefined)
    const r2 = { ...r1, statement: 'v2 text' }; await store.saveReq('p1', r2, r1)
    await store.saveReq('p1', { ...r2, acceptance: 'Given X' }, r2)
    expect((await store.listVersions('p1')).map(v => [v.version, v.snapshot.statement])).toEqual([[1, 'old text'], [2, 'v2 text']])
  })
  it('import updates create versions too', async () => {
    await store.saveReq('p1', r1, undefined)
    await store.bulkSave('p1', [{ ...r1, statement: 'imported' }], [r1])
    expect((await store.listVersions('p1'))[0].snapshot.statement).toBe('old text')
  })
  it('renaming an ID keeps its versions', async () => {
    await store.saveReq('p1', r1, undefined)
    await store.saveReq('p1', { ...r1, statement: 'new' }, r1)
    await store.renameIds('p1', { 'A-1': 'B-1' })
    expect((await store.listVersions('p1'))[0].req_id).toBe('B-1')
  })
})

describe('versions — deleted requirements', () => {
  beforeEach(() => mem.clear())
  it('a deleted requirement takes its versions with it; a new one with the same ID starts at v1', async () => {
    await store.saveReq('p1', r1, undefined)
    await store.saveReq('p1', { ...r1, statement: 'new' }, r1)
    await store.deleteReq('p1', { ...r1, statement: 'new' })
    await store.saveReq('p1', { ...r1, statement: 'unrelated' }, undefined)
    const vs = await store.listVersions('p1')
    expect(vs.filter(v => v.req_id === 'A-1')).toEqual([])
    expect(vs[0].req_id).toMatch(/^A-1 \(deleted /)
  })
})
