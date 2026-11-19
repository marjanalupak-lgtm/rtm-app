// "View: …" menu next to Columns: switch between saved table views, save / update / rename / delete.
import { useEffect, useState } from 'react'
import { useUuiContext, type ColumnsConfig, type IModal } from '@epam/uui-core'
import { Button, Dropdown, DropdownMenuBody, DropdownMenuButton, DropdownMenuHeader, DropdownMenuSplitter, FlexRow, FlexSpacer, LabeledInput, ModalBlocker, ModalFooter, ModalHeader, ModalWindow, TextInput } from '@epam/uui'
import { allViews, loadViews, newViewId, sameColumns, saveViews, PRESETS, type TableView } from './tableViews'

const Tick = () => <svg className="vm-tick" width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor" /></svg>
const NoTick = () => <span className="vm-tick" aria-hidden />
const Trash = () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zm2-10h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>

function NameModal(p: IModal<string> & { title: string; initial: string; taken: string[] }) {
  const [name, setName] = useState(p.initial)
  const clean = name.trim()
  const dup = p.taken.some(t => t.toLowerCase() === clean.toLowerCase()) && clean.toLowerCase() !== p.initial.toLowerCase()
  const ok = !!clean && !dup
  return (
    <ModalBlocker {...p}>
      <ModalWindow width={420}>
        <ModalHeader title={p.title} onClose={() => p.abort()} />
        <FlexRow padding="24" vPadding="24">
          <div style={{ flex: 1 }}>
            <LabeledInput label="View name" validationMessage={dup ? 'A view with this name already exists.' : undefined} isInvalid={dup}>
              <TextInput value={name} onValueChange={v => setName(v ?? '')} placeholder="e.g. Testing – sprint review" onAccept={() => ok && p.success(clean)} autoFocus />
            </LabeledInput>
          </div>
        </FlexRow>
        <ModalFooter>
          <FlexSpacer />
          <Button fill="outline" color="secondary" caption="Cancel" onClick={() => p.abort()} />
          <Button color="primary" caption="Save" isDisabled={!ok} onClick={() => p.success(clean)} />
        </ModalFooter>
      </ModalWindow>
    </ModalBlocker>
  )
}

export function ViewMenu({ pid, allKeys, current, defaults, apply, notify }: {
  pid: string; allKeys: string[]; current: ColumnsConfig; defaults: ColumnsConfig
  apply: (cfg: ColumnsConfig | undefined) => void; notify: (m: string, ok?: boolean) => void
}) {
  const { uuiModals } = useUuiContext()
  const [st, setSt] = useState(() => loadViews(pid))
  useEffect(() => { setSt(loadViews(pid)) }, [pid])
  const views = allViews(st, allKeys, defaults)
  const active = views.find(v => v.id === st.active) ?? views[0]
  const modified = !sameColumns(current, active.columns ?? defaults)
  const persist = (s: typeof st) => { setSt(s); saveViews(pid, s) }
  const names = views.map(v => v.name)
  const ask = (title: string, initial: string) => uuiModals.show<string>(props => <NameModal {...props} title={title} initial={initial} taken={names} />)

  const switchTo = (v: TableView) => { persist({ ...st, active: v.id }); apply(v.columns) }
  const saveAsNew = () => ask('Save current columns as a view', '').then(name => {
    const id = newViewId()
    persist({ ...st, custom: [...st.custom, { id, name, columns: current }], active: id })
    notify(`View “${name}” saved`)
  }).catch(() => {})
  const update = () => {
    if (active.builtIn) persist({ ...st, overrides: { ...st.overrides, [active.id]: current } })
    else persist({ ...st, custom: st.custom.map(v => v.id === active.id ? { ...v, columns: current } : v) })
    notify(`View “${active.name}” updated`)
  }
  const rename = () => ask('Rename view', active.name).then(name => {
    persist({ ...st, custom: st.custom.map(v => v.id === active.id ? { ...v, name } : v) })
  }).catch(() => {})
  // Delete any view except Default. Built-in ones can be brought back with "Restore built-in views".
  const remove = (v: TableView) => {
    if (!confirm(`Delete view “${v.name}”? Your data is not affected.`)) return
    const overrides = { ...st.overrides }; delete overrides[v.id]
    const s = v.builtIn
      ? { ...st, overrides, removed: [...st.removed, v.id] }
      : { ...st, custom: st.custom.filter(x => x.id !== v.id) }
    persist(v.id === active.id ? { ...s, active: 'default' } : s)
    if (v.id === active.id) apply(undefined)
  }
  const restore = () => persist({ ...st, removed: [] })
  const resetBuiltIn = () => {
    const overrides = { ...st.overrides }; delete overrides[active.id]
    const s = { ...st, overrides }; persist(s)
    apply(allViews(s, allKeys, defaults).find(v => v.id === active.id)?.columns)
  }
  const revert = () => apply(active.columns)

  return (
    <Dropdown
      renderTarget={props => (
        <Button {...props} fill="outline" color="secondary" caption={`View: ${active.name}${modified ? ' (edited)' : ''}`}
          rawProps={{ title: modified ? 'Columns changed since this view was saved — open to update or save as a new view' : 'Saved table views' }} />
      )}
      renderBody={props => (
        <DropdownMenuBody {...props} minWidth={260}>
          <DropdownMenuHeader caption="Table views" />
          <div className="vm-list">
            {views.map(v => (
              <div key={v.id} className="vm-row">
                <DropdownMenuButton cx="vm-item" icon={v.id === active.id ? Tick : NoTick} iconPosition="left"
                  caption={v.name + (v.builtIn && st.overrides[v.id] ? ' (edited)' : '')}
                  rawProps={{ 'aria-current': v.id === active.id ? 'true' : undefined }}
                  onClick={() => { switchTo(v); props.onClose?.() }} />
                {v.id !== 'default' && (
                  <Button cx="vm-del" size="24" fill="outline" color="secondary" icon={Trash} onClick={() => remove(v)}
                    rawProps={{ 'aria-label': `Delete view ${v.name}`, title: `Delete view “${v.name}”` }} />
                )}
              </div>
            ))}
          </div>
          <DropdownMenuSplitter />
          {modified && <DropdownMenuButton caption={`Update “${active.name}” with current columns`} onClick={() => { update(); props.onClose?.() }} />}
          {modified && <DropdownMenuButton caption="Discard column changes" onClick={() => { revert(); props.onClose?.() }} />}
          <DropdownMenuButton caption="Save current columns as new view…" onClick={() => { props.onClose?.(); saveAsNew() }} />
          {!active.builtIn && <DropdownMenuButton caption={`Rename “${active.name}”…`} onClick={() => { props.onClose?.(); rename() }} />}
          {active.builtIn && st.overrides[active.id] && PRESETS.some(p => p.id === active.id) && (
            <DropdownMenuButton caption={`Reset “${active.name}” to original`} onClick={() => { resetBuiltIn(); props.onClose?.() }} />
          )}
          {st.removed.length > 0 && <DropdownMenuButton caption="Restore built-in views" onClick={() => { restore(); props.onClose?.() }} />}
        </DropdownMenuBody>
      )}
    />
  )
}
