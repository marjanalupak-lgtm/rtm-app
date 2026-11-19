// Side panel to create / edit one requirement, with status rules and history.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, FlexRow, FlexSpacer, IconButton, LabeledInput, TextInput, TextArea, DatePicker, Text, TabButton, WarningAlert, Panel } from '@epam/uui'
import { FIELDS, GATES, type Req, type Field, type Attachment } from './model'
import { useConfig, getVal, type CustomField } from './config'
import { check, allowedNext, gateFor } from './rules'
import { history as loadHistory, uploadAttachment, removeAttachmentFile, newLink, type HistoryEntry } from './store'
import { buildTree, levelOf } from './tree'
import { Select, CheckBadge } from './ui'
import { nextSchemeId, parseId } from './idScheme'

const GROUPS: Field['group'][] = ['Core', 'Traceability', 'Design', 'Governance', 'Verification']

export function Editor(p: {
  projectId: string; readOnly?: boolean; initial: Req; isNew: boolean; existingIds: Set<string>; allRows: Req[]
  onSave: (r: Req) => Promise<void>; onDelete: () => Promise<void>; onClose: () => void; onOpenOther: (r: Req) => void
  variant?: 'drawer' | 'pane'; onDirty?: (dirty: boolean) => void
}) {
  const [r, setR] = useState<Req>(p.initial)
  const [tab, setTab] = useState<'form' | 'history'>('form')
  const [hist, setHist] = useState<HistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setR(p.initial); setErr('') }, [p.initial])
  useEffect(() => { setErr(''); if (tab === 'history' && !p.isNew) loadHistory(p.projectId, p.initial.id).then(setHist).catch(e => setErr(String(e.message ?? e))) }, [tab, p.initial.id, p.isNew, p.projectId])

  const cfg = useConfig()
  const set = (k: keyof Req, v: string) => setR(x => ({ ...x, [k]: v }))
  const setX = (k: string, v: string) => setR(x => ({ ...x, extra: { ...(x.extra ?? {}), [k]: v } }))
  const gap = check(r, cfg)
  const statusFrom = p.isNew ? '' : p.initial.status
  const statusOpts = [...new Set([...allowedNext(statusFrom, cfg), ...(r.status ? [r.status] : [])])]
  const gate = p.isNew ? [] : gateFor(r, r.status, statusFrom, cfg)
  const idTaken = p.isNew && p.existingIds.has(r.id.trim())
  const designOff = r.design_required !== 'Yes'

  // Structured IDs (Settings › IDs): a new requirement gets the next free ID for its type + area;
  // an existing one is offered a new ID when its type or area no longer matches.
  const scheme = cfg.id.scheme?.on ? cfg.id.scheme : undefined
  const sc = p.isNew ? scheme : undefined
  const rule = scheme?.types[r.type]
  const needsArea = !!rule?.area
  const origParsed = scheme && !p.isNew ? parseId(p.initial.id, scheme.sep) : null
  const [area, setArea] = useState(origParsed?.area ?? scheme?.areas[0]?.code ?? '')
  const [idTouched, setIdTouched] = useState(false)
  useEffect(() => {
    if (!sc || idTouched) return
    const n = nextSchemeId(p.allRows, sc, r.type, area) ?? ''
    setR(x => x.id === n ? x : { ...x, id: n })
  }, [sc, r.type, area, idTouched, p.allRows])
  const fits = !!origParsed && !!rule?.code && origParsed.code === rule.code && (rule.area ? origParsed.area === area : !origParsed.area)
  const suggestion = scheme && !p.isNew && rule?.code && !fits && (!rule.area || area)
    ? nextSchemeId(p.allRows.filter(x => x.id !== p.initial.id), scheme, r.type, rule.area ? area : undefined) : null
  useEffect(() => { if (!suggestion && !p.isNew && r.id !== p.initial.id) set('id', p.initial.id) }, [suggestion]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (suggestion && r.id !== p.initial.id && r.id !== suggestion) set('id', suggestion) }, [suggestion]) // eslint-disable-line react-hooks/exhaustive-deps
  const idHint = scheme && !p.isNew ? 'Stable ID. Changes only if type or area changes.' : sc ? 'Filled in from type and area (next free number). Never reuse an ID.' : `Stable ID, e.g. ${cfg.id.prefix}${'1'.padStart(cfg.id.digits, '0')}. Never reuse.`
  useEffect(() => {
    if (!sc || idTouched) return
    const n = nextSchemeId(p.allRows, sc, r.type, area) ?? ''
    setR(x => x.id === n ? x : { ...x, id: n })
  }, [sc, r.type, area, idTouched, p.allRows])

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
  useEffect(() => { p.onDirty?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  // Switching to another requirement (side pane) discards files uploaded here but not saved.
  useEffect(() => () => { fresh.current.forEach(a => removeAttachmentFile(a)); fresh.current = [] }, [p.initial.id])
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
    if (f.key === 'id' && sc) return (
      <div className="id-builder">
        {needsArea && sc.areas.length > 0 && (
          <Select value={area} options={sc.areas.map(a => a.code)} labels={Object.fromEntries(sc.areas.map(a => [a.code, a.name ? `${a.code} · ${a.name}` : a.code]))}
            onChange={x => { setArea(x); setIdTouched(false) }} placeholder="Area" />
        )}
        <TextInput value={v} onValueChange={x => { setIdTouched(true); set('id', x ?? '') }} isInvalid={idTaken}
          placeholder={r.type ? 'Add areas in Settings › IDs' : 'Choose Requirement Type to get an ID'} />
      </div>
    )
    if (f.key === 'id' && scheme && !p.isNew) return (
      <div>
        <div className="id-builder">
          {needsArea && scheme.areas.length > 0 && !p.readOnly && (
            <Select value={area} options={scheme.areas.map(a => a.code)} labels={Object.fromEntries(scheme.areas.map(a => [a.code, a.name ? `${a.code} · ${a.name}` : a.code]))}
              onChange={x => setArea(x)} placeholder="Area" noClear />
          )}
          <TextInput value={v} onValueChange={() => {}} isDisabled />
        </div>
        {suggestion && !p.readOnly && (
          <div className="id-suggest" role="status">
            {r.id === suggestion
              ? <><span>Will be renamed from <b>{p.initial.id}</b> when you save. Links to it are updated too.</span>
                  <Button size="24" fill="outline" color="secondary" caption={`Keep ${p.initial.id}`} onClick={() => set('id', p.initial.id)} /></>
              : <><span>Type or area doesn't match the ID. New ID: <b>{suggestion}</b></span>
                  <Button size="24" fill="outline" color="primary" caption="Use new ID" onClick={() => set('id', suggestion)} /></>}
          </div>
        )}
      </div>
    )
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

  const pane = p.variant === 'pane'
  const body = (
      <Panel background="surface-main" shadow cx={pane ? 'pane' : 'drawer'}>
        <FlexRow padding="24" vPadding="18" borderBottom columnGap="12">
          <Text fontSize="18" fontWeight="600">{p.isNew ? 'New requirement' : r.id}</Text>
          <CheckBadge check={gap} />
          <FlexSpacer />
          <IconButton icon={() => <span className="pane-x" aria-hidden>×</span>} onClick={close} rawProps={{ 'aria-label': 'Close details', title: 'Close' }} />
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
                        footnote={f.key === 'status' && r.status && GATES[r.status] ? 'Gate: ' + GATES[r.status] : f.key === 'id' ? idHint : f.help}>
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
  )
  if (pane) return body
  return (
    <div className="drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      {body}
    </div>
  )
}

function customInput(c: CustomField, v: string, on: (v: string) => void) {
  if (c.type === 'list') return <Select value={v} options={[...new Set([...c.options, ...(v ? [v] : [])])]} onChange={on} />
  if (c.type === 'date') return <DatePicker value={v || null} onValueChange={x => on(x ?? '')} format="YYYY-MM-DD" />
  if (c.type === 'long') return <TextArea value={v} onValueChange={x => on(x ?? '')} rows={2} autoSize />
  return <TextInput value={v} onValueChange={x => on(x ?? '')} placeholder={c.type === 'link' ? 'ID or URL' : undefined} />
}
