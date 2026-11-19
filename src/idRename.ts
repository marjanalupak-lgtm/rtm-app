// Renaming requirement IDs: to follow a new ID structure, or when a requirement's type / area changes.
// Links to a renamed ID (Parent, Depends on) are updated too.
import type { Req } from './model'
import { parseId, type IdScheme } from './idScheme'

export type RenameMap = Record<string, string>
export const LINK_FIELDS = ['parent', 'dependency'] as const

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Replace whole IDs only: "BR-01" is not touched inside "BR-010" or "XBR-01".
export function replaceIds(text: string, map: RenameMap): string {
  const keys = Object.keys(map).filter(k => k && map[k] !== k).sort((a, b) => b.length - a.length)
  if (!text || !keys.length) return text
  const re = new RegExp(`(?<![A-Za-z0-9_-])(${keys.map(esc).join('|')})(?![A-Za-z0-9_-])`, 'g')
  return text.replace(re, m => map[m] ?? m)
}

// Rows that change (new ID and/or updated links), in the original order.
export function applyRename(rows: Req[], map: RenameMap): { before: Req; after: Req }[] {
  const out: { before: Req; after: Req }[] = []
  for (const r of rows) {
    const after: Req = { ...r, id: map[r.id] ?? r.id }
    for (const f of LINK_FIELDS) after[f] = replaceIds(r[f] ?? '', map)
    if (after.id !== r.id || LINK_FIELDS.some(f => after[f] !== r[f])) out.push({ before: r, after })
  }
  return out
}

export function buildId(s: IdScheme, type: string, area: string | undefined, num: number): string | null {
  const rule = s.types[type]
  if (!rule?.code || (rule.area && !area)) return null
  return (rule.area ? area + s.sep : '') + rule.code + s.sep + String(num).padStart(rule.digits, '0')
}

export type PlanItem = { from: string; to: string; renumbered: boolean }
export type Plan = { items: PlanItem[]; skipped: { id: string; why: string }[] }

// Which IDs must change so every requirement follows `next` (read with `prev`).
// Areas are matched by position, so renaming an area code in Settings carries over.
// If the new ID is taken, the requirement gets the next free number for its type + area.
export function planRename(rows: Req[], prev: IdScheme, next: IdScheme): Plan {
  const areaMap = new Map<string, string>()
  prev.areas.forEach((a, i) => { const n = next.areas[i]?.code; if (a.code && n) areaMap.set(a.code, n) })
  for (const a of next.areas) if (!areaMap.has(a.code) && !prev.areas.some(p => p.code === a.code)) areaMap.set(a.code, a.code)
  const items: PlanItem[] = [], skipped: Plan['skipped'] = []
  const proposed = new Map<string, { to: string; area?: string }>()
  for (const r of rows) {
    const p = parseId(r.id, prev.sep)
    if (!p || !r.type || !next.types[r.type]?.code) continue
    const area = p.area ? (areaMap.get(p.area) ?? p.area) : undefined
    const to = buildId(next, r.type, area, Number(p.num))
    if (!to) { skipped.push({ id: r.id, why: next.types[r.type]?.area && !area ? 'needs an area' : 'no type code' }); continue }
    if (to !== r.id) proposed.set(r.id, { to, area })
  }
  // Final set of IDs: unchanged ones stay, renamed ones move. Resolve clashes with the next free number.
  const taken = new Set(rows.filter(r => !proposed.has(r.id)).map(r => r.id))
  for (const r of rows) {
    const pr = proposed.get(r.id)
    if (!pr) continue
    let to = pr.to, renumbered = false
    if (taken.has(to)) {
      const prefix = to.slice(0, to.lastIndexOf(next.sep) + next.sep.length)
      let n = 1
      for (const id of taken) if (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))) n = Math.max(n, Number(id.slice(prefix.length)) + 1)
      to = buildId(next, r.type, pr.area, n) ?? to
      renumbered = true
    }
    taken.add(to)
    if (to !== r.id) items.push({ from: r.id, to, renumbered })
  }
  return { items, skipped }
}

export const toMap = (items: PlanItem[]): RenameMap => Object.fromEntries(items.map(i => [i.from, i.to]))
