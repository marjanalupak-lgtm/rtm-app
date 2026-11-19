// What Claude is told (system prompt), the JSON shape it must answer in, and parsing of that answer.
import type { Req } from '../model'
import type { Config } from '../config'
import { areaOf } from '../idScheme'

export type ProposalKind = 'new' | 'update' | 'duplicate' | 'conflict'
export type Proposal = {
  kind: ProposalKind; tmpId: string; existingId: string; type: string; area: string; parent: string
  statement: string; acceptance: string; priority: string; category: string; designRequired: string
  changes: Record<string, string>; source: string; reason: string
}
export type AiResult = { summary: string; structure: string[]; proposals: Proposal[]; questions: string[]; nextSteps: string[] }

const str = { type: 'string' } as const
const strList = { type: 'array', items: str } as const
const PROPOSAL_FIELDS = ['kind', 'tmpId', 'existingId', 'type', 'area', 'parent', 'statement', 'acceptance', 'priority', 'category', 'designRequired', 'changes', 'source', 'reason'] as const

export const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'structure', 'proposals', 'questions', 'nextSteps'],
  properties: {
    summary: str,
    structure: strList,
    questions: strList,
    nextSteps: strList,
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [...PROPOSAL_FIELDS],
        properties: {
          kind: { type: 'string', enum: ['new', 'update', 'duplicate', 'conflict'] },
          tmpId: str, existingId: str, type: str, area: str, parent: str, statement: str, acceptance: str,
          priority: str, category: str, designRequired: str, source: str, reason: str,
          changes: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['field', 'value'], properties: { field: str, value: str } },
          },
        },
      },
    },
  },
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// Stable text (same rows → same string) so the prompt can be cached.
export function buildSystemPrompt(rows: Req[], cfg: Config): string {
  const sc = cfg.id.scheme?.on ? cfg.id.scheme : undefined
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const lines = sorted.map(r => [r.id, r.type, areaOf(r.id, sc), oneLine(r.parent), oneLine(r.statement).slice(0, 300)].join(' | '))
  const typeRules = cfg.lists.type.map(t => {
    const rule = sc?.types[t]
    return `- ${t}${rule ? ` (code ${rule.code}${rule.area ? ', needs an area' : ', no area'})` : ''}`
  })
  return [
    'You turn raw material (notes, emails, documents, transcripts, screenshots) into requirements for a Requirements Traceability Matrix (RTM).',
    'Levels (BABOK): Business → Stakeholder → Functional / Non-functional / Transition. Every requirement except Business has a parent one level up.',
    'Write each statement as one clear, testable requirement (user-story form is fine). Put testable acceptance criteria in "acceptance" (Given/When/Then is fine).',
    '',
    '## This project',
    'Requirement types:', ...typeRules,
    sc?.areas.length ? 'Areas (first part of an ID): ' + sc.areas.map(a => `${a.code} = ${a.name || a.code}`).join(', ') : 'Areas: none',
    'Priorities: ' + cfg.lists.priority.join(', '),
    'Categories: ' + cfg.lists.category.join(', '),
    '',
    '## Rules',
    '- Never invent IDs for new items; use tmp-1, tmp-2, … in "tmpId".',
    '- "parent" is an existing requirement ID or the tmpId of another new proposal in this answer.',
    '- If the material repeats something already covered, return kind "duplicate" with "existingId". Do not propose it again.',
    '- If it contradicts an existing requirement, return kind "conflict" with "existingId", explain in "reason", and put the suggested change in "changes".',
    '- If it adds detail to an existing requirement, return kind "update" with "existingId" and "changes". Updates may change only: statement, acceptance, priority, category, parent, notes.',
    '- "area" must be one of the area codes above, or empty when the type has no area. "type", "priority" and "category" must come from the lists above.',
    '- "source" quotes or points to where in the material this comes from (file name, page, speaker). "reason" says in one sentence why you propose it.',
    '- Unknown values are empty strings. Do not guess owners, releases or dates.',
    '- "summary": 3–5 sentences on what the material is about and what you propose. "structure": suggestions about the tree (new branches, new areas). "questions": what is unclear and must be asked. "nextSteps": what the team should do next.',
    '',
    `## Existing requirements (${rows.length}) — ID | type | area | parent | statement`,
    ...lines,
  ].join('\n')
}

type RawProposal = Omit<Proposal, 'changes'> & { changes: { field: string; value: string }[] }

export function parseResult(json: string): AiResult {
  let raw: Omit<AiResult, 'proposals'> & { proposals: RawProposal[] }
  try { raw = JSON.parse(json) } catch { throw new Error('bad-json') }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.proposals)) throw new Error('bad-json')
  return {
    summary: String(raw.summary ?? ''),
    structure: raw.structure ?? [], questions: raw.questions ?? [], nextSteps: raw.nextSteps ?? [],
    proposals: raw.proposals.map(p => ({ ...p, changes: Object.fromEntries((p.changes ?? []).map(c => [c.field, c.value])) })),
  }
}
