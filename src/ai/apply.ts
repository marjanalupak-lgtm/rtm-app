// Turns the proposals the user ticked into rows to create and rows to update. Nothing is saved here.
import { emptyReq, type Req } from '../model'
import type { Config } from '../config'
import { nextSchemeId } from '../idScheme'
import { nextIdFor } from '../rules'
import type { Proposal } from './prompt'

export const UPDATABLE = ['statement', 'acceptance', 'priority', 'category', 'parent', 'notes'] as const
export type Defaults = { release: string; owner: string; source: string; date: string }
export type ApplyPlan = { creates: Req[]; updates: { prev: Req; next: Req }[]; idMap: Record<string, string>; warnings: string[] }

const sc = (cfg: Config) => (cfg.id.scheme?.on ? cfg.id.scheme : undefined)

// Why a card can't be applied as it is (shown on the card), or null.
export function cardProblem(p: Proposal, rows: Req[], cfg: Config): string | null {
  if (p.kind === 'duplicate') return null
  if (p.kind !== 'new') return rows.some(r => r.id === p.existingId) ? null : 'unknown requirement'
  if (!cfg.lists.type.includes(p.type)) return 'missing type'
  const s = sc(cfg)
  if (s?.types[p.type]?.area && !s.areas.some(a => a.code === p.area)) return 'unknown area'
  return null
}

export function planApply(selected: Proposal[], rows: Req[], cfg: Config, d: Defaults): ApplyPlan {
  const s = sc(cfg)
  const creates: Req[] = [], updates: ApplyPlan['updates'] = [], warnings: string[] = []
  const idMap: Record<string, string> = {}

  // 1. IDs for all new items first, so parents inside the batch can point at each other in any order.
  const news = selected.filter(p => p.kind === 'new')
  for (const p of news) {
    const all = [...rows, ...creates]
    const id = (s && nextSchemeId(all, s, p.type, s.types[p.type]?.area ? p.area : undefined)) || nextIdFor(all, cfg)
    if (p.tmpId) idMap[p.tmpId] = id
    creates.push({
      ...emptyReq(id), type: p.type, statement: p.statement, acceptance: p.acceptance, priority: p.priority, category: p.category,
      design_required: p.designRequired, parent: p.parent, release: d.release, owner: d.owner, source: p.source || d.source,
      date_added: d.date, status: cfg.workflow.initial, delivery: 'Not Started', notes: 'From AI intake: ' + p.reason,
    })
  }
  // 2. Resolve tmp- parents.
  for (const c of creates) {
    c.parent = c.parent.replace(/\btmp-\d+\b/g, t => {
      if (idMap[t]) return idMap[t]
      warnings.push(`${c.id}: parent ${t} not in this batch`)
      return t
    })
  }
  // 3. Updates (and ticked conflicts): only the allowed fields.
  for (const p of selected.filter(x => x.kind === 'update' || x.kind === 'conflict')) {
    const prev = rows.find(r => r.id === p.existingId)
    if (!prev) { warnings.push(`${p.existingId}: not found`); continue }
    const next: Req = { ...prev }
    for (const [k, v] of Object.entries(p.changes)) {
      if ((UPDATABLE as readonly string[]).includes(k)) (next as unknown as Record<string, string>)[k] = v.replace(/\btmp-\d+\b/g, t => idMap[t] ?? t)
      else warnings.push(`${prev.id}: "${k}" can't be changed by AI (change it in the form)`)
    }
    updates.push({ prev, next })
  }
  return { creates, updates, idMap, warnings }
}
