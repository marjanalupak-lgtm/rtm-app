import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUuiContext } from '@epam/uui-core'
import { Button, FlexRow, FlexSpacer, SearchInput, TabButton, Text, Panel, SuccessNotification, ErrorNotification, Badge } from '@epam/uui'
import { emptyReq, severity, type Req } from './model'
import { ConfigContext, defaultConfig, fieldLabel } from './config'
import { check, nextIdFor } from './rules'
import { Settings } from './Settings'
import { TreeView } from './TreeView'
import * as store from './store'
import { RtmTable } from './RtmTable'
import { Dashboard } from './Dashboard'
import { Guide } from './Guide'
import { Editor } from './Editor'
import { MultiSelect, Select } from './ui'
import { ProjectsTab, ProjectEditor } from './Projects'
import type { Project } from './store'

type Tab = 'projects' | 'dashboard' | 'rtm' | 'tree' | 'settings' | 'guide'
const TABS: [Tab, string][] = [['projects', 'Projects'], ['dashboard', 'Dashboard'], ['rtm', 'RTM'], ['tree', 'Tree'], ['settings', 'Settings'], ['guide', 'Guide & rules']]
const ls = { get: (k: string) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } } }

function Login({ reason }: { reason?: string }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="login">
      <Panel background="surface-main" shadow cx="login-card">
        <Text fontSize="24" fontWeight="600">RTM</Text>
        <Text color="secondary">Requirements Traceability Matrix. Your projects are stored as Google Sheets in your own Google Drive (folder “RTM”). Only you and the people you share them with can see them.</Text>
        {reason && <Text color="warning">{reason}</Text>}
        {err && <Text color="critical">{err}</Text>}
        <Button color="primary" caption={busy ? 'Signing in…' : 'Sign in with Google'} isDisabled={busy}
          onClick={() => { setBusy(true); setErr(''); store.signIn().catch(e => setErr(e.message)).finally(() => setBusy(false)) }} />
        <Text fontSize="12" color="secondary">The app only gets access to files it creates or that you open with it — not the rest of your Drive.</Text>
      </Panel>
    </div>
  )
}

export default function App() {
  const [email, setEmail] = useState<string | null>(store.signedInEmail())
  const [expired, setExpired] = useState(false)
  useEffect(() => store.onAuthChange(e => { setEmail(prev => { if (prev && !e) setExpired(true); return e }) }), [])
  if (store.mode === 'google' && !email) return <Login reason={expired ? 'Your Google session expired (they last 1 hour). Sign in again — nothing is lost.' : undefined} />
  return <Main email={email ?? ''} />
}

function Main({ email }: { email: string }) {
  const { uuiNotifications } = useUuiContext()
  const [tab, setTab] = useState<Tab>(() => (ls.get('rtm.tab') as Tab) || 'rtm')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [pid, setPid] = useState(() => ls.get('rtm.project'))
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [rows, setRows] = useState<Req[]>([])
  const [editing, setEditing] = useState<{ r: Req; isNew: boolean } | null>(null)
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState<string[]>([])
  const [fRelease, setFRelease] = useState<string[]>([])
  const [fCheck, setFCheck] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((msg: string, ok = true) => {
    const N = ok ? SuccessNotification : ErrorNotification
    uuiNotifications.show(props => <N {...props}><Text>{msg}</Text></N>, { duration: ok ? 3 : 8 }).catch(() => {})
  }, [uuiNotifications])

  const loadProjects = useCallback(() => store.listProjects().then(ps => {
    setProjects(ps)
    const live = ps.filter(p => !p.deleted_at)
    setPid(cur => live.some(p => p.id === cur) ? cur : (live.find(p => p.status !== 'Closed') ?? live[0])?.id ?? '')
  }).catch(e => notify('Load failed: ' + e.message, false)), [notify])
  useEffect(() => { loadProjects() }, [loadProjects])
  const project = projects?.find(p => p.id === pid && !p.deleted_at)
  const liveProjects = useMemo(() => (projects ?? []).filter(p => !p.deleted_at), [projects])
  const cfg = useMemo(() => project?.config ?? defaultConfig(), [project])
  useEffect(() => { store.setLabels(k => fieldLabel(cfg, k)) }, [cfg])

  const reload = useCallback(() => {
    if (!pid) { setRows([]); return Promise.resolve() }
    return store.listReqs(pid).then(setRows).catch(e => notify('Load failed: ' + e.message, false))
  }, [notify, pid])
  useEffect(() => { reload(); return pid ? store.subscribe(pid, reload) : undefined }, [reload, pid])
  useEffect(() => { ls.set('rtm.tab', tab) }, [tab])
  useEffect(() => { ls.set('rtm.project', pid) }, [pid])
  const activeTab: Tab = projects && !project ? 'projects' : tab

  const releases = useMemo(() => [...new Set([...cfg.lists.release, ...rows.map(r => r.release).filter(Boolean)])], [rows, cfg])
  const filtered = useMemo(() => {
    const s = q.toLowerCase()
    return rows.filter(r => {
      if (s && ![...Object.values(r), ...Object.values(r.extra ?? {})].some(v => typeof v !== 'object' && String(v ?? '').toLowerCase().includes(s))) return false
      if (fStatus.length && !fStatus.includes(r.status)) return false
      if (fRelease.length && !fRelease.includes(r.release)) return false
      if (fCheck.length) {
        const sev = severity(check(r, cfg))
        const label = sev === 'ok' ? 'Covered' : sev === 'bad' ? 'Critical gap' : sev === 'warn' ? 'Gap' : ''
        if (!fCheck.includes(label)) return false
      }
      return true
    })
  }, [rows, q, fStatus, fRelease, fCheck, cfg])

  const onImport = async (file: File) => {
    try {
      const incoming = await (await import('./excel')).importExcel(file, cfg)
      const n = await store.bulkSave(pid, incoming, rows)
      await reload()
      notify(`Imported ${incoming.length} rows (${n} new or changed).`)
    } catch (e) { notify('Import failed: ' + (e as Error).message, false) }
  }

  const open = (r: Req) => setEditing({ r, isNew: false })

  return (
    <ConfigContext.Provider value={cfg}>
    <div className="app">
      <header className="topbar">
        <div className="brand">RTM</div>
        {liveProjects.length > 0 && (
          <div className="project-pick"><Select value={pid} options={liveProjects.map(p => p.id)} labels={Object.fromEntries(liveProjects.map(p => [p.id, p.name]))} onChange={v => { setPid(v); if (activeTab === 'projects') setTab('rtm') }} placeholder="Select project" noClear /></div>
        )}
        {TABS.map(([k, c]) => <TabButton key={k} caption={c} isActive={activeTab === k} isDisabled={k !== 'projects' && k !== 'guide' && !project} onClick={() => setTab(k)} size="60" cx="toptab" />)}
        <FlexSpacer />
        {store.mode === 'local'
          ? <Badge size="24" color="warning" caption="Local demo — data stays in this browser" />
          : <Text cx="who">{email}</Text>}
        {store.mode === 'google' && <Button fill="none" color="white" caption="Sign out" onClick={() => store.signOut()} />}
      </header>

      <main className="content">
        {(activeTab === 'rtm' || activeTab === 'dashboard' || activeTab === 'tree') && (
          <FlexRow columnGap="12" cx="toolbar" rawProps={{ role: 'toolbar' }}>
            <div className="search"><SearchInput value={q} onValueChange={v => setQ(v ?? '')} placeholder="Search all fields" debounceDelay={150} /></div>
            {activeTab === 'rtm' && <>
              <div className="filter"><MultiSelect value={fStatus} options={cfg.lists.status} onChange={setFStatus} placeholder="Status" /></div>
              <div className="filter"><MultiSelect value={fRelease} options={releases} onChange={setFRelease} placeholder="Release" /></div>
              <div className="filter"><MultiSelect value={fCheck} options={['Covered', 'Gap', 'Critical gap']} onChange={setFCheck} placeholder="Traceability" /></div>
            </>}
            <FlexSpacer />
            <Text color="secondary" fontSize="14">{filtered.length} of {rows.length}</Text>
            {project?.canEdit !== false && <Button fill="outline" color="secondary" caption="Import Excel" onClick={() => fileRef.current?.click()} />}
            <Button fill="outline" color="secondary" caption="Export Excel" onClick={() => import('./excel').then(m => m.exportExcel(filtered, project?.name ?? 'RTM', cfg))} />
            {project?.canEdit !== false && <Button color="accent" caption="+ Requirement" onClick={() => setEditing({ r: { ...emptyReq(nextIdFor(rows, cfg)), status: cfg.workflow.initial }, isNew: true })} />}
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
          </FlexRow>
        )}
        {activeTab === 'projects' && projects && <ProjectsTab projects={projects} currentId={pid} onOpen={id => { setPid(id); setTab('rtm') }} onEdit={setEditProject} onChanged={loadProjects} notify={notify}
          onOpenShared={() => store.openSharedProject().then(async id => { if (id) { await loadProjects(); setPid(id); setTab('rtm'); notify('Shared project opened') } }).catch(e => notify(e.message, false))} />}
        {activeTab === 'dashboard' && <Dashboard rows={filtered} onOpen={open} />}
        {activeTab === 'rtm' && <RtmTable rows={filtered} onOpen={open} />}
        {activeTab === 'tree' && <TreeView rows={rows} onOpen={open} q={q} />}
        {activeTab === 'settings' && project && <Settings projectId={pid} config={cfg} isOwner={!!project.isOwner} onSaved={loadProjects} notify={notify} />}
        {activeTab === 'guide' && <Guide />}
      </main>

      {editing && (
        <Editor
          projectId={pid} readOnly={project?.canEdit === false} allRows={rows} onOpenOther={x => setEditing({ r: x, isNew: false })} initial={editing.r} isNew={editing.isNew} existingIds={new Set(rows.map(r => r.id))}
          onClose={() => setEditing(null)}
          onSave={async r => {
            const prev = editing.isNew ? undefined : rows.find(x => x.id === editing.r.id)
            await store.saveReq(pid, r, prev)
            await reload(); setEditing(null); notify(`${r.id} saved`)
          }}
          onDelete={async () => { await store.deleteReq(pid, editing.r); await reload(); setEditing(null); notify(`${editing.r.id} deleted`) }}
        />
      )}
      {editProject && (
        <ProjectEditor initial={editProject} me={email} onClose={() => setEditProject(null)}
          onSaved={async pr => { setEditProject(null); await loadProjects(); if (!editProject.id) { setPid(pr.id); setTab('rtm') } notify(`Project "${pr.name}" saved`) }}
          onDeleted={async () => { setEditProject(null); await loadProjects(); notify('Moved to trash — restore it from Projects → Trash') }} />
      )}
    </div>
    </ConfigContext.Provider>
  )
}
