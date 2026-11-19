// Project settings: IDs, lists, fields, custom fields, traceability rules, status workflow.
import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, FlexRow, FlexSpacer, IconButton, LabeledInput, NumericInput, Panel, Switch, Text, TextInput, VerticalTabButton, Badge } from '@epam/uui'
import { FIELDS } from './model'
import { CORE_FIELDS, LIST_LABELS, LOCKED, RULES, defaultConfig, newCustomKey, normalize, type Config, type CustomField, type CustomType, type FieldKey, type RuleKey } from './config'
import * as store from './store'
import { Select } from './ui'
import type { Req } from './model'
import { defaultScheme, detectScheme, example, type IdScheme } from './idScheme'
import { planRename, toMap, type Plan } from './idRename'
import { RenameModal } from './RenameModal'
import { useUuiContext } from '@epam/uui-core'

type Section = 'general' | 'lists' | 'fields' | 'custom' | 'rules' | 'workflow'
const SECTIONS: [Section, string][] = [['general', 'IDs'], ['lists', 'Lists'], ['fields', 'Fields'], ['custom', 'Custom fields'], ['rules', 'Traceability rules'], ['workflow', 'Status workflow']]
const CUSTOM_TYPES: CustomType[] = ['text', 'long', 'list', 'link', 'date']
type ListName = keyof Config['lists']

export function Settings(p: { projectId: string; rows: Req[]; onRowsChanged: () => Promise<void> | void; config: Config; isOwner: boolean; onSaved: () => void; notify: (m: string, ok?: boolean) => void }) {
  const [cfg, setCfg] = useState<Config>(p.config)
  const [sec, setSec] = useState<Section>('lists')
  const [listName, setListName] = useState<ListName>('release')
  const owner = store.mode === 'local' || p.isOwner
  const [busy, setBusy] = useState(false)
  useEffect(() => setCfg(p.config), [p.config])
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(p.config), [cfg, p.config])
  const ro = !owner

  const up = (fn: (c: Config) => void) => setCfg(c => { const n = structuredClone(c); fn(n); return n })
  const { uuiModals } = useUuiContext()
  const askRename = (plan: Plan, title: string, skipLabel?: string) =>
    uuiModals.show<'rename' | 'skip'>(props => <RenameModal {...props} plan={plan} title={title} skipLabel={skipLabel} />).catch(() => null)
  const rename = async (plan: Plan) => {
    const n = await store.renameIds(p.projectId, toMap(plan.items))
    await p.onRowsChanged()
    p.notify(`${n} requirement${n === 1 ? '' : 's'} updated`)
  }
  const save = async () => {
    const n = normalize(cfg)
    const prevS = p.config.id.scheme, nextS = n.id.scheme
    // Structure changed → offer to rename existing IDs to match.
    const plan = prevS?.on && nextS?.on && JSON.stringify(prevS) !== JSON.stringify(nextS) ? planRename(p.rows, prevS, nextS) : null
    let choice: 'rename' | 'skip' | null = 'skip'
    if (plan?.items.length) choice = await askRename(plan, 'Rename existing IDs to the new structure?', 'Save settings only')
    if (!choice) return
    setBusy(true)
    try {
      await store.saveConfig(p.projectId, n); setCfg(n); p.onSaved(); p.notify('Settings saved')
      if (choice === 'rename' && plan) await rename(plan)
    }
    catch (e) { p.notify('Save failed: ' + (e as Error).message, false) } finally { setBusy(false) }
  }
  // Bring IDs that don't follow the saved structure (e.g. after a type change) in line.
  const checkIds = async () => {
    const sc = p.config.id.scheme
    if (!sc?.on) return
    const plan = planRename(p.rows, sc, sc)
    if (!plan.items.length) return p.notify('All IDs follow the structure' + (plan.skipped.length ? ` (${plan.skipped.length} skipped)` : ''))
    if (await askRename(plan, 'Update IDs that don\'t follow the structure?') !== 'rename') return
    setBusy(true)
    try { await rename(plan) } catch (e) { p.notify('Rename failed: ' + (e as Error).message, false) } finally { setBusy(false) }
  }

  return (
    <div className="settings">
      <FlexRow columnGap="12" cx="toolbar">
        <Text fontSize="18" fontWeight="600">Project settings</Text>
        {ro && <Badge size="24" color="neutral" fill="outline" caption="Read only — only owners can change settings" />}
        <FlexSpacer />
        {!ro && <Button fill="none" color="secondary" caption="Reset to defaults" onClick={() => { if (confirm('Reset all settings of this project to defaults? Data is not affected.')) setCfg(defaultConfig()) }} />}
        {!ro && dirty && <Button fill="outline" color="secondary" caption="Discard" onClick={() => setCfg(p.config)} />}
        {!ro && <Button color="primary" caption={busy ? 'Saving…' : 'Save settings'} isDisabled={!dirty || busy} onClick={save} />}
      </FlexRow>
      <div className="settings-grid">
        <Panel background="surface-main" shadow cx="settings-nav">
          {SECTIONS.map(([k, c]) => <VerticalTabButton key={k} caption={c} isActive={sec === k} onClick={() => setSec(k)} />)}
        </Panel>
        <Panel background="surface-main" shadow cx="card settings-body">
          {sec === 'general' && (() => {
            const sc: IdScheme = cfg.id.scheme ?? defaultScheme(cfg.lists.type)
            const upS = (fn: (x: IdScheme) => void) => up(c => { const x = structuredClone(c.id.scheme ?? defaultScheme(c.lists.type)); fn(x); c.id.scheme = x })
            const detect = () => up(c => { c.id.scheme = { ...detectScheme(p.rows, c.lists.type, c.id.scheme), on: true } })
            return (
            <>
              <FlexRow columnGap="12">
                <Text fontSize="16" fontWeight="600">Requirement IDs</Text>
                <FlexSpacer />
                {!ro && p.config.id.scheme?.on && <Button fill="outline" color="secondary" caption="Update IDs to match" isDisabled={dirty || busy} onClick={checkIds}
                  rawProps={{ title: dirty ? 'Save settings first' : 'Rename IDs that don\'t follow the saved structure, e.g. after a type change' }} />}
                {!ro && <Button fill="outline" color="secondary" caption="Detect from my requirements" isDisabled={!p.rows.length} onClick={detect}
                  rawProps={{ title: 'Read areas, type codes and number length from the IDs already in this project' }} />}
              </FlexRow>
              <Switch label="Structured IDs: area + type code + number (e.g. ST-FR-001)" value={sc.on} onValueChange={v => upS(x => { x.on = v })} isDisabled={ro} />
              {!sc.on && (
                <>
                  <div className="form-grid narrow">
                    <LabeledInput label="Prefix"><TextInput value={cfg.id.prefix} onValueChange={v => up(c => { c.id.prefix = v ?? '' })} isDisabled={ro} /></LabeledInput>
                    <LabeledInput label="Number of digits"><NumericInput value={cfg.id.digits} min={1} max={8} onValueChange={v => up(c => { c.id.digits = v ?? 3 })} isDisabled={ro} /></LabeledInput>
                  </div>
                  <Text color="secondary" fontSize="14">Next IDs look like <b>{cfg.id.prefix}{'1'.padStart(cfg.id.digits, '0')}</b>. Existing IDs are not renamed.</Text>
                </>
              )}
              {sc.on && (
                <>
                  <Text fontSize="14" fontWeight="600" cx="idsc-title">Areas</Text>
                  <Text color="secondary" fontSize="14">The first part of an ID, e.g. ST = Staff, PA = Participant, SH = Shared.</Text>
                  <div className="idsc-table">
                    <div className="idsc-head"><span>Code</span><span>Name</span><span /></div>
                    {sc.areas.map((a, i) => (
                      <div key={i} className="idsc-row">
                        <TextInput value={a.code} onValueChange={v => upS(x => { x.areas[i].code = (v ?? '').toUpperCase() })} isDisabled={ro} placeholder="ST" />
                        <TextInput value={a.name} onValueChange={v => upS(x => { x.areas[i].name = v ?? '' })} isDisabled={ro} placeholder="e.g. Staff" />
                        {!ro ? <Button size="30" fill="outline" color="secondary" caption="Remove" onClick={() => upS(x => { x.areas.splice(i, 1) })} /> : <span />}
                      </div>
                    ))}
                    {!sc.areas.length && <Text color="secondary" fontSize="14">No areas yet.</Text>}
                  </div>
                  {!ro && <div><Button size="30" fill="none" color="primary" caption="+ Add area" onClick={() => upS(x => { x.areas.push({ code: '', name: '' }) })} /></div>}

                  <Text fontSize="14" fontWeight="600" cx="idsc-title">Type codes</Text>
                  <div className="idsc-table types">
                    <div className="idsc-head"><span>Requirement type</span><span>Code</span><span>Uses area</span><span>Digits</span><span>Example</span></div>
                    {cfg.lists.type.map(t => {
                      const rule = sc.types[t] ?? defaultScheme([t]).types[t]
                      const set = (fn: (r: typeof rule) => void) => upS(x => { x.types[t] = { ...rule }; fn(x.types[t]) })
                      return (
                        <div key={t} className="idsc-row">
                          <Text fontSize="14">{t}</Text>
                          <TextInput value={rule.code} onValueChange={v => set(r => { r.code = (v ?? '').toUpperCase() })} isDisabled={ro} />
                          <Checkbox value={rule.area} onValueChange={v => set(r => { r.area = v })} isDisabled={ro} rawProps={{ 'aria-label': `${t} uses area` }} />
                          <NumericInput value={rule.digits} min={1} max={8} onValueChange={v => set(r => { r.digits = v ?? 3 })} isDisabled={ro} />
                          <Text fontSize="14" fontWeight="600">{example(sc, t)}</Text>
                        </div>
                      )
                    })}
                  </div>
                  <FlexRow columnGap="12">
                    <LabeledInput label="Separator"><TextInput value={sc.sep} onValueChange={v => upS(x => { x.sep = (v ?? '-').slice(0, 2) })} isDisabled={ro} cx="idsc-sep" /></LabeledInput>
                  </FlexRow>
                  <Text color="secondary" fontSize="14">A new requirement gets the next free number for its type and area. When you save a changed structure, you can rename existing IDs to match (with a preview first).</Text>
                </>
              )}
            </>
            )
          })()}

          {sec === 'lists' && (
            <div className="lists-grid">
              <div className="list-names">
                {(Object.keys(LIST_LABELS) as ListName[]).map(k => (
                  <VerticalTabButton key={k} caption={`${LIST_LABELS[k]} (${cfg.lists[k].length})`} isActive={listName === k} onClick={() => setListName(k)} />
                ))}
              </div>
              <ListEditor key={listName} name={listName} values={cfg.lists[listName]} ro={ro}
                onChange={vals => up(c => { c.lists[listName] = vals })} />
            </div>
          )}

          {sec === 'fields' && (
            <>
              <Text fontSize="16" fontWeight="600">Fields</Text>
              <Text color="secondary" fontSize="14">Rename, hide, make required, and choose table columns. ID, statement and status are always shown.</Text>
              <table className="gtable cfg-table">
                <thead><tr><th>Field</th><th>Label</th><th>Visible</th><th>Required</th><th>In table</th></tr></thead>
                <tbody>{FIELDS.map(f => {
                  const fc = cfg.fields[f.key as FieldKey], core = CORE_FIELDS.includes(f.key as FieldKey)
                  return (
                    <tr key={f.key}>
                      <td className="muted">{f.label}</td>
                      <td><TextInput size="30" value={fc.label} onValueChange={v => up(c => { c.fields[f.key as FieldKey].label = v ?? '' })} isDisabled={ro} /></td>
                      <td><Checkbox value={fc.visible} onValueChange={v => up(c => { c.fields[f.key as FieldKey].visible = !!v })} isDisabled={ro || core} /></td>
                      <td><Checkbox value={fc.required} onValueChange={v => up(c => { c.fields[f.key as FieldKey].required = !!v })} isDisabled={ro || (core && f.key !== 'status') || !fc.visible} /></td>
                      <td><Checkbox value={fc.inTable} onValueChange={v => up(c => { c.fields[f.key as FieldKey].inTable = !!v })} isDisabled={ro || f.key === 'id' || !fc.visible} /></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </>
          )}

          {sec === 'custom' && <CustomFields list={cfg.custom} ro={ro} onChange={list => up(c => { c.custom = list })} />}

          {sec === 'rules' && (
            <>
              <Text fontSize="16" fontWeight="600">Traceability rules</Text>
              <Text color="secondary" fontSize="14">Each rule adds a gap to the Traceability Check when broken. Turn off what this project doesn't need.</Text>
              {(Object.keys(RULES) as RuleKey[]).map(k => (
                <div key={k} className="rule-row">
                  <Switch value={cfg.rules[k]} onValueChange={v => up(c => { c.rules[k] = v })} isDisabled={ro} label={RULES[k].label} />
                  <Text fontSize="12" color="secondary" cx="rule-help">{RULES[k].help}</Text>
                </div>
              ))}
            </>
          )}

          {sec === 'workflow' && (
            <>
              <Text fontSize="16" fontWeight="600">Requirement status workflow</Text>
              <div className="rule-row"><Switch value={cfg.workflow.enforce} onValueChange={v => up(c => { c.workflow.enforce = v })} isDisabled={ro} label="Allow only the transitions below" /></div>
              <div className="form-grid narrow">
                <LabeledInput label="Status of new requirements"><Select value={cfg.workflow.initial} options={cfg.lists.status} onChange={v => up(c => { c.workflow.initial = v })} isDisabled={ro} noClear /></LabeledInput>
              </div>
              <Text color="secondary" fontSize="14">Rows = current status, columns = allowed next status. Statuses are edited in Lists → Requirement Status.</Text>
              <div className="matrix-wrap">
                <table className="gtable matrix">
                  <thead><tr><th>From \ To</th>{cfg.lists.status.map(s => <th key={s}>{s}</th>)}</tr></thead>
                  <tbody>{cfg.lists.status.map(from => (
                    <tr key={from}><td><b>{from}</b></td>{cfg.lists.status.map(to => (
                      <td key={to}>{from === to ? '—' : (
                        <Checkbox value={(cfg.workflow.transitions[from] ?? []).includes(to)} isDisabled={ro || !cfg.workflow.enforce}
                          onValueChange={v => up(c => { const t = new Set(c.workflow.transitions[from] ?? []); if (v) t.add(to); else t.delete(to); c.workflow.transitions[from] = [...t] })} />
                      )}</td>
                    ))}</tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}

function ListEditor(p: { name: ListName; values: string[]; ro: boolean; onChange: (v: string[]) => void }) {
  const [add, setAdd] = useState('')
  const locked = (LOCKED as Record<string, string[] | undefined>)[p.name] ?? []
  const move = (i: number, d: number) => { const v = [...p.values]; const [x] = v.splice(i, 1); v.splice(i + d, 0, x); p.onChange(v) }
  const doAdd = () => { const v = add.trim(); if (v && !p.values.includes(v)) p.onChange([...p.values, v]); setAdd('') }
  return (
    <div className="list-editor">
      <Text fontSize="16" fontWeight="600">{LIST_LABELS[p.name]}</Text>
      <Text color="secondary" fontSize="12">
        {p.name === 'release' ? 'If empty, Release is free text. If filled, it becomes a dropdown.' : 'Order here = order in dropdowns and charts. Renaming does not change values already saved on requirements.'}
      </Text>
      {p.values.map((v, i) => {
        const lock = locked.includes(v)
        return (
          <FlexRow key={i} columnGap="6" cx="list-row">
            <div className="grow"><TextInput size="30" value={v} isDisabled={p.ro || lock}
              onValueChange={x => { const n = [...p.values]; n[i] = x ?? ''; p.onChange(n) }} /></div>
            {lock && <Badge size="18" color="neutral" fill="outline" caption="used by rules" />}
            {!p.ro && <>
              <IconButton icon={() => <span className="arrow">↑</span>} isDisabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={() => <span className="arrow">↓</span>} isDisabled={i === p.values.length - 1} onClick={() => move(i, 1)} />
              <Button size="24" fill="none" color="critical" caption="Remove" isDisabled={lock} onClick={() => p.onChange(p.values.filter((_, j) => j !== i))} />
            </>}
          </FlexRow>
        )
      })}
      {!p.ro && (
        <FlexRow columnGap="6" cx="list-row">
          <div className="grow"><TextInput size="30" value={add} onValueChange={v => setAdd(v ?? '')} placeholder="New value" onAccept={doAdd} /></div>
          <Button size="30" color="primary" fill="outline" caption="Add" onClick={doAdd} />
        </FlexRow>
      )}
    </div>
  )
}

function CustomFields(p: { list: CustomField[]; ro: boolean; onChange: (l: CustomField[]) => void }) {
  const set = (i: number, patch: Partial<CustomField>) => p.onChange(p.list.map((c, j) => j === i ? { ...c, ...patch } : c))
  return (
    <>
      <Text fontSize="16" fontWeight="600">Custom fields</Text>
      <Text color="secondary" fontSize="14">Extra fields for this project (e.g. Regulation, Risk, Component). They appear in the form, table, Excel import/export and history.</Text>
      {p.list.map((c, i) => (
        <div key={c.key} className="custom-row">
          <div className="custom-grid">
            <LabeledInput label="Label"><TextInput value={c.label} onValueChange={v => set(i, { label: v ?? '' })} isDisabled={p.ro} /></LabeledInput>
            <LabeledInput label="Type"><Select value={c.type} options={CUSTOM_TYPES} onChange={v => set(i, { type: (v || 'text') as CustomType })} isDisabled={p.ro} noClear /></LabeledInput>
            {c.type === 'list' && (
              <div className="span2"><LabeledInput label="Options (comma-separated)">
                <TextInput value={c.options.join(', ')} onValueChange={v => set(i, { options: (v ?? '').split(',').map(x => x.trim()).filter(Boolean) })} isDisabled={p.ro} />
              </LabeledInput></div>
            )}
          </div>
          <FlexRow columnGap="18">
            <Checkbox label="Required" value={c.required} onValueChange={v => set(i, { required: !!v })} isDisabled={p.ro} />
            <Checkbox label="Show in table" value={c.inTable} onValueChange={v => set(i, { inTable: !!v })} isDisabled={p.ro} />
            <FlexSpacer />
            {!p.ro && <Button size="24" fill="none" color="critical" caption="Delete field" onClick={() => {
              if (confirm(`Delete field "${c.label}"? Values already saved stay in the database but are hidden.`)) p.onChange(p.list.filter((_, j) => j !== i))
            }} />}
          </FlexRow>
        </div>
      ))}
      {!p.ro && <div><Button color="primary" caption="+ Custom field" onClick={() => p.onChange([...p.list, { key: newCustomKey(), label: 'New field', type: 'text', options: [], required: false, inTable: false }])} /></div>}
    </>
  )
}
