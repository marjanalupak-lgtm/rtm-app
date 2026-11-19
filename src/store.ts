// Data layer. Uses Supabase when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set,
// otherwise a local (browser-only) demo store.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { FIELDS, type Req } from './model'

export type Change = { field: string; from: string; to: string }
export type HistoryEntry = { req_id: string; changed_at: string; changed_by: string; action: string; changes: Change[] }

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const sb: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null
export const mode: 'cloud' | 'local' = sb ? 'cloud' : 'local'

const COLS = FIELDS.map(f => f.key)

function clean(r: Req): Req {
  const o: Record<string, string> = {}
  for (const k of COLS) o[k] = String((r as Record<string, unknown>)[k] ?? '').trim()
  return o as unknown as Req
}

export function diff(a: Req | undefined, b: Req): Change[] {
  return COLS.filter(k => (a?.[k] ?? '') !== (b[k] ?? '')).map(k => ({
    field: FIELDS.find(f => f.key === k)!.label, from: String(a?.[k] ?? ''), to: String(b[k] ?? ''),
  }))
}

// ---------- local demo store ----------
const LK = 'rtm.rows.v1', LH = 'rtm.history.v1'
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

// ---------- API ----------
export async function currentUser(): Promise<string> {
  if (!sb) return 'local user'
  const { data } = await sb.auth.getUser()
  return data.user?.email ?? 'unknown'
}

export async function listReqs(): Promise<Req[]> {
  if (!sb) return read<Req[]>(LK, [])
  const { data, error } = await sb.from('requirements').select('*').order('id')
  if (error) throw error
  return data as Req[]
}

export async function saveReq(r: Req, prev: Req | undefined, action = prev ? 'update' : 'create'): Promise<void> {
  const row = clean(r)
  const changes = diff(prev, row)
  if (prev && !changes.length) return
  const who = await currentUser()
  const now = new Date().toISOString()
  const h: HistoryEntry = { req_id: row.id, changed_at: now, changed_by: who, action, changes }
  if (!sb) {
    const rows = read<Req[]>(LK, [])
    const i = rows.findIndex(x => x.id === row.id)
    const full = { ...row, updated_at: now, updated_by: who }
    if (i >= 0) rows[i] = full; else rows.push(full)
    write(LK, rows)
    write(LH, [h, ...read<HistoryEntry[]>(LH, [])].slice(0, 5000))
    return
  }
  const { error } = await sb.from('requirements').upsert({ ...row, updated_at: now, updated_by: who })
  if (error) throw error
  await sb.from('requirement_history').insert(h)
}

export async function bulkSave(rows: Req[], existing: Req[]): Promise<number> {
  const byId = new Map(existing.map(r => [r.id, r]))
  let n = 0
  for (const r of rows) {
    if (!r.id) continue
    const prev = byId.get(r.id)
    if (prev && !diff(prev, clean(r)).length) continue
    await saveReq(r, prev, prev ? 'import-update' : 'import')
    n++
  }
  return n
}

export async function deleteReq(r: Req): Promise<void> {
  const who = await currentUser()
  const h: HistoryEntry = { req_id: r.id, changed_at: new Date().toISOString(), changed_by: who, action: 'delete', changes: [] }
  if (!sb) {
    write(LK, read<Req[]>(LK, []).filter(x => x.id !== r.id))
    write(LH, [h, ...read<HistoryEntry[]>(LH, [])])
    return
  }
  const { error } = await sb.from('requirements').delete().eq('id', r.id)
  if (error) throw error
  await sb.from('requirement_history').insert(h)
}

export async function history(id?: string): Promise<HistoryEntry[]> {
  if (!sb) return read<HistoryEntry[]>(LH, []).filter(h => !id || h.req_id === id)
  let q = sb.from('requirement_history').select('*').order('changed_at', { ascending: false }).limit(500)
  if (id) q = q.eq('req_id', id)
  const { data, error } = await q
  if (error) throw error
  return data as HistoryEntry[]
}

export function subscribe(onChange: () => void): () => void {
  if (!sb) {
    const h = (e: StorageEvent) => { if (e.key === LK) onChange() }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }
  const ch = sb.channel('rtm').on('postgres_changes', { event: '*', schema: 'public', table: 'requirements' }, onChange).subscribe()
  return () => { sb.removeChannel(ch) }
}

// ---------- auth (cloud only) ----------
export async function getSession(): Promise<Session | null> {
  if (!sb) return null
  return (await sb.auth.getSession()).data.session
}
export function onAuth(cb: (s: Session | null) => void): () => void {
  if (!sb) return () => {}
  const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s))
  return () => data.subscription.unsubscribe()
}
export async function sendMagicLink(email: string) {
  if (!sb) return
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split('#')[0] } })
  if (error) throw error
}
export async function signOut() { await sb?.auth.signOut() }
