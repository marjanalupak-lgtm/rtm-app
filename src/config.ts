// Per-project configuration: lists, fields, custom fields, traceability rules, IDs and status workflow.
// Stored as JSON on the project; always merged over defaults so new options appear automatically.
import { createContext, useContext } from 'react'
import { FIELDS, LISTS, TRANSITIONS, type ListKey, type Req } from './model'

export type FieldKey = (typeof FIELDS)[number]['key']
export type FieldCfg = { label: string; visible: boolean; required: boolean; inTable: boolean }
export type CustomType = 'text' | 'long' | 'list' | 'link' | 'date'
export type CustomField = { key: string; label: string; type: CustomType; options: string[]; required: boolean; inTable: boolean }

export const RULES = {
  requiredFields: { label: 'Required fields filled', help: 'Every field marked required must have a value (MISSING …).' },
  design: { label: 'Design evidence', help: 'If Design Required = Yes: design link, status, owner, and status must be Approved.' },
  storyLink: { label: 'Story link once delivery starts', help: 'Delivery other than Not Started/Deferred needs a User Story link.' },
  defectForFailed: { label: 'Defect for failed test', help: 'Test Execution = Failed needs a Defect link.' },
  failedTest: { label: 'Flag failed tests', help: 'Test Execution = Failed is shown as a gap (FAILED TEST).' },
  doneNeedsPass: { label: 'Done needs passed test', help: 'Delivery = Done requires Test Execution Passed or N/A.' },
  approvedNeedsTest: { label: 'Approved needs approved test', help: 'Requirement Approved requires a test case with status Approved or N/A.' },
} as const
export type RuleKey = keyof typeof RULES

export type Config = {
  id: { prefix: string; digits: number }
  lists: Record<ListKey | 'release', string[]>
  fields: Record<FieldKey, FieldCfg>
  custom: CustomField[]
  rules: Record<RuleKey, boolean>
  workflow: { enforce: boolean; initial: string; transitions: Record<string, string[]> }
}

// Values the rules depend on — can't be removed or renamed in the list editor.
export const LOCKED: Partial<Record<ListKey, string[]>> = {
  status: ['Approved'],
  delivery: ['Not Started', 'Done', 'Deferred'],
  testCase: ['Approved', 'N/A'],
  testExec: ['Passed', 'Failed', 'N/A'],
  designRequired: ['Yes'],
  designStatus: ['Approved'],
}

export const LIST_LABELS: Record<ListKey | 'release', string> = {
  release: 'Releases / versions', type: 'Requirement Type', category: 'Requirement Category', priority: 'Priority',
  status: 'Requirement Status', delivery: 'Delivery Status', testCase: 'Test Case Status', testExec: 'Test Execution Status',
  designRequired: 'Design Required?', designStatus: 'Design Status',
}

export function defaultConfig(): Config {
  return {
    id: { prefix: 'REQ-', digits: 3 },
    lists: { ...Object.fromEntries(Object.entries(LISTS).map(([k, v]) => [k, [...v]])), release: [] } as unknown as Config['lists'],
    fields: Object.fromEntries(FIELDS.map(f => [f.key, { label: f.label, visible: true, required: f.req === '*', inTable: DEFAULT_TABLE.includes(f.key) }])) as Config['fields'],
    custom: [],
    rules: Object.fromEntries(Object.keys(RULES).map(k => [k, true])) as Config['rules'],
    workflow: { enforce: true, initial: 'Draft', transitions: Object.fromEntries(Object.entries(TRANSITIONS).map(([k, v]) => [k, [...v]])) },
  }
}

export const DEFAULT_TABLE: string[] = ['id', 'statement', 'status', 'priority', 'release', 'type', 'owner', 'delivery', 'story_id', 'epic_title', 'design_required', 'design_status', 'test_case', 'test_exec', 'defect', 'parent', 'source']

// Fields that can't be hidden / un-required (the RTM breaks without them).
export const CORE_FIELDS: FieldKey[] = ['id', 'statement', 'status']

export function normalize(raw: unknown): Config {
  const d = defaultConfig()
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<Config>
  const lists = { ...d.lists }
  for (const k of Object.keys(lists) as (keyof Config['lists'])[]) {
    const v = c.lists?.[k]
    if (Array.isArray(v)) lists[k] = [...new Set([...(LOCKED[k as ListKey] ?? []).filter(x => !v.includes(x)), ...v.map(String)])]
  }
  const fields = { ...d.fields }
  for (const k of Object.keys(fields) as FieldKey[]) fields[k] = { ...fields[k], ...(c.fields?.[k] ?? {}) }
  for (const k of CORE_FIELDS) fields[k] = { ...fields[k], visible: true, required: k !== 'status' ? true : fields[k].required }
  const statuses = lists.status
  const transitions: Record<string, string[]> = {}
  for (const s of statuses) transitions[s] = (c.workflow?.transitions?.[s] ?? d.workflow.transitions[s] ?? []).filter(x => statuses.includes(x) && x !== s)
  return {
    id: { prefix: String(c.id?.prefix ?? d.id.prefix), digits: Math.min(8, Math.max(1, Number(c.id?.digits) || d.id.digits)) },
    lists, fields,
    custom: Array.isArray(c.custom) ? c.custom.map(x => ({ ...x, options: x.options ?? [] })) : [],
    rules: { ...d.rules, ...(c.rules ?? {}) },
    workflow: {
      enforce: c.workflow?.enforce ?? d.workflow.enforce,
      initial: statuses.includes(c.workflow?.initial ?? '') ? c.workflow!.initial : (statuses.includes('Draft') ? 'Draft' : statuses[0]),
      transitions,
    },
  }
}

export const ConfigContext = createContext<Config>(defaultConfig())
export const useConfig = () => useContext(ConfigContext)

export const fieldLabel = (cfg: Config, key: string) =>
  (cfg.fields as Record<string, FieldCfg>)[key]?.label ?? cfg.custom.find(c => c.key === key)?.label ?? key

export const getVal = (r: Req, key: string): string =>
  key.startsWith('c_') ? String(r.extra?.[key] ?? '') : String((r as Record<string, unknown>)[key] ?? '')

export const newCustomKey = () => 'c_' + Math.random().toString(36).slice(2, 8)
