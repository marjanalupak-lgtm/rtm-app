import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useUuiContext } from '@epam/uui-core'
import { Button, FlexRow, FlexSpacer, SearchInput, TabButton, Text, TextInput, Panel, SuccessNotification, ErrorNotification, LabeledInput, Badge } from '@epam/uui'
import { emptyReq, nextId, traceCheck, severity, LISTS, type Req } from './model'
import * as store from './store'
import { RtmTable } from './RtmTable'
import { Dashboard } from './Dashboard'
import { Guide } from './Guide'
import { Editor } from './Editor'
import { MultiSelect } from './ui'

type Tab = 'dashboard' | 'rtm' | 'guide'
const TABS: [Tab, string][] = [['dashboard', 'Dashboard'], ['rtm', 'RTM'], ['guide', 'Guide & rules']]

function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="login">
      <Panel background="surface-main" shadow cx="login-card">
        <Text fontSize="24" fontWeight="600">RTM</Text>
        <Text color="secondary">Requirements Traceability Matrix — sign in with your work email.</Text>
        {sent ? <Text>Check your inbox for a sign-in link.</Text> : (
          <>
            <LabeledInput label="Email"><TextInput value={email} onValueChange={v => setEmail(v ?? '')} placeholder="name@company.com" /></LabeledInput>
            {err && <Text color="critical">{err}</Text>}
            <Button color="primary" caption="Send sign-in link" onClick={() => store.sendMagicLink(email).then(() => setSent(true)).catch(e => setErr(e.message))} />
          </>
        )}
      </Panel>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(store.mode === 'local')
  useEffect(() => {
    if (store.mode === 'local') return
    store.getSession().then(s => { setSession(s); setAuthReady(true) })
    return store.onAuth(setSession)
  }, [])
  if (!authReady) return null
  if (store.mode === 'cloud' && !session) return <Login />
  return <Main email={session?.user.email ?? ''} />
}

function Main({ email }: { email: string }) {
  const { uuiNotifications } = useUuiContext()
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('rtm.tab') as Tab) || 'rtm')
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

  const reload = useCallback(() => store.listReqs().then(setRows).catch(e => notify('Load failed: ' + e.message, false)), [notify])
  useEffect(() => { reload(); return store.subscribe(reload) }, [reload])
  useEffect(() => { try { localStorage.setItem('rtm.tab', tab) } catch { /* ignore */ } }, [tab])

  const releases = useMemo(() => [...new Set(rows.map(r => r.release).filter(Boolean))].sort(), [rows])
  const filtered = useMemo(() => {
    const s = q.toLowerCase()
    return rows.filter(r => {
      if (s && !Object.values(r).some(v => String(v ?? '').toLowerCase().includes(s))) return false
      if (fStatus.length && !fStatus.includes(r.status)) return false
      if (fRelease.length && !fRelease.includes(r.release)) return false
      if (fCheck.length) {
        const sev = severity(traceCheck(r))
        const label = sev === 'ok' ? 'Covered' : sev === 'bad' ? 'Critical gap' : sev === 'warn' ? 'Gap' : ''
        if (!fCheck.includes(label)) return false
      }
      return true
    })
  }, [rows, q, fStatus, fRelease, fCheck])

  const onImport = async (file: File) => {
    try {
      const incoming = await (await import('./excel')).importExcel(file)
      const n = await store.bulkSave(incoming, rows)
      await reload()
      notify(`Imported ${incoming.length} rows (${n} new or changed).`)
    } catch (e) { notify('Import failed: ' + (e as Error).message, false) }
  }

  const open = (r: Req) => setEditing({ r, isNew: false })

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">RTM</div>
        {TABS.map(([k, c]) => <TabButton key={k} caption={c} isActive={tab === k} onClick={() => setTab(k)} size="60" cx="toptab" />)}
        <FlexSpacer />
        {store.mode === 'local'
          ? <Badge size="24" color="warning" caption="Local demo — data stays in this browser" />
          : <Text cx="who">{email}</Text>}
        {store.mode === 'cloud' && <Button fill="none" color="white" caption="Sign out" onClick={() => store.signOut()} />}
      </header>

      <main className="content">
        {tab !== 'guide' && (
          <FlexRow columnGap="12" cx="toolbar" rawProps={{ role: 'toolbar' }}>
            <div className="search"><SearchInput value={q} onValueChange={v => setQ(v ?? '')} placeholder="Search all fields" debounceDelay={150} /></div>
            {tab === 'rtm' && <>
              <div className="filter"><MultiSelect value={fStatus} options={LISTS.status} onChange={setFStatus} placeholder="Status" /></div>
              <div className="filter"><MultiSelect value={fRelease} options={releases} onChange={setFRelease} placeholder="Release" /></div>
              <div className="filter"><MultiSelect value={fCheck} options={['Covered', 'Gap', 'Critical gap']} onChange={setFCheck} placeholder="Traceability" /></div>
            </>}
            <FlexSpacer />
            <Text color="secondary" fontSize="14">{filtered.length} of {rows.length}</Text>
            <Button fill="outline" color="secondary" caption="Import Excel" onClick={() => fileRef.current?.click()} />
            <Button fill="outline" color="secondary" caption="Export Excel" onClick={() => import('./excel').then(m => m.exportExcel(filtered))} />
            <Button color="accent" caption="+ Requirement" onClick={() => setEditing({ r: emptyReq(nextId(rows)), isNew: true })} />
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
          </FlexRow>
        )}
        {tab === 'dashboard' && <Dashboard rows={filtered} onOpen={open} />}
        {tab === 'rtm' && <RtmTable rows={filtered} onOpen={open} />}
        {tab === 'guide' && <Guide />}
      </main>

      {editing && (
        <Editor
          initial={editing.r} isNew={editing.isNew} existingIds={new Set(rows.map(r => r.id))}
          onClose={() => setEditing(null)}
          onSave={async r => {
            const prev = editing.isNew ? undefined : rows.find(x => x.id === editing.r.id)
            await store.saveReq(r, prev)
            await reload(); setEditing(null); notify(`${r.id} saved`)
          }}
          onDelete={async () => { await store.deleteReq(editing.r); await reload(); setEditing(null); notify(`${editing.r.id} deleted`) }}
        />
      )}
    </div>
  )
}
