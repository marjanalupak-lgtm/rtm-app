// Data layer. Uses Supabase when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set,
// otherwise a local (browser-only) demo store.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { FIELDS, type Req } from './model'

export type Change = { field: string; from: string; to: string }
export type HistoryEntry = { project_id: string; req_id: string; changed_at: string; changed_by: string; action: string; changes: Change[] }
export type Project = { id: string; name: string; organization: string; description: string; status: string; created_by?: string; created_at?: string }
export type Member = { project_id: string; email: string; role: 'owner' | 'member' }

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
const LK = 'rtm.rows.v2', LH = 'rtm.history.v2', LP = 'rtm.projects.v1'
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }
type LocalReq = Req & { project_id: string }

// ---------- auth ----------
export async function currentUser(): Promise<string> {
  if (!sb) return 'local user'
  const { data } = await sb.auth.getUser()
  return data.user?.email ?? 'unknown'
}
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

// ---------- projects ----------
export async function listProjects(): Promise<Project[]> {
  if (!sb) return read<Project[]>(LP, [])
  const { data, error } = await sb.from('projects').select('*').order('name')
  if (error) throw error
  return data as Project[]
}

export async function saveProject(p: Project): Promise<Project> {
  const row = { name: p.name.trim(), organization: p.organization.trim(), description: p.description.trim(), status: p.status || 'Active' }
  if (!sb) {
    const all = read<Project[]>(LP, [])
    const saved = { ...p, ...row, id: p.id || crypto.randomUUID(), created_at: p.created_at || new Date().toISOString() }
    const i = all.findIndex(x => x.id === saved.id)
    if (i >= 0) all[i] = saved; else all.push(saved)
    write(LP, all)
    return saved
  }
  const q = p.id ? sb.from('projects').update(row).eq('id', p.id) : sb.from('projects').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data as Project
}

export async function deleteProject(id: string): Promise<void> {
  if (!sb) {
    write(LP, read<Project[]>(LP, []).filter(p => p.id !== id))
    write(LK, read<LocalReq[]>(LK, []).filter(r => r.project_id !== id))
    return
  }
  const { error } = await sb.from('projects').delete().eq('id', id)
  if (error) throw error
}

export async function projectStats(): Promise<Record<string, Req[]>> {
  // Rows for every visible project (used for project cards).
  const rows: LocalReq[] = sb
    ? ((await sb.from('requirements').select('*')).data ?? []) as LocalReq[]
    : read<LocalReq[]>(LK, [])
  const out: Record<string, Req[]> = {}
  for (const r of rows) (out[r.project_id] ??= []).push(r)
  return out
}

// ---------- members (cloud only) ----------
export async function listMembers(projectId: string): Promise<Member[]> {
  if (!sb) return []
  const { data, error } = await sb.from('project_members').select('*').eq('project_id', projectId).order('role', { ascending: false })
  if (error) throw error
  return data as Member[]
}
export async function addMember(projectId: string, email: string, role: Member['role']) {
  if (!sb) return
  const { error } = await sb.from('project_members').upsert({ project_id: projectId, email: email.trim().toLowerCase(), role })
  if (error) throw error
}
export async function removeMember(projectId: string, email: string) {
  if (!sb) return
  const { error } = await sb.from('project_members').delete().eq('project_id', projectId).eq('email', email)
  if (error) throw error
}

// ---------- requirements ----------
export async function listReqs(projectId: string): Promise<Req[]> {
  if (!sb) return read<LocalReq[]>(LK, []).filter(r => r.project_id === projectId)
  const { data, error } = await sb.from('requirements').select('*').eq('project_id', projectId).order('id')
  if (error) throw error
  return data as Req[]
}

export async function saveReq(projectId: string, r: Req, prev: Req | undefined, action = prev ? 'update' : 'create'): Promise<void> {
  const row = clean(r)
  const changes = diff(prev, row)
  if (prev && !changes.length) return
  const who = await currentUser()
  const now = new Date().toISOString()
  const h: HistoryEntry = { project_id: projectId, req_id: row.id, changed_at: now, changed_by: who, action, changes }
  if (!sb) {
    const rows = read<LocalReq[]>(LK, [])
    const i = rows.findIndex(x => x.project_id === projectId && x.id === row.id)
    const full = { ...row, project_id: projectId, updated_at: now, updated_by: who }
    if (i >= 0) rows[i] = full; else rows.push(full)
    write(LK, rows)
    write(LH, [h, ...read<HistoryEntry[]>(LH, [])].slice(0, 5000))
    return
  }
  const { error } = await sb.from('requirements').upsert({ ...row, project_id: projectId, updated_at: now, updated_by: who })
  if (error) throw error
  await sb.from('requirement_history').insert(h)
}

export async function bulkSave(projectId: string, rows: Req[], existing: Req[]): Promise<number> {
  const byId = new Map(existing.map(r => [r.id, r]))
  let n = 0
  for (const r of rows) {
    if (!r.id) continue
    const prev = byId.get(r.id)
    if (prev && !diff(prev, clean(r)).length) continue
    await saveReq(projectId, r, prev, prev ? 'import-update' : 'import')
    n++
  }
  return n
}

export async function deleteReq(projectId: string, r: Req): Promise<void> {
  const who = await currentUser()
  const h: HistoryEntry = { project_id: projectId, req_id: r.id, changed_at: new Date().toISOString(), changed_by: who, action: 'delete', changes: [] }
  if (!sb) {
    write(LK, read<LocalReq[]>(LK, []).filter(x => !(x.project_id === projectId && x.id === r.id)))
    write(LH, [h, ...read<HistoryEntry[]>(LH, [])])
    return
  }
  const { error } = await sb.from('requirements').delete().eq('project_id', projectId).eq('id', r.id)
  if (error) throw error
  await sb.from('requirement_history').insert(h)
}

export async function history(projectId: string, id?: string): Promise<HistoryEntry[]> {
  if (!sb) return read<HistoryEntry[]>(LH, []).filter(h => h.project_id === projectId && (!id || h.req_id === id))
  let q = sb.from('requirement_history').select('*').eq('project_id', projectId).order('changed_at', { ascending: false }).limit(500)
  if (id) q = q.eq('req_id', id)
  const { data, error } = await q
  if (error) throw error
  return data as HistoryEntry[]
}

export function subscribe(projectId: string, onChange: () => void): () => void {
  if (!sb) {
    const h = (e: StorageEvent) => { if (e.key === LK) onChange() }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }
  const ch = sb.channel('rtm-' + projectId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requirements', filter: `project_id=eq.${projectId}` }, onChange)
    .subscribe()
  return () => { sb.removeChannel(ch) }
}
