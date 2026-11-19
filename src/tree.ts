// Requirement hierarchy built from the "Parent Requirement / Business Objective" field.
// Levels (BABOK): Business → Stakeholder → Solution (Functional / Non-functional) and Transition.
import type { Req } from './model'

export const LEVEL: Record<string, number> = { 'Business': 0, 'Stakeholder': 1, 'Functional': 2, 'Non-functional': 2, 'Transition': 2 }
export const levelOf = (type: string) => LEVEL[type] ?? 2

// IDs mentioned in the parent field that exist in this project (case-insensitive). Anything else is free text (an objective).
export function parentIds(r: Req, ids: Map<string, string>): string[] {
  const out: string[] = []
  for (const tok of (r.parent ?? '').split(/[\s,;|]+/)) {
    const id = ids.get(tok.trim().toUpperCase())
    if (id && id !== r.id && !out.includes(id)) out.push(id)
  }
  return out
}

export type Issue = { id: string; kind: 'orphan' | 'level' | 'cycle'; text: string }
export type TreeNode = { req: Req; children: TreeNode[]; extraParents: string[] }

export function buildTree(rows: Req[]) {
  const live = rows.filter(r => r.id)
  const ids = new Map(live.map(r => [r.id.trim().toUpperCase(), r.id]))
  const byId = new Map(live.map(r => [r.id, r]))
  const parents = new Map(live.map(r => [r.id, parentIds(r, ids)]))
  const kids = new Map<string, string[]>()
  for (const [id, ps] of parents) for (const p of ps) kids.set(p, [...(kids.get(p) ?? []), id])
  const issues: Issue[] = []

  for (const r of live) {
    const ps = parents.get(r.id)!
    if (!ps.length && levelOf(r.type) > 0) issues.push({ id: r.id, kind: 'orphan', text: `${r.type || 'Requirement'} with no parent requirement` })
    for (const p of ps) {
      const pr = byId.get(p)!
      if (levelOf(pr.type) > levelOf(r.type)) issues.push({ id: r.id, kind: 'level', text: `${r.type} under ${pr.type} ${p} (expected a higher level above)` })
    }
  }

  const order = (a: Req, b: Req) => levelOf(a.type) - levelOf(b.type) || a.id.localeCompare(b.id, undefined, { numeric: true })
  const build = (id: string, path: Set<string>, firstParent?: string): TreeNode => {
    const req = byId.get(id)!
    const ps = parents.get(id) ?? []
    const childIds = (kids.get(id) ?? []).filter(c => {
      if (path.has(c)) { if (!issues.some(i => i.id === c && i.kind === 'cycle')) issues.push({ id: c, kind: 'cycle', text: `Circular link back to ${c}` }); return false }
      return true
    })
    const next = new Set(path).add(id)
    return {
      req, extraParents: ps.filter(p => p !== firstParent),
      children: childIds.map(c => byId.get(c)!).sort(order).map(c => build(c.id, next, id)),
    }
  }

  const rootReqs = live.filter(r => !(parents.get(r.id)?.length))
  const roots = rootReqs.filter(r => levelOf(r.type) === 0).sort(order).map(r => build(r.id, new Set()))
  const orphans = rootReqs.filter(r => levelOf(r.type) > 0).sort(order).map(r => build(r.id, new Set()))
  // Requirements only reachable through a cycle never become roots: surface them as orphans.
  const seen = new Set<string>()
  const walk = (n: TreeNode) => { seen.add(n.req.id); n.children.forEach(walk) }
  ;[...roots, ...orphans].forEach(walk)
  for (const r of live) if (!seen.has(r.id)) { orphans.push(build(r.id, new Set())); walk(orphans[orphans.length - 1]) }

  return { roots, orphans, issues, childrenOf: (id: string) => (kids.get(id) ?? []).map(c => byId.get(c)!), parentsOf: (id: string) => (parents.get(id) ?? []).map(p => byId.get(p)!) }
}
