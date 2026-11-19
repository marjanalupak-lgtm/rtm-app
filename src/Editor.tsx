// Side panel to create / edit one requirement, with status rules and history.
import { useEffect, useState } from 'react'
import { Button, FlexRow, FlexSpacer, LabeledInput, TextInput, TextArea, DatePicker, Text, TabButton, WarningAlert, Panel } from '@epam/uui'
import { FIELDS, GATES, type Req, type Field } from './model'
import { useConfig, getVal, type CustomField } from './config'
import { check, allowedNext, gateFor } from './rules'
import { history as loadHistory, type HistoryEntry } from './store'
import { Select, CheckBadge } from './ui'

const GROUPS: Field['group'][] = ['Core', 'Traceability', 'Design', 'Governance', 'Verification']

export function Editor(p: {
  projectId: string; initial: Req; isNew: boolean; existingIds: Set<string>
  onSave: (r: Req) => Promise<void>; onDelete: () => Promise<void>; onClose: () => void
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

  const save = async () => {
    setErr('')
    if (!r.id.trim()) return setErr('Requirement ID is required.')
    if (idTaken) return setErr(`ID ${r.id} already exists. IDs are never reused.`)
    if (gate.length) return setErr('Before moving to "' + r.status + '" fill: ' + gate.join(', '))
    setBusy(true)
    try { await p.onSave(r) } catch (e) { setErr(String((e as Error).message ?? e)) } finally { setBusy(false) }
  }

  const input = (f: Field) => {
    const v = String(r[f.key] ?? '')
    const disabled = (f.group === 'Design' && f.key !== 'design_required' && designOff) || (f.key === 'id' && !p.isNew)
    if (f.key === 'status') return <Select value={v} options={statusOpts} onChange={x => set('status', x)} />
    if (f.key === 'release' && cfg.lists.release.length) return <Select value={v} options={[...new Set([...cfg.lists.release, ...(v ? [v] : [])])]} onChange={x => set('release', x)} />
    if (f.list) return <Select value={v} options={[...new Set([...cfg.lists[f.list], ...(v ? [v] : [])])]} onChange={x => set(f.key, x)} isDisabled={disabled} />
    if (f.key === 'date_added') return <DatePicker value={v || null} onValueChange={x => set('date_added', x ?? '')} format="YYYY-MM-DD" />
    if (f.long) return <TextArea value={v} onValueChange={x => set(f.key, x ?? '')} rows={f.key === 'statement' ? 4 : 2} autoSize />
    return <TextInput value={v} onValueChange={x => set(f.key, x ?? '')} isDisabled={disabled} placeholder={f.link ? 'ID or URL' : undefined} isInvalid={f.key === 'id' && idTaken} />
  }

  return (
    <div className="drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) p.onClose() }}>
      <Panel background="surface-main" shadow cx="drawer">
        <FlexRow padding="24" vPadding="18" borderBottom columnGap="12">
          <Text fontSize="18" fontWeight="600">{p.isNew ? 'New requirement' : r.id}</Text>
          <CheckBadge check={gap} />
          <FlexSpacer />
          <Button fill="none" color="secondary" caption="Close" onClick={p.onClose} />
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
          )}</> : (
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
          {!p.isNew && <Button color="critical" fill="outline" caption="Delete" onClick={() => { if (confirm(`Delete ${r.id}? Prefer status "Obsolete" to keep audit trail.`)) p.onDelete() }} />}
          <FlexSpacer />
          <Button fill="outline" color="secondary" caption="Cancel" onClick={p.onClose} />
          <Button color="primary" caption={busy ? 'Saving…' : 'Save'} isDisabled={busy} onClick={save} />
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
