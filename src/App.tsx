import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUuiContext } from '@epam/uui-core'
import { Button, FlexRow, FlexSpacer, MultiSwitch, SearchInput, TabButton, Text, SuccessNotification, ErrorNotification, Badge } from '@epam/uui'
import { emptyReq, type Req } from './model'
import { ConfigContext, defaultConfig, fieldLabel } from './config'
import { nextIdFor } from './rules'
import { Settings } from './Settings'
import { TreeTable, type FoldCmd } from './TreeTable'
import { ViewMenu } from './ViewMenu'
import * as store from './store'
import { RtmTable, useTableState, columns as tableColumns } from './RtmTable'
import { ColumnsConfigurationModal } from '@epam/uui'
import { useColumnsConfig } from '@epam/uui-core'
import { Dashboard } from './Dashboard'
import { Guide } from './Guide'
import { Editor } from './Editor'
import { Select } from './ui'
import { AiPanel } from './AiPanel'
import { Sparkle } from './ai/icons'
import type { Version } from './versions'
import type { Section } from './Settings'
import { ActiveFilters, applyFilters, emptyFilters, type FilterState } from './Filters'
import { ProjectsTab, ProjectEditor } from './Projects'
import type { Project } from './store'

type Tab = 'projects' | 'dashboard' | 'rtm' | 'settings' | 'guide'
type View = 'list' | 'tree'
const TABS: [Tab, string][] = [['projects', 'Projects'], ['dashboard', 'Dashboard'], ['rtm', 'RTM'], ['settings', 'Settings'], ['guide', 'Guide & rules']]
const ls = { get: (k: string) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } } }

const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>
)

function Login({ reason }: { reason?: string }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = () => { setBusy(true); setErr(''); store.signIn().catch(e => setErr(e.message)).finally(() => setBusy(false)) }
  return (
    <div className="login">
      <div className="login-glow g1" /><div className="login-glow g2" />
      <main className="login-card">
        <h1 className="login-title">RTM tree</h1>
        <p className="login-tagline">Every request has a root.</p>
        <p className="login-lead">Trace every requirement from the business need it grows from to the design, test and defect it ends in — for any project.</p>
        <ul className="login-points">
          <li><span className="dot d1" />Tree from business need to test</li>
          <li><span className="dot d2" />Stored in your own Google Drive</li>
          <li><span className="dot d3" />Audit-ready Excel in one click</li>
        </ul>
        {reason && <p className="login-note">{reason}</p>}
        {err && <p className="login-err" role="alert">{err}</p>}
        <button className="gbtn" onClick={go} disabled={busy}><GoogleG /><span>{busy ? 'Signing in…' : 'Sign in with Google'}</span></button>
        <p className="login-fine">RTM tree only sees files it creates or that you open with it — never the rest of your Drive. <a href="privacy.html">Privacy</a></p>
      </main>
    </div>
  )
}

export default function App() {
  const [email, setEmail] = useState<string | null>(store.signedInEmail())
  // Who was signed in during this page session. When the 1-hour Google session expires we keep the
  // app (and any unsaved edits) mounted and ask to sign in again on top, instead of unmounting it.
  const [lastEmail, setLastEmail] = useState<string | null>(email)
  useEffect(() => store.onAuthChange(e => {
    setEmail(e)
    if (!e) return
    setLastEmail(prev => { if (prev && prev !== e) window.location.reload(); return e })   // other account: start clean
  }), [])
  if (store.mode === 'google' && !email && !lastEmail) return <Login />
  return (
    <>
      <Main email={email ?? lastEmail ?? ''} onSignOut={() => { setLastEmail(null); store.signOut() }} />
      {store.mode === 'google' && !email && (
        <div className="reauth" role="dialog" aria-modal="true" aria-label="Sign in again">
          <Login reason="Your Google session expired (sessions last 1 hour). Sign in again to continue — your open work is still here." />
        </div>
      )}
    </>
  )
}

function Main({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { uuiNotifications, uuiModals } = useUuiContext()
  const [tab, setTab] = useState<Tab>(() => { const t = ls.get('rtm.tab'); return (t === 'tree' ? 'rtm' : t as Tab) || 'rtm' })
  const [view, setViewState] = useState<View>(() => ls.get('rtm.tab') === 'tree' || ls.get('rtm.view') === 'tree' ? 'tree' : 'list')
  const setView = (v: View) => { setViewState(v); ls.set('rtm.view', v) }
  const [fold, setFold] = useState<FoldCmd | undefined>()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [pid, setPid] = useState(() => ls.get('rtm.project'))
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [rows, setRows] = useState<Req[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  // The open requirement belongs to one project and one tab; it is shown only there.
  type Editing = { r: Req; isNew: boolean; pid: string; tab: Tab }
  const [editing, setEditing] = useState<Editing | null>(null)
  const [q, setQ] = useState('')
  const [filters, setFiltersState] = useState<FilterState>(emptyFilters())
  const [tableState, setTableState] = useTableState(pid)
  const fileRef = useRef<HTMLInputElement>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [settingsSec, setSettingsSec] = useState<Section | undefined>()

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
    if (!pid) { setRows([]); setVersions([]); return Promise.resolve() }
    // A failed load keeps what we had (instead of showing every requirement as v1); a late answer for
    // another project is dropped.
    const forPid = pid
    store.listVersions(pid).then(v => { if (ls.get('rtm.project') === forPid) setVersions(v) })
      .catch(e => notify('Could not load versions: ' + e.message, false))
    return store.listReqs(pid).then(setRows).catch(e => notify('Load failed: ' + e.message, false))
  }, [notify, pid])
  useEffect(() => { reload(); return pid ? store.subscribe(pid, reload) : undefined }, [reload, pid])
  useEffect(() => { ls.set('rtm.tab', tab) }, [tab])
  useEffect(() => { ls.set('rtm.project', pid); setVersions([]) }, [pid])
  const activeTab: Tab = projects && !project ? 'projects' : tab
  useEffect(() => { if (activeTab !== 'settings') setSettingsSec(undefined) }, [activeTab])

  // Filters are remembered per project in this browser.
  useEffect(() => { try { setFiltersState({ ...emptyFilters(), ...JSON.parse(ls.get('rtm.filters.' + pid) || '{}') }) } catch { setFiltersState(emptyFilters()) } }, [pid])
  const setFilters = (f: FilterState) => { setFiltersState(f); ls.set('rtm.filters.' + pid, JSON.stringify(f)) }
  const filtered = useMemo(() => {
    const s = q.toLowerCase()
    const searched = s ? rows.filter(r => [...Object.values(r), ...Object.values(r.extra ?? {})].some(v => typeof v !== 'object' && String(v ?? '').toLowerCase().includes(s))) : rows
    return applyFilters(searched, filters, cfg)
  }, [rows, q, filters, cfg])

  // Column chooser (UUI columns configuration modal): show/hide, reorder, pin.
  const fctx = useMemo(() => ({ rows, cfg, st: filters, onChange: setFilters }), [rows, cfg, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const allCols = useMemo(() => tableColumns(cfg), [cfg])
  const { config: colConfig, defaultConfig: colDefaults } = useColumnsConfig(allCols, tableState.columnsConfig ?? {})
  const hiddenCols = Object.values(colConfig).filter(c => !c.isVisible).length
  const openColumns = () => uuiModals.show<typeof colConfig>(props => (
    <ColumnsConfigurationModal {...props} columns={allCols} columnsConfig={colConfig} defaultConfig={colDefaults} />
  )).then(c => setTableState(s => ({ ...s, columnsConfig: c }))).catch(() => {})

  const onImport = async (file: File) => {
    try {
      const incoming = await (await import('./excel')).importExcel(file, cfg)
      const n = await store.bulkSave(pid, incoming, rows)
      await reload()
      notify(`Imported ${incoming.length} rows (${n} new or changed).`)
    } catch (e) { notify('Import failed: ' + (e as Error).message, false) }
  }

  // Details open in a side pane on the RTM tab (resizable split) and as a drawer elsewhere.
  const dirtyRef = useRef(false)
  const guard = () => !dirtyRef.current || confirm('Discard unsaved changes?')
  const open = (r: Req) => { if (editing?.r.id === r.id && !editing.isNew && editing.tab === activeTab) return; if (guard()) { dirtyRef.current = false; setEditing({ r, isNew: false, pid, tab: activeTab }) } }
  const startNew = () => { if (guard()) { dirtyRef.current = false; setEditing({ r: { ...emptyReq(cfg.id.scheme?.on ? '' : nextIdFor(rows, cfg)), status: cfg.workflow.initial }, isNew: true, pid, tab: activeTab }) } }
  // Leaving the tab or project closes the open requirement (asks first if it has unsaved changes).
  const leave = (go: () => void) => { if (editing && !guard()) return; dirtyRef.current = false; setEditing(null); go() }
  const shown = editing && editing.pid === pid && editing.tab === activeTab ? editing : null
  const [paneW, setPaneW] = useState(() => Math.min(70, Math.max(25, Number(ls.get('rtm.paneW')) || 42)))
  const splitRef = useRef<HTMLDivElement>(null)
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const box = splitRef.current?.getBoundingClientRect(); if (!box) return
    let w = paneW
    const move = (ev: MouseEvent) => { w = Math.min(70, Math.max(25, ((box.right - ev.clientX) / box.width) * 100)); setPaneW(w) }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); ls.set('rtm.paneW', String(Math.round(w))) }
    document.body.classList.add('resizing')
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const nudge = (d: number) => setPaneW(w => { const n = Math.min(70, Math.max(25, w + d)); ls.set('rtm.paneW', String(n)); return n })
  const paneMode = activeTab === 'rtm'
  function renderEditor(variant: 'pane' | 'drawer') {
    if (!shown) return null
    const editing = shown
    return (
      <Editor key={(editing.isNew ? 'new:' : '') + editing.r.id} variant={variant} onDirty={d => { dirtyRef.current = d }}
        projectId={pid} readOnly={project?.canEdit === false} allRows={rows} onOpenOther={x => { dirtyRef.current = false; setEditing({ r: x, isNew: false, pid: editing.pid, tab: editing.tab }) }}
        versions={versions} initial={editing.r} isNew={editing.isNew} existingIds={new Set(rows.map(r => r.id))}
        onClose={() => { dirtyRef.current = false; setEditing(null) }}
        onSave={async r => {
          let prev = editing.isNew ? undefined : rows.find(x => x.id === editing.r.id)
          if (prev && r.id !== prev.id) {
            // New ID (type or area changed): rename it everywhere first, then save the edits.
            await store.renameIds(editing.pid, { [prev.id]: r.id })
            prev = (await store.listReqs(editing.pid)).find(x => x.id === r.id)
          }
          await store.saveReq(editing.pid, r, prev)
          await reload(); dirtyRef.current = false
          // In the side pane the saved requirement stays open; the drawer closes.
          setEditing(variant === 'pane' ? { r, isNew: false, pid: editing.pid, tab: editing.tab } : null)
          notify(`${r.id} saved`)
        }}
        onDelete={async () => { await store.deleteReq(editing.pid, editing.r); await reload(); dirtyRef.current = false; setEditing(null); notify(`${editing.r.id} deleted`) }}
      />
    )
  }

  return (
    <ConfigContext.Provider value={cfg}>
    <div className="app">
      <header className="topbar">
        <div className="brand">RTM tree</div>
        {liveProjects.length > 0 && (
          <div className="project-pick"><Select value={pid} options={liveProjects.map(p => p.id)} labels={Object.fromEntries(liveProjects.map(p => [p.id, p.name]))} onChange={v => leave(() => { setPid(v); if (activeTab === 'projects') setTab('rtm') })} placeholder="Select project" noClear /></div>
        )}
        {TABS.map(([k, c]) => <TabButton key={k} caption={c} isActive={activeTab === k} isDisabled={k !== 'projects' && k !== 'guide' && !project} onClick={() => { if (k !== activeTab) leave(() => setTab(k)) }} size="60" cx="toptab" />)}
        <FlexSpacer />
        {store.mode === 'local'
          ? <Badge size="24" color="warning" caption="Local demo — data stays in this browser" />
          : <Text cx="who">{email}</Text>}
        {store.mode === 'google' && <Button fill="none" color="white" caption="Sign out" onClick={() => { if (!dirtyRef.current || confirm('Discard unsaved changes and sign out?')) onSignOut() }} />}
      </header>

      <main className="content">
        {(activeTab === 'rtm' || activeTab === 'dashboard') && (
          <FlexRow columnGap="12" cx="toolbar" rawProps={{ role: 'toolbar' }}>
            <div className="search"><SearchInput value={q} onValueChange={v => setQ(v ?? '')} placeholder="Search all fields" debounceDelay={150} /></div>
            {activeTab === 'rtm' && <MultiSwitch<View> size="36" value={view} onValueChange={setView} items={[{ id: 'list', caption: 'List' }, { id: 'tree', caption: 'Tree' }]} rawProps={{ 'aria-label': 'RTM view' }} />}
            {activeTab === 'rtm' && view === 'list' && <Button fill="outline" color="secondary" caption={hiddenCols ? `Columns · ${hiddenCols} hidden` : 'Columns'} onClick={openColumns} />}
            {activeTab === 'rtm' && view === 'list' && project && <ViewMenu pid={pid} allKeys={allCols.map(c => c.key)} current={colConfig} defaults={colDefaults}
              apply={c => setTableState(s => ({ ...s, columnsConfig: c }))} notify={notify} />}
            {activeTab === 'rtm' && view === 'tree' && <>
              <Button fill="outline" color="secondary" caption="Expand all" onClick={() => setFold(f => ({ mode: 'expand', n: (f?.n ?? 0) + 1 }))} />
              <Button fill="outline" color="secondary" caption="Collapse all" onClick={() => setFold(f => ({ mode: 'collapse', n: (f?.n ?? 0) + 1 }))} />
            </>}
            <FlexSpacer />
            <Text color="secondary" fontSize="14">{filtered.length} of {rows.length}</Text>
            {project?.canEdit !== false && <Button fill="outline" color="secondary" caption="Import Excel" onClick={() => fileRef.current?.click()} />}
            <Button fill="outline" color="secondary" caption="Export Excel" onClick={() => import('./excel').then(m => m.exportExcel(filtered, project?.name ?? 'RTM', cfg, versions))} />
            {activeTab === 'rtm' && project?.canEdit !== false && <Button cx="ai-btn" fill="outline" color="primary" icon={() => <Sparkle size={16} />} caption="AI" onClick={() => setAiOpen(true)} rawProps={{ title: 'Turn notes, documents and transcripts into requirements with Claude' }} />}
            {project?.canEdit !== false && <Button color="primary" caption="+ Requirement" onClick={startNew} />}
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
          </FlexRow>
        )}
        {(activeTab === 'rtm' || activeTab === 'dashboard') && <ActiveFilters cfg={cfg} st={filters} onChange={setFilters} />}
        {activeTab === 'projects' && projects && <ProjectsTab projects={projects} currentId={pid} onOpen={id => leave(() => { setPid(id); setTab('rtm') })} onEdit={setEditProject} onChanged={loadProjects} notify={notify}
          onOpenShared={() => store.openSharedProject().then(async id => { if (id) { await loadProjects(); setPid(id); setTab('rtm'); notify('Shared project opened') } }).catch(e => notify(e.message, false))} />}
        {activeTab === 'dashboard' && <Dashboard rows={filtered} onOpen={open} />}
        {activeTab === 'rtm' && (
          <div className={'split' + (shown ? ' with-pane' : '')} ref={splitRef}>
            <div className="split-main">
              {view === 'list'
                ? <RtmTable rows={filtered} versions={versions} onOpen={open} state={tableState} setState={setTableState} fctx={fctx} selectedId={shown?.isNew ? undefined : shown?.r.id} />
                : <TreeTable rows={rows} q={q} filters={filters} onOpen={open} selectedId={shown?.isNew ? undefined : shown?.r.id} fold={fold} />}
            </div>
            {shown && (
              <>
                <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Resize details panel" tabIndex={0}
                  onMouseDown={startDrag} onKeyDown={e => { if (e.key === 'ArrowLeft') nudge(2); if (e.key === 'ArrowRight') nudge(-2) }} />
                <div className="split-side" style={{ width: paneW + '%' }}>{renderEditor('pane')}</div>
              </>
            )}
          </div>
        )}
        {activeTab === 'settings' && project && <Settings key={settingsSec ?? 'x'} initialSection={settingsSec} projectId={pid} rows={rows} onRowsChanged={reload} config={cfg} isOwner={!!project.isOwner} onSaved={loadProjects} notify={notify} />}
        {activeTab === 'guide' && <Guide />}
      </main>

      {shown && !paneMode && renderEditor('drawer')}
      {aiOpen && project && <AiPanel pid={pid} rows={rows} cfg={cfg} me={email} notify={notify} onApplied={reload}
        onClose={() => setAiOpen(false)} openSettingsAi={() => { setAiOpen(false); setSettingsSec('ai'); setTab('settings') }} />}
      {editProject && (
        <ProjectEditor initial={editProject} me={email} onClose={() => setEditProject(null)}
          onSaved={async pr => { setEditProject(null); await loadProjects(); if (!editProject.id) { setPid(pr.id); setTab('rtm') } notify(`Project "${pr.name}" saved`) }}
          onDeleted={async () => { setEditProject(null); await loadProjects(); notify('Moved to trash — restore it from Projects → Trash') }} />
      )}
    </div>
    </ConfigContext.Provider>
  )
}
