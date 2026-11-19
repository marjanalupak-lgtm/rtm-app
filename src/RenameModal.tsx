// Preview of an ID rename: old → new, before anything is written.
import type { IModal } from '@epam/uui-core'
import { Button, FlexSpacer, ModalBlocker, ModalFooter, ModalHeader, ModalWindow, Text } from '@epam/uui'
import type { Plan } from './idRename'

export type RenameChoice = 'rename' | 'skip'

export function RenameModal(p: IModal<RenameChoice> & { plan: Plan; title: string; skipLabel?: string }) {
  const n = p.plan.items.length
  return (
    <ModalBlocker {...p}>
      <ModalWindow width={560}>
        <ModalHeader title={p.title} onClose={() => p.abort()} />
        <div className="rn-body">
          <Text fontSize="14">{n} {n === 1 ? 'ID' : 'IDs'} will change. Links to them in <b>Parent</b> and <b>Depends on</b> are updated too, and their history moves to the new ID.</Text>
          <div className="rn-list" role="list">
            {p.plan.items.map(i => (
              <div key={i.from} className="rn-row" role="listitem">
                <span className="rn-old">{i.from}</span><span aria-hidden>→</span><b>{i.to}</b>
                {i.renumbered && <span className="rn-note">new number (ID was taken)</span>}
              </div>
            ))}
          </div>
          {p.plan.skipped.length > 0 && (
            <details className="rn-skipped">
              <summary>{p.plan.skipped.length} not renamed (they don't fit the new structure, e.g. need an area)</summary>
              <div>{p.plan.skipped.map(s => `${s.id} (${s.why})`).join(', ')}</div>
            </details>
          )}
          <Text fontSize="12" color="secondary">Links typed in other places (Notes, Excel files, Jira) are not changed.</Text>
        </div>
        <ModalFooter>
            <Button fill="none" color="secondary" caption="Cancel" onClick={() => p.abort()} />
            <FlexSpacer />
            {p.skipLabel && <Button fill="outline" color="secondary" caption={p.skipLabel} onClick={() => p.success('skip')} />}
            <Button color="primary" caption={`Rename ${n} ${n === 1 ? 'ID' : 'IDs'}`} onClick={() => p.success('rename')} />
        </ModalFooter>
      </ModalWindow>
    </ModalBlocker>
  )
}
