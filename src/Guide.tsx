import { Panel, Text } from '@epam/uui'
import { FIELDS, GATES, TRANSITIONS } from './model'

export function Guide() {
  return (
    <div className="dash">
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Requirement status transitions</Text>
        <table className="gtable">
          <thead><tr><th>Status</th><th>Allowed next</th><th>Required before transition</th></tr></thead>
          <tbody>{Object.entries(TRANSITIONS).map(([s, n]) => (
            <tr key={s}><td><b>{s}</b></td><td>{n.join(', ') || 'Final — create a new requirement'}</td><td>{GATES[s]}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Field dictionary</Text>
        <Text fontSize="14" color="secondary">* always required · † conditionally required · no mark = optional</Text>
        <table className="gtable">
          <thead><tr><th>Field</th><th>Group</th><th>Rule</th></tr></thead>
          <tbody>{FIELDS.map(f => (
            <tr key={f.key}><td>{f.label}{f.req}</td><td>{f.group}</td><td>{f.help ?? (f.req === '*' ? 'Always' : f.req === '†' ? 'Conditional' : 'Optional')}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Operating rules</Text>
        <ul className="rules">
          <li>Requirement Status (governance) is separate from Delivery, Design and Test statuses.</li>
          <li>A requirement can be Approved while delivery is Not Started.</li>
          <li>Approved requirements need a test case; failed execution needs a linked defect.</li>
          <li>Traceability Check is a control signal: resolve the gap or record a justification in Notes.</li>
          <li>Never reuse IDs. Retire with status Obsolete instead of deleting — every change is kept in History.</li>
        </ul>
      </Panel>
    </div>
  )
}
