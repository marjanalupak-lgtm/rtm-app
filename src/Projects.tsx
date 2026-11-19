// Projects tab: list of projects (cards) + side panel to create/edit a project and manage members.
import { useEffect, useState } from 'react'
import { Button, FlexRow, FlexSpacer, LabeledInput, Panel, Text, TextArea, TextInput, Badge, WarningAlert } from '@epam/uui'
import { traceCheck, type Req } from './model'
import * as store from './store'
import type { Project, Member } from './store'
import { Select } from './ui'

const STATUSES = ['Active', 'On Hold', 'Closed'] as const
export const emptyProject = (): Project => ({ id: '', name: '', organization: '', description: '', status: 'Active' })

function coverage(rows: Req[]) {
  const live = rows.filter(r => r.statement && r.status !== 'Obsolete' && r.status !== 'Rejected')
  if (!live.length) return { total: 0, pct: 0, gaps: 0 }
  const ok = live.filter(r => traceCheck(r) === 'COVERED').length
  return { total: live.length, pct: Math.round((ok / live.length) * 100), gaps: live.length - ok }
}

export function ProjectsTab(p: {
  projects: Project[]; currentId: string; onOpen: (id: string) => void; onEdit: (pr: Project) => void
}) {
  const [stats, setStats] = useState<Record<string, Req[]>>({})
  const [showClosed, setShowClosed] = useState(false)
  useEffect(() => { store.projectStats().then(setStats).catch(() => {}) }, [p.projects])
  const list = p.projects.filter(x => showClosed || x.status !== 'Closed')
  const closed = p.projects.length - p.projects.filter(x => x.status !== 'Closed').length

  return (
    <div className="dash">
      <FlexRow columnGap="12" cx="toolbar">
        <Text fontSize="18" fontWeight="600">Projects</Text>
        <Text color="secondary">{p.projects.length} total</Text>
        <FlexSpacer />
        {closed > 0 && <Button fill="none" color="secondary" caption={showClosed ? 'Hide closed' : `Show closed (${closed})`} onClick={() => setShowClosed(s => !s)} />}
        <Button color="accent" caption="+ Project" onClick={() => p.onEdit(emptyProject())} />
      </FlexRow>
      {!p.projects.length && (
        <Panel background="surface-main" shadow cx="empty">
          <Text fontSize="16" fontWeight="600">Create your first project</Text>
          <Text color="secondary">One project = one RTM (e.g. one client, product or study). Requirement IDs are numbered per project.</Text>
        </Panel>
      )}
      <div className="cards">
        {list.map(pr => {
          const c = coverage(stats[pr.id] ?? [])
          return (
            <Panel key={pr.id} background="surface-main" shadow cx={'card project-card' + (pr.id === p.currentId ? ' current' : '')}>
              <FlexRow columnGap="12">
                <Text fontSize="18" fontWeight="600" cx="pc-name">{pr.name}</Text>
                <FlexSpacer />
                <Badge size="24" fill="outline" color={pr.status === 'Active' ? 'success' : pr.status === 'On Hold' ? 'warning' : 'neutral'} caption={pr.status} />
              </FlexRow>
              {pr.organization && <Text color="secondary" fontSize="14">{pr.organization}</Text>}
              {pr.description && <Text fontSize="14" cx="pc-desc">{pr.description}</Text>}
              <div className="pc-stats">
                <div><b>{c.total}</b><span>requirements</span></div>
                <div><b>{c.pct}%</b><span>coverage</span></div>
                <div><b>{c.gaps}</b><span>open gaps</span></div>
              </div>
              <FlexRow columnGap="12">
                <Button color="primary" caption={pr.id === p.currentId ? 'Opened' : 'Open RTM'} onClick={() => p.onOpen(pr.id)} />
                <Button fill="outline" color="secondary" caption="Settings" onClick={() => p.onEdit(pr)} />
              </FlexRow>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

export function ProjectEditor(p: {
  initial: Project; me: string; onSaved: (pr: Project) => void; onDeleted: () => void; onClose: () => void
}) {
  const [pr, setPr] = useState<Project>(p.initial)
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Member['role']>('member')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const isNew = !p.initial.id
  const loadMembers = () => { if (!isNew) store.listMembers(p.initial.id).then(setMembers).catch(e => setErr(e.message)) }
  useEffect(loadMembers, [p.initial.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const amOwner = store.mode === 'local' || isNew || members.some(m => m.email === p.me.toLowerCase() && m.role === 'owner')
  const set = (k: keyof Project, v: string) => setPr(x => ({ ...x, [k]: v }))

  const save = async () => {
    if (!pr.name.trim()) return setErr('Project name is required.')
    setBusy(true); setErr('')
    try { p.onSaved(await store.saveProject(pr)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const add = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email.')
    try { await store.addMember(p.initial.id, email, role); setEmail(''); setErr(''); loadMembers() } catch (e) { setErr((e as Error).message) }
  }
  const owners = members.filter(m => m.role === 'owner').length

  return (
    <div className="drawer-wrap" onClick={p.onClose}>
      <Panel background="surface-main" shadow cx="drawer drawer-narrow" onClick={e => e.stopPropagation()}>
        <FlexRow padding="24" vPadding="18" borderBottom columnGap="12">
          <Text fontSize="18" fontWeight="600">{isNew ? 'New project' : pr.name}</Text>
          <FlexSpacer />
          <Button fill="none" color="secondary" caption="Close" onClick={p.onClose} />
        </FlexRow>
        <div className="drawer-body">
          {err && <WarningAlert cx="mb">{err}</WarningAlert>}
          {!amOwner && <Text color="secondary" cx="mb">Only project owners can change settings and members.</Text>}
          <div className="form-grid">
            <div className="span2"><LabeledInput label="Project name" isRequired><TextInput value={pr.name} onValueChange={v => set('name', v ?? '')} isDisabled={!amOwner} placeholder="e.g. Patient app MVP" /></LabeledInput></div>
            <LabeledInput label="Organization / client"><TextInput value={pr.organization} onValueChange={v => set('organization', v ?? '')} isDisabled={!amOwner} /></LabeledInput>
            <LabeledInput label="Status"><Select value={pr.status} options={STATUSES} onChange={v => set('status', v)} isDisabled={!amOwner} /></LabeledInput>
            <div className="span2"><LabeledInput label="Description"><TextArea value={pr.description} onValueChange={v => set('description', v ?? '')} rows={3} isDisabled={!amOwner} /></LabeledInput></div>
          </div>

          {!isNew && store.mode === 'cloud' && (
            <section className="form-group members">
              <Text fontSize="14" fontWeight="600" color="secondary" cx="group-title">MEMBERS</Text>
              <Text fontSize="12" color="secondary">Only members see this project. Owners manage settings and members; members edit requirements.</Text>
              {members.map(m => (
                <FlexRow key={m.email} columnGap="12" cx="member-row">
                  <Text cx="member-email">{m.email}{m.email === p.me.toLowerCase() ? ' (you)' : ''}</Text>
                  <Badge size="24" fill="outline" color={m.role === 'owner' ? 'info' : 'neutral'} caption={m.role} />
                  {amOwner && !(m.role === 'owner' && owners === 1) && (
                    <Button size="24" fill="none" color="critical" caption="Remove" onClick={() => store.removeMember(p.initial.id, m.email).then(loadMembers).catch(e => setErr(e.message))} />
                  )}
                </FlexRow>
              ))}
              {amOwner && (
                <FlexRow columnGap="12" cx="member-add">
                  <div className="grow"><TextInput value={email} onValueChange={v => setEmail(v ?? '')} placeholder="colleague@company.com" /></div>
                  <div className="role"><Select value={role} options={['member', 'owner']} onChange={v => setRole(v as Member['role'])} /></div>
                  <Button color="primary" caption="Add" onClick={add} />
                </FlexRow>
              )}
              <Text fontSize="12" color="secondary">After adding, the colleague signs in at this app's address with that email.</Text>
            </section>
          )}
        </div>
        <FlexRow padding="24" vPadding="12" columnGap="12" cx="drawer-foot">
          {!isNew && amOwner && <Button color="critical" fill="outline" caption="Delete project" onClick={() => {
            if (confirm(`Delete "${pr.name}" and ALL its requirements and history? This cannot be undone.`)) store.deleteProject(pr.id).then(p.onDeleted).catch(e => setErr(e.message))
          }} />}
          <FlexSpacer />
          <Button fill="outline" color="secondary" caption="Cancel" onClick={p.onClose} />
          {amOwner && <Button color="primary" caption={busy ? 'Saving…' : isNew ? 'Create project' : 'Save'} isDisabled={busy} onClick={save} />}
        </FlexRow>
      </Panel>
    </div>
  )
}
