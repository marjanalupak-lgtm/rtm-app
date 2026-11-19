// Preview of an ID rename: old → new, before anything is written.
import { useState } from 'react'
import type { IModal } from '@epam/uui-core'
import { Select } from './ui'
import type { IdArea } from './idScheme'
import { Button, FlexSpacer, ModalBlocker, ModalFooter, ModalHeader, ModalWindow, Text } from '@epam/uui'
import { needsAreaCount, type Plan } from './idRename'

export type RenameChoice = { kind: 'rename'; plan: Plan } | { kind: 'skip' }

// `make(area)` builds the plan; `area` is used for IDs that have none but need one.
export function RenameModal(p: IModal<RenameChoice> & { make: (fallbackArea?: string) => Plan; areas: IdArea[]; title: string; skipLabel?: string }) {
  const [fallback, setFallback] = useState('')
  const plan = p.make(fallback || undefined)
  const missing = needsAreaCount(p.make(undefined))
  const n = plan.items.length
  return (
    <ModalBlocker {...p}>
      <ModalWindow width={560}>
        <ModalHeader title={p.title} onClose={() => p.abort()} />
        <div className="rn-body">
          <Text fontSize="14">{n ? `${n} ${n === 1 ? 'ID' : 'IDs'} will change.` : 'Nothing to rename yet.'} Links to them in <b>Parent</b> and <b>Depends on</b> are updated too, and their history moves to the new ID.</Text>
          {n > 0 && <div className="rn-list" role="list">
            {plan.items.map(i => (
              <div key={i.from} className="rn-row" role="listitem">
                <span className="rn-old">{i.from}</span><span aria-hidden>→</span><b>{i.to}</b>
                {i.renumbered && <span className="rn-note">new number (ID was taken)</span>}
              </div>
            ))}
          </div>}
          {missing > 0 && p.areas.length > 0 && (
            <div className="rn-area">
              <Text fontSize="14">{missing} {missing === 1 ? 'ID has' : 'IDs have'} no area, but {missing === 1 ? 'its' : 'their'} type needs one. Give them area:</Text>
              <Select value={fallback} options={p.areas.map(a => a.code)} labels={Object.fromEntries(p.areas.map(a => [a.code, a.name ? `${a.code} · ${a.name}` : a.code]))}
                onChange={setFallback} placeholder="Leave them as they are" />
            </div>
          )}
          {plan.skipped.length > 0 && (
            <details className="rn-skipped">
              <summary>{plan.skipped.length} not renamed (they don't fit the new structure, e.g. need an area)</summary>
              <div>{plan.skipped.map(s => `${s.id} (${s.why})`).join(', ')}</div>
            </details>
          )}
          <Text fontSize="12" color="secondary">Links typed in other places (Notes, Excel files, Jira) are not changed.</Text>
        </div>
        <ModalFooter>
            <Button fill="none" color="secondary" caption="Cancel" onClick={() => p.abort()} />
            <FlexSpacer />
            {p.skipLabel && <Button fill="outline" color="secondary" caption={p.skipLabel} onClick={() => p.success({ kind: 'skip' })} />}
            <Button color="primary" caption={`Rename ${n} ${n === 1 ? 'ID' : 'IDs'}`} isDisabled={!n} onClick={() => p.success({ kind: 'rename', plan })} />
        </ModalFooter>
      </ModalWindow>
    </ModalBlocker>
  )
}
