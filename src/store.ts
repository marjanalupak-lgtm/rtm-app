// Data layer.
// - Google mode (VITE_GOOGLE_CLIENT_ID set): every project is a Google Sheet in the user's Drive (folder "RTM"),
//   with sheets Requirements / History / Meta. Access = Google Drive sharing. No other server sees the data.
// - Local mode (no client ID): browser-only demo store.
import { FIELDS, type Req, type Attachment } from './model'
import { applyRename, type RenameMap } from './idRename'
import { isNewVersion, type Version } from './versions'
import { normalize, type Config } from './config'
import * as G from './google'

export type Change = { field: string; from: string; to: string }
export type HistoryEntry = { project_id: string; req_id: string; changed_at: string; changed_by: string; action: string; changes: Change[] }
export type Project = {
  id: string; name: string; organization: string; description: string; status: string; config?: Config
  deleted_at?: string | null; deleted_by?: string | null; created_by?: string; created_at?: string
  owner?: string; isOwner?: boolean; canEdit?: boolean; url?: string
}
export type Member = { project_id: string; email: string; role: 'owner' | 'member' | 'viewer'; permId?: string; name?: string }

export const mode: 'google' | 'local' = G.CLIENT_ID ? 'google' : 'local'
const GOOGLE = mode === 'google'

const COLS = FIELDS.map(f => f.key)

function clean(r: Req): Req {
  const o: Record<string, unknown> = {}
  for (const k of COLS) o[k] = String((r as Record<string, unknown>)[k] ?? '').trim()
  const extra: Record<string, string> = {}
  for (const [k, v] of Object.entries(r.extra ?? {})) if (String(v ?? '').trim()) extra[k] = String(v).trim()
  o.extra = extra
  o.attachments = (r.attachments ?? []).filter(a => a && a.url)
  return o as unknown as Req
}

export function diff(a: Req | undefined, b: Req, labels: (k: string) => string = k => FIELDS.find(f => f.key === k)?.label ?? k): Change[] {
  const out: Change[] = COLS.filter(k => String(a?.[k] ?? '') !== String(b[k] ?? '')).map(k => ({ field: labels(k), from: String(a?.[k] ?? ''), to: String(b[k] ?? '') }))
  const keys = new Set([...Object.keys(a?.extra ?? {}), ...Object.keys(b.extra ?? {})])
  for (const k of keys) {
    const x = String(a?.extra?.[k] ?? ''), y = String(b.extra?.[k] ?? '')
    if (x !== y) out.push({ field: labels(k), from: x, to: y })
  }
  const names = (r?: Req) => (r?.attachments ?? []).map(a => a.name).join(', ')
  const sig = (r?: Req) => (r?.attachments ?? []).map(a => a.id).join('|')
  if (sig(a) !== sig(b)) out.push({ field: 'Attachments & links', from: names(a), to: names(b) })
  return out
}
let labelFn: ((k: string) => string) | undefined
export function setLabels(fn: (k: string) => string) { labelFn = fn }

// ---------- auth ----------
export const currentUser = async () => (GOOGLE ? G.currentEmail() : 'local user') ?? 'unknown'
export const signedInEmail = () => (GOOGLE ? G.currentEmail() : 'local user')
export const signIn = () => G.signIn()
export const signOut = () => G.signOut()
export const onAuthChange = G.onAuthChange
export { AuthError } from './google'

// ======================================================================
// Google Sheets backend
// ======================================================================
const REQ_COLS = [...COLS, 'extra', 'updated_at', 'updated_by', 'attachments'] as const
const REQ_HEAD = [...FIELDS.map(f => f.label), 'Custom fields (JSON)', 'Updated at', 'Updated by', 'Attachments & links (JSON)']
const HIST_HEAD = ['Changed at', 'Changed by', 'Action', 'Requirement ID', 'Changes (JSON)']
const col = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const LAST = col(REQ_COLS.length - 1)
const enc = encodeURIComponent

type Meta = { organization?: string; description?: string; status?: string; config?: unknown; created_by?: string; created_at?: string }
type DriveFile = { id: string; name: string; trashed?: boolean; webViewLink?: string; appProperties?: Record<string, string>; owners?: { emailAddress: string }[]; capabilities?: { canEdit?: boolean } }

function rowToReq(row: string[]): Req {
  const o: Record<string, unknown> = {}
  REQ_COLS.forEach((k, i) => { o[k] = row[i] ?? '' })
  try { o.extra = o.extra ? JSON.parse(String(o.extra)) : {} } catch { o.extra = {} }
  try { o.attachments = o.attachments ? JSON.parse(String(o.attachments)) : [] } catch { o.attachments = [] }
  return o as unknown as Req
}
function reqToRow(r: Req, who: string, now: string): string[] {
  const c = clean(r)
  return [...COLS.map(k => String(c[k] ?? '')), Object.keys(c.extra ?? {}).length ? JSON.stringify(c.extra) : '', now, who, c.attachments?.length ? JSON.stringify(c.attachments) : '']
}
const same = (a: Req, b: Req) => diff(clean(a), clean(b)).length === 0

async function getValues(id: string, range: string): Promise<string[][]> {
  const r = await G.api<{ values?: string[][] }>(`${G.SHEETS}/${id}/values/${enc(range)}`)
  return r.values ?? []
}
async function putValues(id: string, range: string, values: string[][]) {
  await G.api(`${G.SHEETS}/${id}/values/${enc(range)}${G.q({ valueInputOption: 'RAW' })}`, { method: 'PUT', body: JSON.stringify({ values }) })
}
async function appendValues(id: string, range: string, values: string[][]) {
  if (!values.length) return
  await G.api(`${G.SHEETS}/${id}/values/${enc(range)}:append${G.q({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' })}`, { method: 'POST', body: JSON.stringify({ values }) })
}
async function readMeta(id: string): Promise<Meta> {
  const v = await getValues(id, 'Meta!A1')
  try { return JSON.parse(v[0]?.[0] ?? '{}') } catch { return {} }
}
const writeMeta = (id: string, m: Meta) => putValues(id, 'Meta!A1:A2', [[JSON.stringify(m)], ['Managed by the RTM app — please do not edit this sheet.']])

let rootId: string | null = null
async function ensureRoot(): Promise<string> {
  if (rootId) return rootId
  const r = await G.api<{ files: DriveFile[] }>(G.DRIVE + G.q({ q: "appProperties has { key='rtm' and value='root' } and trashed=false and 'me' in owners", fields: 'files(id)' }))
  if (r.files[0]) return rootId = r.files[0].id
  const f = await G.api<DriveFile>(G.DRIVE + G.q({ fields: 'id' }), { method: 'POST', body: JSON.stringify({ name: 'RTM', mimeType: 'application/vnd.google-apps.folder', appProperties: { rtm: 'root' } }) })
  return rootId = f.id
}

// Older project sheets were created before a column existed: write the full header row once per session.
const headerOk = new Set<string>()
async function ensureHeader(id: string) {
  if (headerOk.has(id)) return
  const h = await getValues(id, `Requirements!A1:${LAST}1`)
  if ((h[0]?.length ?? 0) < REQ_HEAD.length) await putValues(id, `Requirements!A1:${LAST}1`, [REQ_HEAD])
  headerOk.add(id)
}

// Old versions of requirements live in sheet "Versions" (added on first use): ID | Version | Saved at | Saved by | Snapshot JSON.
const VER_HEAD = ['Requirement ID', 'Version', 'Saved at', 'Saved by', 'Snapshot (JSON)']
const verSheet = new Set<string>()
async function hasVersionsSheet(id: string): Promise<boolean> {
  if (verSheet.has(id)) return true
  const s = await G.api<{ sheets: { properties: { title: string } }[] }>(`${G.SHEETS}/${id}${G.q({ fields: 'sheets.properties(title)' })}`)
  const ok = s.sheets.some(x => x.properties.title === 'Versions')
  if (ok) verSheet.add(id)
  return ok
}
async function ensureVersionsSheet(id: string) {
  if (await hasVersionsSheet(id)) return
  await G.api(`${G.SHEETS}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Versions', gridProperties: { frozenRowCount: 1 } } } }] }) })
  await putValues(id, 'Versions!A1:E1', [VER_HEAD])
  verSheet.add(id)
}
const rowToVersion = (x: string[]): Version | null => {
  try { return { req_id: x[0] ?? '', version: Number(x[1]) || 1, saved_at: x[2] ?? '', saved_by: x[3] ?? '', snapshot: JSON.parse(x[4] || '{}') } } catch { return null }
}
// Archive the stored rows that are about to change meaning; returns "v1 → v2" per ID for history.
async function archiveVersions(id: string, olds: Req[], who: string, now: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!olds.length) return out
  await ensureVersionsSheet(id)
  const ids = (await getValues(id, 'Versions!A2:A')).map(x => x[0] ?? '')
  const rows = olds.map(o => {
    const n = ids.filter(x => x === o.id).length + 1
    ids.push(o.id); out.set(o.id, n)
    return [o.id, String(n), now, who, JSON.stringify(clean(o))]
  })
  await appendValues(id, 'Versions!A1:E1', rows)
  return out
}
const versionChange = (n: number): Change => ({ field: 'Version', from: 'v' + n, to: 'v' + (n + 1) })

// Attachment files live in the uploader's Drive (folder RTM/Attachments) and are shared read-only with project members.
let attFolder: string | null = null
async function ensureAttachmentFolder(): Promise<string> {
  if (attFolder) return attFolder
  const root = await ensureRoot()
  const r = await G.api<{ files: DriveFile[] }>(G.DRIVE + G.q({ q: "appProperties has { key='rtm' and value='attachments' } and trashed=false and 'me' in owners", fields: 'files(id)' }))
  if (r.files[0]) return attFolder = r.files[0].id
  const f = await G.api<DriveFile>(G.DRIVE + G.q({ fields: 'id' }), { method: 'POST', body: JSON.stringify({ name: 'Attachments', mimeType: 'application/vnd.google-apps.folder', parents: [root], appProperties: { rtm: 'attachments' } }) })
  return attFolder = f.id
}
async function memberEmails(projectId: string): Promise<{ email: string; role: string }[]> {
  try {
    const r = await G.api<{ permissions: { emailAddress?: string; role: string; type: string }[] }>(`${G.DRIVE}/${projectId}/permissions${G.q({ fields: 'permissions(emailAddress,role,type)' })}`)
    return r.permissions.filter(p => p.type === 'user' && p.emailAddress).map(p => ({ email: p.emailAddress!.toLowerCase(), role: p.role }))
  } catch { return [] }   // non-owners may not be allowed to list permissions
}
async function shareRead(fileId: string, email: string) {
  await G.api(`${G.DRIVE}/${fileId}/permissions${G.q({ sendNotificationEmail: false })}`, { method: 'POST', body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email }) }).catch(() => {})
}

const sheetIds = new Map<string, number>()
async function reqSheetId(id: string): Promise<number> {
  if (sheetIds.has(id)) return sheetIds.get(id)!
  const s = await G.api<{ sheets: { properties: { sheetId: number; title: string } }[] }>(`${G.SHEETS}/${id}${G.q({ fields: 'sheets.properties(sheetId,title)' })}`)
  const sid = s.sheets.find(x => x.properties.title === 'Requirements')?.properties.sheetId ?? 0
  sheetIds.set(id, sid)
  return sid
}

const gdrive = {
  async listProjects(): Promise<Project[]> {
    const me = G.currentEmail()
    const r = await G.api<{ files: DriveFile[] }>(G.DRIVE + G.q({
      q: "appProperties has { key='rtm' and value='project' }", pageSize: 200,
      fields: 'files(id,name,trashed,webViewLink,appProperties,owners(emailAddress),capabilities(canEdit))',
    }))
    return Promise.all(r.files.map(async f => {
      const m = await readMeta(f.id).catch(() => ({} as Meta))
      const owner = f.owners?.[0]?.emailAddress?.toLowerCase()
      return {
        id: f.id, name: f.name, organization: m.organization ?? '', description: m.description ?? '', status: m.status ?? 'Active',
        config: normalize(m.config), created_by: m.created_by, created_at: m.created_at, url: f.webViewLink,
        deleted_at: f.trashed ? (f.appProperties?.deleted_at || 'unknown') : null, deleted_by: f.trashed ? f.appProperties?.deleted_by ?? null : null,
        owner, isOwner: !!owner && owner === me, canEdit: !!f.capabilities?.canEdit,
      }
    }))
  },

  async saveProject(p: Project): Promise<Project> {
    const meta = { organization: p.organization.trim(), description: p.description.trim(), status: p.status || 'Active' }
    if (p.id) {
      await G.api(`${G.DRIVE}/${p.id}`, { method: 'PATCH', body: JSON.stringify({ name: p.name.trim() }) })
      const old = await readMeta(p.id)
      await writeMeta(p.id, { ...old, ...meta })
      return { ...p, ...meta, name: p.name.trim() }
    }
    const root = await ensureRoot()
    const f = await G.api<DriveFile>(G.DRIVE + G.q({ fields: 'id,webViewLink' }), {
      method: 'POST', body: JSON.stringify({ name: p.name.trim(), mimeType: 'application/vnd.google-apps.spreadsheet', parents: [root], appProperties: { rtm: 'project' } }),
    })
    await G.api(`${G.SHEETS}/${f.id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [
      { updateSheetProperties: { properties: { sheetId: 0, title: 'Requirements', gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'title,gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
      { addSheet: { properties: { title: 'History', gridProperties: { frozenRowCount: 1 } } } },
      { addSheet: { properties: { title: 'Meta' } } },
      { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
    ] }) })
    const now = new Date().toISOString(), me = G.currentEmail() ?? ''
    await G.api(`${G.SHEETS}/${f.id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: [
      { range: `Requirements!A1:${LAST}1`, values: [REQ_HEAD] },
      { range: 'History!A1:E1', values: [HIST_HEAD] },
      { range: 'Meta!A1:A2', values: [[JSON.stringify({ ...meta, created_by: me, created_at: now })], ['Managed by the RTM app — please do not edit this sheet.']] },
    ] }) })
    sheetIds.set(f.id, 0)
    return { ...p, ...meta, id: f.id, name: p.name.trim(), config: normalize(undefined), owner: me, isOwner: true, canEdit: true, url: f.webViewLink }
  },

  async saveConfig(id: string, config: Config) {
    const m = await readMeta(id)
    await writeMeta(id, { ...m, config })
  },

  async setTrashed(id: string, trashed: boolean) {
    const props = trashed ? { deleted_at: new Date().toISOString(), deleted_by: G.currentEmail() ?? '' } : { deleted_at: null, deleted_by: null }
    await G.api(`${G.DRIVE}/${id}`, { method: 'PATCH', body: JSON.stringify({ trashed, appProperties: props }) })
  },

  async purge(id: string) {
    const f = await G.api<DriveFile>(`${G.DRIVE}/${id}${G.q({ fields: 'trashed' })}`)
    if (!f.trashed) throw new Error('Move the project to trash first.')
    await G.api(`${G.DRIVE}/${id}`, { method: 'DELETE' })
    // Its attachment files (the ones this user owns) go too.
    const att = await G.api<{ files: DriveFile[] }>(G.DRIVE + G.q({ q: `appProperties has { key='project' and value='${id}' } and 'me' in owners`, fields: 'files(id)', pageSize: 1000 })).catch(() => ({ files: [] as DriveFile[] }))
    for (const x of att.files) await G.api(`${G.DRIVE}/${x.id}`, { method: 'DELETE' }).catch(() => {})
  },

  async openShared(): Promise<string | null> {
    const pick = await G.pickSpreadsheet()
    if (!pick) return null
    const f = await G.api<DriveFile>(`${G.DRIVE}/${pick.id}${G.q({ fields: 'id,appProperties' })}`)
    if (f.appProperties?.rtm !== 'project') throw new Error(`"${pick.name}" is not an RTM project.`)
    return f.id
  },

  async listMembers(id: string): Promise<Member[]> {
    const r = await G.api<{ permissions: { id: string; emailAddress?: string; role: string; type: string; displayName?: string }[] }>(
      `${G.DRIVE}/${id}/permissions${G.q({ fields: 'permissions(id,emailAddress,role,type,displayName)' })}`)
    const role = (x: string): Member['role'] => x === 'owner' ? 'owner' : x === 'writer' || x === 'organizer' || x === 'fileOrganizer' ? 'member' : 'viewer'
    return r.permissions.filter(p => p.type === 'user' && p.emailAddress)
      .map(p => ({ project_id: id, email: p.emailAddress!.toLowerCase(), role: role(p.role), permId: p.id, name: p.displayName }))
      .sort((a, b) => ['owner', 'member', 'viewer'].indexOf(a.role) - ['owner', 'member', 'viewer'].indexOf(b.role))
  },
  async uploadAttachment(projectId: string, reqId: string, file: File): Promise<Attachment> {
    const folder = await ensureAttachmentFolder()
    const meta = { name: file.name, parents: [folder], appProperties: { rtm: 'attachment', project: projectId, req: reqId } }
    const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink,mimeType,size', {
      method: 'POST', headers: { Authorization: 'Bearer ' + G.bearer(), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': file.type || 'application/octet-stream', 'X-Upload-Content-Length': String(file.size) },
      body: JSON.stringify(meta),
    })
    if (!start.ok) throw new Error('Upload could not start (' + start.status + ')')
    const loc = start.headers.get('Location')
    if (!loc) throw new Error('Upload could not start (no session).')
    const up = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
    if (!up.ok) throw new Error('Upload failed (' + up.status + ')')
    const f = await up.json() as { id: string; webViewLink?: string; mimeType?: string; size?: string }
    const me = G.currentEmail() ?? ''
    for (const m of await memberEmails(projectId)) if (m.email !== me) await shareRead(f.id, m.email)
    return { id: f.id, kind: 'file', name: file.name, url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, fileId: f.id, mime: f.mimeType, size: Number(f.size ?? file.size), added_by: me, added_at: new Date().toISOString() }
  },
  async removeAttachmentFile(a: Attachment) {
    if (a.fileId) await G.api(`${G.DRIVE}/${a.fileId}`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }).catch(() => {})
  },
  async shareAttachments(projectId: string, email: string) {
    const r = await G.api<{ files: DriveFile[] }>(G.DRIVE + G.q({ q: `appProperties has { key='project' and value='${projectId}' } and trashed=false and 'me' in owners`, fields: 'files(id)', pageSize: 1000 })).catch(() => ({ files: [] as DriveFile[] }))
    for (const f of r.files) await shareRead(f.id, email)
  },

  async addMember(id: string, email: string, role: Member['role']) {
    const msg = `You were added to an RTM project. Open ${location.origin}${location.pathname} , sign in with Google, then use "Open shared project" and pick this file.`
    await G.api(`${G.DRIVE}/${id}/permissions${G.q({ sendNotificationEmail: true, emailMessage: msg })}`, {
      method: 'POST', body: JSON.stringify({ type: 'user', role: role === 'viewer' ? 'reader' : 'writer', emailAddress: email.trim().toLowerCase() }),
    })
    await gdrive.shareAttachments(id, email.trim().toLowerCase())
  },
  async removeMember(id: string, m: Member) {
    if (!m.permId) return
    await G.api(`${G.DRIVE}/${id}/permissions/${m.permId}`, { method: 'DELETE' })
  },

  async listReqs(id: string): Promise<Req[]> {
    return (await getValues(id, `Requirements!A2:${LAST}`)).map(rowToReq).filter(r => r.id || r.statement)
  },

  async listVersions(id: string): Promise<Version[]> {
    if (!(await hasVersionsSheet(id))) return []
    return (await getValues(id, 'Versions!A2:E')).map(rowToVersion).filter((v): v is Version => !!v && !!v.req_id)
  },

  async saveReq(id: string, r: Req, prev: Req | undefined, h: HistoryEntry, who: string, now: string) {
    await ensureHeader(id)
    const rows = await getValues(id, `Requirements!A2:${LAST}`)
    const i = rows.findIndex(x => (x[0] ?? '').trim() === r.id.trim())
    if (!prev && i >= 0) throw new Error(`ID ${r.id} already exists. IDs are never reused.`)
    if (prev && i >= 0 && !same(rowToReq(rows[i]), prev)) throw new Error(`${r.id} was changed by someone else (${rows[i][REQ_COLS.length - 1] || 'unknown'}) since you opened it. Close the form to reload, then apply your change again.`)
    const stored = i >= 0 ? rowToReq(rows[i]) : undefined
    if (prev && stored && isNewVersion(stored, r)) {
      const n = (await archiveVersions(id, [stored], who, now)).get(stored.id)!
      h.changes.push(versionChange(n))
    }
    const row = reqToRow(r, who, now)
    if (i >= 0) await putValues(id, `Requirements!A${i + 2}:${LAST}${i + 2}`, [row])
    else await appendValues(id, `Requirements!A1:${LAST}1`, [row])
    await appendValues(id, 'History!A1:E1', [[h.changed_at, h.changed_by, h.action, h.req_id, JSON.stringify(h.changes)]])
  },

  async bulkSave(id: string, incoming: Req[], labels?: (k: string) => string, act: { create: string; update: string; createOnly?: boolean } = { create: 'import', update: 'import-update' }): Promise<number> {
    await ensureHeader(id)
    const who = G.currentEmail() ?? '', now = new Date().toISOString()
    const rows = await getValues(id, `Requirements!A2:${LAST}`)
    const table = rows.map(x => [...x, ...Array(Math.max(0, REQ_COLS.length - x.length)).fill('')])
    const index = new Map(table.map((x, i) => [(x[0] ?? '').trim(), i]))
    const hist: string[][] = []
    const olds: Req[] = [], histOf = new Map<string, Change[]>()
    if (act.createOnly) for (const r of incoming) if (index.has(r.id.trim())) throw new Error(`${r.id} already exists — someone added it meanwhile. Reload and apply again.`)
    for (let r of incoming) {
      if (!r.id) continue
      const i = index.get(r.id.trim())
      const prev = i === undefined ? undefined : rowToReq(table[i])
      if (prev && !r.attachments?.length) r = { ...r, attachments: prev.attachments }
      const changes = diff(prev, clean(r), labels)
      if (prev && !changes.length) continue
      if (prev && isNewVersion(prev, r)) { olds.push(prev); histOf.set(r.id, changes) }
      const row = reqToRow(r, who, now)
      if (i === undefined) { index.set(r.id.trim(), table.length); table.push(row) } else table[i] = row
      hist.push([now, who, prev ? act.update : act.create, r.id, JSON.stringify(changes)])
    }
    if (!hist.length) return 0
    const vers = await archiveVersions(id, olds, who, now)
    for (const hr of hist) { const n = vers.get(hr[3]); if (n) hr[4] = JSON.stringify([...(histOf.get(hr[3]) ?? []), versionChange(n)]) }
    await putValues(id, `Requirements!A2:${LAST}${table.length + 1}`, table)
    await appendValues(id, 'History!A1:E1', hist)
    return hist.length
  },

  // Rename IDs (and links to them) in one write; history moves to the new IDs.
  async renameIds(id: string, map: RenameMap, labels?: (k: string) => string): Promise<number> {
    await ensureHeader(id)
    const who = G.currentEmail() ?? '', now = new Date().toISOString()
    const rows = await getValues(id, `Requirements!A2:${LAST}`)
    const reqs = rows.map(rowToReq)
    const taken = new Set(reqs.map(r => r.id.trim()))
    for (const [from, to] of Object.entries(map)) if (taken.has(to) && !map[to]) throw new Error(`Can't rename ${from} to ${to}: ${to} already exists.`)
    const changes = applyRename(reqs, map)
    if (!changes.length) return 0
    const table = rows.map(x => [...x, ...Array(Math.max(0, REQ_COLS.length - x.length)).fill('')])
    const hist: string[][] = []
    for (const c of changes) {
      const i = reqs.indexOf(c.before)
      table[i] = reqToRow(c.after, who, now)
      hist.push([now, who, c.after.id !== c.before.id ? 'rename' : 'update', c.after.id, JSON.stringify(diff(c.before, c.after, labels))])
    }
    await putValues(id, `Requirements!A2:${LAST}${table.length + 1}`, table)
    const old = await getValues(id, 'History!D2:D')
    if (old.some(x => map[x[0] ?? ''])) await putValues(id, `History!D2:D${old.length + 1}`, old.map(x => [map[x[0] ?? ''] ?? x[0] ?? '']))
    if (await hasVersionsSheet(id)) {
      const vids = await getValues(id, 'Versions!A2:A')
      if (vids.some(x => map[x[0] ?? ''])) await putValues(id, `Versions!A2:A${vids.length + 1}`, vids.map(x => [map[x[0] ?? ''] ?? x[0] ?? '']))
    }
    await appendValues(id, 'History!A1:E1', hist)
    return changes.length
  },

  async deleteReq(id: string, r: Req, h: HistoryEntry) {
    const rows = await getValues(id, 'Requirements!A2:A')
    const i = rows.findIndex(x => (x[0] ?? '').trim() === r.id.trim())
    if (i < 0) return
    await G.api(`${G.SHEETS}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [
      { deleteDimension: { range: { sheetId: await reqSheetId(id), dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 } } },
    ] }) })
    await appendValues(id, 'History!A1:E1', [[h.changed_at, h.changed_by, h.action, h.req_id, '[]']])
  },

  async history(id: string, reqId?: string): Promise<HistoryEntry[]> {
    const rows = await getValues(id, 'History!A2:E')
    return rows.map(x => {
      let changes: Change[] = []
      try { changes = JSON.parse(x[4] || '[]') } catch { /* ignore */ }
      return { project_id: id, changed_at: x[0] ?? '', changed_by: x[1] ?? '', action: x[2] ?? '', req_id: x[3] ?? '', changes }
    }).filter(h => !reqId || h.req_id === reqId).reverse().slice(0, 500)
  },

  subscribe(id: string, onChange: () => void): () => void {
    let last = ''
    const tick = async () => {
      if (document.hidden || !G.currentEmail()) return
      try {
        const f = await G.api<{ modifiedTime: string }>(`${G.DRIVE}/${id}${G.q({ fields: 'modifiedTime' })}`)
        if (last && f.modifiedTime !== last) onChange()
        last = f.modifiedTime
      } catch { /* ignore polling errors */ }
    }
    tick()
    const t = window.setInterval(tick, 20_000)
    return () => window.clearInterval(t)
  },
}

// ======================================================================
// Local demo backend (browser only)
// ======================================================================
const LK = 'rtm.rows.v2', LH = 'rtm.history.v2', LP = 'rtm.projects.v1', LV = 'rtm.versions.v1'
type LocalVersion = Version & { project_id: string }
function localArchive(projectId: string, old: Req, who: string, now: string): number {
  const all = read<LocalVersion[]>(LV, [])
  const n = all.filter(v => v.project_id === projectId && v.req_id === old.id).length + 1
  write(LV, [...all, { project_id: projectId, req_id: old.id, version: n, saved_at: now, saved_by: who, snapshot: clean(old) }])
  return n
}
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }
type LocalReq = Req & { project_id: string }

// ======================================================================
// Public API (same for both backends)
// ======================================================================
export async function listProjects(): Promise<Project[]> {
  if (GOOGLE) return gdrive.listProjects()
  return read<Project[]>(LP, []).map(p => ({ ...p, config: normalize(p.config), isOwner: true, canEdit: true }))
}

export async function saveConfig(projectId: string, config: Config): Promise<void> {
  if (GOOGLE) return gdrive.saveConfig(projectId, config)
  write(LP, read<Project[]>(LP, []).map(p => p.id === projectId ? { ...p, config } : p))
}

export async function saveProject(p: Project): Promise<Project> {
  if (GOOGLE) return gdrive.saveProject(p)
  const row = { name: p.name.trim(), organization: p.organization.trim(), description: p.description.trim(), status: p.status || 'Active' }
  const all = read<Project[]>(LP, [])
  const saved = { ...p, ...row, id: p.id || crypto.randomUUID(), created_at: p.created_at || new Date().toISOString() }
  const i = all.findIndex(x => x.id === saved.id)
  if (i >= 0) all[i] = saved; else all.push(saved)
  write(LP, all)
  return saved
}

async function setDeleted(id: string, deleted: boolean): Promise<void> {
  if (GOOGLE) return gdrive.setTrashed(id, deleted)
  const patch = { deleted_at: deleted ? new Date().toISOString() : null, deleted_by: deleted ? 'local user' : null }
  write(LP, read<Project[]>(LP, []).map(p => p.id === id ? { ...p, ...patch } : p))
}
export const trashProject = (id: string) => setDeleted(id, true)
export const restoreProject = (id: string) => setDeleted(id, false)

export async function purgeProject(id: string): Promise<void> {
  if (GOOGLE) return gdrive.purge(id)
  const p = read<Project[]>(LP, []).find(x => x.id === id)
  if (!p?.deleted_at) throw new Error('Move the project to trash first.')
  write(LP, read<Project[]>(LP, []).filter(x => x.id !== id))
  write(LK, read<LocalReq[]>(LK, []).filter(r => r.project_id !== id))
}

export const openSharedProject = () => (GOOGLE ? gdrive.openShared() : Promise.resolve(null))

export async function projectStats(projects: Project[]): Promise<Record<string, Req[]>> {
  if (GOOGLE) {
    const out: Record<string, Req[]> = {}
    await Promise.all(projects.map(async p => { out[p.id] = await gdrive.listReqs(p.id).catch(() => []) }))
    return out
  }
  const out: Record<string, Req[]> = {}
  for (const r of read<LocalReq[]>(LK, [])) (out[r.project_id] ??= []).push(r)
  return out
}

export async function listMembers(projectId: string): Promise<Member[]> {
  return GOOGLE ? gdrive.listMembers(projectId) : []
}
export async function addMember(projectId: string, email: string, role: Member['role']) {
  if (GOOGLE) await gdrive.addMember(projectId, email, role)
}
export async function removeMember(projectId: string, m: Member) {
  if (GOOGLE) await gdrive.removeMember(projectId, m)
}

export async function listReqs(projectId: string): Promise<Req[]> {
  if (GOOGLE) return gdrive.listReqs(projectId)
  return read<LocalReq[]>(LK, []).filter(r => r.project_id === projectId)
}

export async function saveReq(projectId: string, r: Req, prev: Req | undefined, action = prev ? 'update' : 'create'): Promise<void> {
  const row = clean(r)
  const changes = diff(prev, row, labelFn)
  if (prev && !changes.length) return
  const who = await currentUser()
  const now = new Date().toISOString()
  const h: HistoryEntry = { project_id: projectId, req_id: row.id, changed_at: now, changed_by: who, action, changes }
  if (GOOGLE) return gdrive.saveReq(projectId, row, prev, h, who, now)
  const rows = read<LocalReq[]>(LK, [])
  const i = rows.findIndex(x => x.project_id === projectId && x.id === row.id)
  if (prev && i >= 0 && isNewVersion(rows[i], row)) h.changes.push(versionChange(localArchive(projectId, rows[i], who, now)))
  const full = { ...row, project_id: projectId, updated_at: now, updated_by: who }
  if (i >= 0) rows[i] = full; else rows.push(full)
  write(LK, rows)
  write(LH, [h, ...read<HistoryEntry[]>(LH, [])].slice(0, 5000))
}

export async function bulkSave(projectId: string, rows: Req[], existing: Req[], act: { create: string; update: string; createOnly?: boolean } = { create: 'import', update: 'import-update' }): Promise<number> {
  if (GOOGLE) return gdrive.bulkSave(projectId, rows, labelFn, act)
  if (act.createOnly) {
    const ids = new Set(read<LocalReq[]>(LK, []).filter(r => r.project_id === projectId).map(r => r.id))
    for (const r of rows) if (ids.has(r.id)) throw new Error(`${r.id} already exists — someone added it meanwhile. Reload and apply again.`)
  }
  const byId = new Map(existing.map(r => [r.id, r]))
  let n = 0
  for (const r of rows) {
    if (!r.id) continue
    const prev = byId.get(r.id)
    if (prev && !diff(prev, clean(r), labelFn).length) continue
    await saveReq(projectId, r, prev, prev ? act.update : act.create)
    n++
  }
  return n
}

// AI intake: new rows in one batch, then each update on its own (an update to a row changed by
// someone else since the analysis is skipped and reported, the rest still apply).
export async function applyIntake(projectId: string, plan: { creates: Req[]; updates: { prev: Req; next: Req }[] }, existing: Req[]):
  Promise<{ created: number; updated: number; skipped: { id: string; why: string }[] }> {
  const created = plan.creates.length ? await bulkSave(projectId, plan.creates, existing, { create: 'ai-intake', update: 'ai-intake', createOnly: true }) : 0
  let updated = 0
  const skipped: { id: string; why: string }[] = []
  for (const u of plan.updates) {
    try { await saveReq(projectId, u.next, u.prev, 'ai-update'); updated++ }
    catch (e) { skipped.push({ id: u.next.id, why: (e as Error).message }) }
  }
  return { created, updated, skipped }
}

// Rename requirement IDs and update Parent / Depends on links that point to them.
export async function renameIds(projectId: string, map: RenameMap): Promise<number> {
  if (GOOGLE) return gdrive.renameIds(projectId, map, labelFn)
  const all = read<LocalReq[]>(LK, [])
  const mine = all.filter(r => r.project_id === projectId)
  const changes = applyRename(mine, map)
  const who = await currentUser(), now = new Date().toISOString()
  for (const c of changes) Object.assign(c.before, c.after, { updated_at: now, updated_by: who })
  write(LK, all)
  const hist = read<HistoryEntry[]>(LH, []).map(h => h.project_id === projectId && map[h.req_id] ? { ...h, req_id: map[h.req_id] } : h)
  write(LV, read<LocalVersion[]>(LV, []).map(v => v.project_id === projectId && map[v.req_id] ? { ...v, req_id: map[v.req_id] } : v))
  write(LH, [...changes.map(c => ({ project_id: projectId, req_id: c.after.id, changed_at: now, changed_by: who, action: c.after.id !== c.before.id ? 'rename' : 'update', changes: diff(c.before, c.after, labelFn) })), ...hist])
  return changes.length
}

// Old versions of requirements (newest last). Viewers can read them; nothing here writes.
export async function listVersions(projectId: string): Promise<Version[]> {
  if (GOOGLE) return gdrive.listVersions(projectId)
  return read<LocalVersion[]>(LV, []).filter(v => v.project_id === projectId).map(({ project_id: _p, ...v }) => v)
}

export async function deleteReq(projectId: string, r: Req): Promise<void> {
  const who = await currentUser()
  const h: HistoryEntry = { project_id: projectId, req_id: r.id, changed_at: new Date().toISOString(), changed_by: who, action: 'delete', changes: [] }
  if (GOOGLE) return gdrive.deleteReq(projectId, r, h)
  write(LK, read<LocalReq[]>(LK, []).filter(x => !(x.project_id === projectId && x.id === r.id)))
  write(LH, [h, ...read<HistoryEntry[]>(LH, [])])
}

export async function history(projectId: string, id?: string): Promise<HistoryEntry[]> {
  if (GOOGLE) return gdrive.history(projectId, id)
  return read<HistoryEntry[]>(LH, []).filter(h => h.project_id === projectId && (!id || h.req_id === id))
}

export function subscribe(projectId: string, onChange: () => void): () => void {
  if (GOOGLE) return gdrive.subscribe(projectId, onChange)
  const h = (e: StorageEvent) => { if (e.key === LK) onChange() }
  window.addEventListener('storage', h)
  return () => window.removeEventListener('storage', h)
}

// ---------- attachments ----------
export async function uploadAttachment(projectId: string, reqId: string, file: File): Promise<Attachment> {
  if (!GOOGLE) throw new Error('File uploads need Google sign-in. In the demo you can add links.')
  if (file.size > 50 * 1024 * 1024) throw new Error('Files up to 50 MB. For bigger files, upload to Drive or SharePoint and add a link.')
  return gdrive.uploadAttachment(projectId, reqId, file)
}
export async function removeAttachmentFile(a: Attachment) {
  if (GOOGLE) await gdrive.removeAttachmentFile(a)
}
export const newLink = async (name: string, url: string): Promise<Attachment> =>
  ({ id: 'l_' + Math.random().toString(36).slice(2, 10), kind: 'link', name: name.trim() || url, url: url.trim(), added_by: await currentUser(), added_at: new Date().toISOString() })
