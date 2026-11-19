import { Panel, Text } from '@epam/uui'
import { FIELDS, GATES } from './model'
import { useConfig, RULES, type RuleKey } from './config'

export function Guide() {
  const cfg = useConfig()
  return (
    <div className="dash">
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Requirement status transitions {cfg.workflow.enforce ? '' : '(not enforced in this project)'}</Text>
        <table className="gtable">
          <thead><tr><th>Status</th><th>Allowed next</th><th>Required before transition</th></tr></thead>
          <tbody>{cfg.lists.status.map(s => { const n = cfg.workflow.transitions[s] ?? []; return (
            <tr key={s}><td><b>{s}</b>{s === cfg.workflow.initial ? ' (initial)' : ''}</td><td>{n.join(', ') || 'Final — create a new requirement'}</td><td>{GATES[s] ?? '—'}</td></tr>
          ) })}</tbody>
        </table>
      </Panel>
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Traceability rules in this project</Text>
        <table className="gtable">
          <tbody>{(Object.keys(RULES) as RuleKey[]).map(k => (
            <tr key={k}><td><b>{RULES[k].label}</b></td><td>{cfg.rules[k] ? 'On' : 'Off'}</td><td>{RULES[k].help}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Field dictionary</Text>
        <Text fontSize="14" color="secondary">* always required · † conditionally required · no mark = optional</Text>
        <table className="gtable">
          <thead><tr><th>Field</th><th>Group</th><th>Rule</th></tr></thead>
          <tbody>{FIELDS.filter(f => cfg.fields[f.key].visible).map(f => (
            <tr key={f.key}><td>{cfg.fields[f.key].label}{cfg.fields[f.key].required ? '*' : f.req === '†' ? '†' : ''}</td><td>{f.group}</td><td>{f.help ?? (cfg.fields[f.key].required ? 'Always' : f.req === '†' ? 'Conditional' : 'Optional')}</td></tr>
          ))}{cfg.custom.map(c => (
            <tr key={c.key}><td>{c.label}{c.required ? '*' : ''}</td><td>Custom ({c.type})</td><td>{c.required ? 'Always' : 'Optional'}</td></tr>
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
