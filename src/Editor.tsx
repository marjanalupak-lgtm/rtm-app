// Side panel to create / edit one requirement, with status rules and history.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, FlexRow, FlexSpacer, LabeledInput, TextInput, TextArea, DatePicker, Text, TabButton, WarningAlert, Panel } from '@epam/uui'
import { FIELDS, GATES, type Req, type Field, type Attachment } from './model'
import { useConfig, getVal, type CustomField } from './config'
import { check, allowedNext, gateFor } from './rules'
import { history as loadHistory, uploadAttachment, removeAttachmentFile, newLink, type HistoryEntry } from './store'
import { buildTree, levelOf } from './tree'
import { Select, CheckBadge } from './ui'

const GROUPS: Field['group'][] = ['Core', 'Traceability', 'Design', 'Governance', 'Verification']

export function Editor(p: {
  projectId: string; readOnly?: boolean; initial: Req; isNew: boolean; existingIds: Set<string>; allRows: Req[]
  onSave: (r: Req) => Promise<void>; onDelete: () => Promise<void>; onClose: () => void; onOpenOther: (r: Req) => void
}) {
  const [r, setR] = useState<Req>(p.initial)
  const [tab, setTab] = useState<'form' | 'history'>('form')
  const [hist, setHist] = useState<HistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setR(p.initial); setErr('') }, [p.initial])
  useEffect(() => { if (tab === 'history' && !p.isNew) loadHistory(p.projectId, p.initial.id).then(setHist).catch(e => setErr(String(e.message ?? e))) }, [tab, p.initial.id, p.isNew, p.projectId])

  const cfg = useConfig()
  const set = (k: keyof Req, v: string) => setR(x => ({ ...x, [k]: v }))
  const setX = (k: string, v: string) => setR(x => ({ ...x, extra: { ...(x.extra ?? {}), [k]: v } }))
  const gap = check(r, cfg)
  const statusFrom = p.isNew ? '' : p.initial.status
  const statusOpts = [...new Set([...allowedNext(statusFrom, cfg), ...(r.status ? [r.status] : [])])]
  const gate = p.isNew ? [] : gateFor(r, r.status, statusFrom, cfg)
  const idTaken = p.isNew && p.existingIds.has(r.id.trim())
  const designOff = r.design_required !== 'Yes'

  // Trace links (parents / children) from the whole project.
  const tree = useMemo(() => buildTree([...p.allRows.filter(x => x.id !== p.initial.id), r]), [p.allRows, r, p.initial.id])
  const parents = r.id ? tree.parentsOf(r.id) : []
  const children = p.isNew ? [] : tree.childrenOf(r.id)
  const parentOpts = p.allRows.filter(x => x.id && x.id !== r.id && levelOf(x.type) <= levelOf(r.type) && !parents.some(y => y.id === x.id))
  const linkParent = (id: string) => { if (id) set('parent', [r.parent.trim(), id].filter(Boolean).join(', ')) }

  // Attachments: files uploaded in this session but not saved are moved to Drive trash on cancel.
  const fresh = useRef<Attachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [uploading, setUploading] = useState('')
  const atts = r.attachments ?? []
  const setAtts = (a: Attachment[]) => setR(x => ({ ...x, attachments: a }))
  const addLink = async () => {
    const u = linkUrl.trim()
    if (!/^https?:\/\/\S+$/i.test(u)) return setErr('Link must start with http:// or https://')
    setAtts([...atts, await newLink(linkName, u)]); setLinkName(''); setLinkUrl(''); setErr('')
  }
  const upload = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      setUploading(f.name); setErr('')
      try { const a = await uploadAttachment(p.projectId, r.id, f); fresh.current.push(a); setR(x => ({ ...x, attachments: [...(x.attachments ?? []), a] })) }
      catch (e) { setErr((e as Error).message) }
    }
    setUploading('')
  }
  const remove = (a: Attachment) => {
    setAtts(atts.filter(x => x.id !== a.id))
    if (fresh.current.some(x => x.id === a.id)) { removeAttachmentFile(a); fresh.current = fresh.current.filter(x => x.id !== a.id) }
  }
  const dirty = JSON.stringify(r) !== JSON.stringify(p.initial)
  const close = () => {
    if (dirty && !p.readOnly && !confirm('Discard unsaved changes?')) return
    fresh.current.forEach(a => removeAttachmentFile(a)); fresh.current = []
    p.onClose()
  }
  const goTo = (x: Req) => { if (dirty && !p.readOnly && !confirm('Discard unsaved changes?')) return; fresh.current.forEach(a => removeAttachmentFile(a)); fresh.current = []; p.onOpenOther(x) }

  const save = async () => {
    setErr('')
    if (!r.id.trim()) return setErr('Requirement ID is required.')
    if (idTaken) return setErr(`ID ${r.id} already exists. IDs are never reused.`)
    if (gate.length) return setErr('Before moving to "' + r.status + '" fill: ' + gate.join(', '))
    setBusy(true)
    try { await p.onSave(r); fresh.current = [] } catch (e) { setErr(String((e as Error).message ?? e)) } finally { setBusy(false) }
  }

  const input = (f: Field) => {
    const v = String(r[f.key] ?? '')
    const disabled = (f.group === 'Design' && f.key !== 'design_required' && designOff) || (f.key === 'id' && !p.isNew)
    if (f.key === 'status') return <Select value={v} options={statusOpts} onChange={x => set('status', x)} />
    if (f.key === 'release' && cfg.lists.release.length) return <Select value={v} options={[...new Set([...cfg.lists.release, ...(v ? [v] : [])])]} onChange={x => set('release', x)} />
    if (f.list) return <Select value={v} options={[...new Set([...cfg.lists[f.list], ...(v ? [v] : [])])]} onChange={x => set(f.key, x)} isDisabled={disabled} />
    if (f.key === 'parent') return (
      <div className="parent-field">
        <TextInput value={v} onValueChange={x => set('parent', x ?? '')} placeholder="Parent ID(s), e.g. BR-001, or a business objective" />
        {!p.readOnly && parentOpts.length > 0 && (
          <Select value="" options={parentOpts.map(x => x.id)} labels={Object.fromEntries(parentOpts.map(x => [x.id, `${x.id} · ${x.type || '—'} · ${x.statement.slice(0, 60)}`]))}
            onChange={linkParent} placeholder="Link parent requirement…" />
        )}
      </div>
    )
    if (f.key === 'date_added') return <DatePicker value={v || null} onValueChange={x => set('date_added', x ?? '')} format="YYYY-MM-DD" />
    if (f.long) return <TextArea value={v} onValueChange={x => set(f.key, x ?? '')} rows={f.key === 'statement' ? 4 : 2} autoSize />
    return <TextInput value={v} onValueChange={x => set(f.key, x ?? '')} isDisabled={disabled} placeholder={f.link ? 'ID or URL' : undefined} isInvalid={f.key === 'id' && idTaken} />
  }

  return (
    <div className="drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <Panel background="surface-main" shadow cx="drawer">
        <FlexRow padding="24" vPadding="18" borderBottom columnGap="12">
          <Text fontSize="18" fontWeight="600">{p.isNew ? 'New requirement' : r.id}</Text>
          <CheckBadge check={gap} />
          <FlexSpacer />
          <Button fill="none" color="secondary" caption="Close" onClick={close} />
        </FlexRow>
        {!p.isNew && (
          <FlexRow padding="24" borderBottom>
            <TabButton caption="Details" isActive={tab === 'form'} onClick={() => setTab('form')} size="48" />
            <TabButton caption="History" isActive={tab === 'history'} onClick={() => setTab('history')} size="48" />
          </FlexRow>
        )}
        <div className="drawer-body">
          {err && <WarningAlert cx="mb">{err}</WarningAlert>}
          {tab === 'form' ? <>{GROUPS.map(g => {
            const fs = FIELDS.filter(f => f.group === g && cfg.fields[f.key].visible)
            if (!fs.length) return null
            return (
              <section key={g} className="form-group">
                <Text fontSize="14" fontWeight="600" color="secondary" cx="group-title">{g.toUpperCase()}</Text>
                <div className="form-grid">
                  {fs.map(f => (
                    <div key={f.key} className={f.long ? 'span2' : ''}>
                      <LabeledInput label={cfg.fields[f.key].label} isRequired={cfg.fields[f.key].required} sidenote={!cfg.fields[f.key].required && f.req === '†' ? 'conditional' : undefined}
                        footnote={f.key === 'status' && r.status && GATES[r.status] ? 'Gate: ' + GATES[r.status] : f.help}>
                        {input(f)}
                      </LabeledInput>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
          {cfg.custom.length > 0 && (
            <section className="form-group">
              <Text fontSize="14" fontWeight="600" color="secondary" cx="group-title">CUSTOM</Text>
              <div className="form-grid">
                {cfg.custom.map(c => (
                  <div key={c.key} className={c.type === 'long' ? 'span2' : ''}>
                    <LabeledInput label={c.label} isRequired={c.required}>{customInput(c, getVal(r, c.key), v => setX(c.key, v))}</LabeledInput>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="form-group">
            <Text fontSize="14" fontWeight="600" color="secondary" cx="group-title">TRACE LINKS</Text>
            <div className="links-grid">
              <div><Text fontSize="12" color="secondary">Parents</Text>
                {parents.length ? parents.map(x => <button key={x.id} className="trace-chip" onClick={() => goTo(x)}>{x.id} · {x.type || '—'}</button>) : <Text fontSize="14" color="secondary">{levelOf(r.type) === 0 ? 'Top level (Business)' : 'None — link a parent above'}</Text>}
              </div>
              <div><Text fontSize="12" color="secondary">Children ({children.length})</Text>
                {children.length ? children.map(x => <button key={x.id} className="trace-chip" onClick={() => goTo(x)}>{x.id} · {x.type || '—'}</button>) : <Text fontSize="14" color="secondary">None yet</Text>}
              </div>
            </div>
          </section>
          <section className="form-group">
            <Text fontSize="14" fontWeight="600" color="secondary" cx="group-title">ATTACHMENTS & LINKS ({atts.length})</Text>
            {atts.map(a => (
              <FlexRow key={a.id} columnGap="12" cx="att-row">
                <span className={'att-kind ' + a.kind}>{a.kind === 'file' ? 'FILE' : 'LINK'}</span>
                <a className="att-name" href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                <Text fontSize="12" color="secondary" cx="att-meta">{a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB · ` : ''}{a.added_by} · {new Date(a.added_at).toLocaleDateString()}</Text>
                {!p.readOnly && <Button size="24" fill="none" color="critical" caption="Remove" onClick={() => remove(a)} />}
              </FlexRow>
            ))}
            {!atts.length && <Text fontSize="14" color="secondary">No attachments or links yet.</Text>}
            {!p.readOnly && (
              <>
                <FlexRow columnGap="12" cx="att-add">
                  <div className="att-name-in"><TextInput value={linkName} onValueChange={v => setLinkName(v ?? '')} placeholder="Link name (e.g. Jira PROJ-145)" /></div>
                  <div className="grow"><TextInput value={linkUrl} onValueChange={v => setLinkUrl(v ?? '')} placeholder="https://…" onAccept={addLink} /></div>
                  <Button fill="outline" color="primary" caption="Add link" onClick={addLink} />
                </FlexRow>
                <FlexRow columnGap="12" cx="att-add">
                  <Button fill="outline" color="secondary" caption={uploading ? `Uploading ${uploading}…` : 'Upload file'} isDisabled={!!uploading || !r.id.trim()} onClick={() => fileRef.current?.click()} />
                  <Text fontSize="12" color="secondary">Up to 50 MB. Saved to your Google Drive (RTM / Attachments) and shared read-only with project members. Click Save to keep.</Text>
                  <input ref={fileRef} type="file" multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
                </FlexRow>
              </>
            )}
          </section></> : (
            <div className="history">
              {!hist.length && <Text color="secondary">No changes recorded yet.</Text>}
              {hist.map((h, i) => (
                <div key={i} className="hist-item">
                  <Text fontSize="14"><b>{h.action}</b> · {h.changed_by} · {new Date(h.changed_at).toLocaleString()}</Text>
                  {h.changes.map((c, j) => <Text key={j} fontSize="12" color="secondary">{c.field}: “{c.from || '—'}” → “{c.to || '—'}”</Text>)}
                </div>
              ))}
            </div>
          )}
        </div>
        <FlexRow padding="24" vPadding="12" borderBottom={false} columnGap="12" cx="drawer-foot">
          {p.readOnly && <Text color="secondary">View only — you have viewer access to this project.</Text>}
          {!p.isNew && !p.readOnly && <Button color="critical" fill="outline" caption="Delete" onClick={() => { if (confirm(`Delete ${r.id}? Prefer status "Obsolete" to keep audit trail.`)) p.onDelete() }} />}
          <FlexSpacer />
          <Button fill="outline" color="secondary" caption="Cancel" onClick={close} />
          {!p.readOnly && <Button color="primary" caption={busy ? 'Saving…' : 'Save'} isDisabled={busy} onClick={save} />}
        </FlexRow>
      </Panel>
    </div>
  )
}

function customInput(c: CustomField, v: string, on: (v: string) => void) {
  if (c.type === 'list') return <Select value={v} options={[...new Set([...c.options, ...(v ? [v] : [])])]} onChange={on} />
  if (c.type === 'date') return <DatePicker value={v || null} onValueChange={x => on(x ?? '')} format="YYYY-MM-DD" />
  if (c.type === 'long') return <TextArea value={v} onValueChange={x => on(x ?? '')} rows={2} autoSize />
  return <TextInput value={v} onValueChange={x => on(x ?? '')} placeholder={c.type === 'link' ? 'ID or URL' : undefined} />
}
