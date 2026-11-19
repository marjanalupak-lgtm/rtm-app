import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')

const mem = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } })
const store = await import('../store')
const { emptyReq } = await import('../model')

describe('applyIntake (local store)', () => {
  beforeEach(() => mem.clear())
  it('creates new rows and applies updates with AI history actions', async () => {
    const old = { ...emptyReq('A-1'), statement: 'old' }
    await store.saveReq('p1', old, undefined)
    const res = await store.applyIntake('p1', { creates: [{ ...emptyReq('A-2'), statement: 'new' }], updates: [{ prev: old, next: { ...old, statement: 'changed' } }] }, [old])
    expect(res).toEqual({ created: 1, updated: 1, skipped: [] })
    const rows = await store.listReqs('p1')
    expect(rows.map(r => [r.id, r.statement])).toEqual([['A-1', 'changed'], ['A-2', 'new']])
    const actions = (await store.history('p1')).map(h => h.action)
    expect(actions).toContain('ai-intake'); expect(actions).toContain('ai-update')
  })
})
