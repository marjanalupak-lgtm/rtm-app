// Structured requirement IDs: [Area-]Type code-Number, e.g. BR-01, SR-12, ST-FR-001, PA-NFR-004.
// Area (e.g. ST Staff, PA Participant, SH Shared) is used only by the types that need it.
import type { Req } from './model'

export type IdArea = { code: string; name: string }
export type IdTypeRule = { code: string; area: boolean; digits: number }
export type IdScheme = { on: boolean; sep: string; areas: IdArea[]; types: Record<string, IdTypeRule> }

const DEFAULT_CODES: Record<string, IdTypeRule> = {
  'Business': { code: 'BR', area: false, digits: 2 },
  'Stakeholder': { code: 'SR', area: false, digits: 2 },
  'Functional': { code: 'FR', area: true, digits: 3 },
  'Non-functional': { code: 'NFR', area: true, digits: 3 },
  'Transition': { code: 'TR', area: true, digits: 2 },
}
const initials = (t: string) => t.split(/[\s-]+/).map(w => w[0] ?? '').join('').toUpperCase() + 'R'

export function defaultScheme(types: string[]): IdScheme {
  return { on: false, sep: '-', areas: [], types: Object.fromEntries(types.map(t => [t, { ...(DEFAULT_CODES[t] ?? { code: initials(t), area: false, digits: 3 }) }])) }
}

type Parsed = { area?: string; code: string; num: string }
export function parseId(id: string, sep = '-'): Parsed | null {
  const parts = id.trim().split(sep)
  if (!/^\d+$/.test(parts[parts.length - 1] ?? '')) return null
  if (parts.length === 3) return { area: parts[0].toUpperCase(), code: parts[1].toUpperCase(), num: parts[2] }
  if (parts.length === 2) return { code: parts[0].toUpperCase(), num: parts[1] }
  return null
}

const top = <T,>(m: Map<T, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
const bump = <T,>(m: Map<T, number>, k: T) => m.set(k, (m.get(k) ?? 0) + 1)

// Read the structure from existing requirement IDs + their Requirement Type.
export function detectScheme(rows: Req[], types: string[], prev?: IdScheme): IdScheme {
  const base = defaultScheme(types)
  const sep = prev?.sep || '-'
  const stats = new Map<string, { code: Map<string, number>; area: Map<boolean, number>; digits: Map<number, number> }>()
  const areas: string[] = []
  for (const r of rows) {
    const p = parseId(r.id, sep)
    if (!p || !r.type) continue
    const s = stats.get(r.type) ?? { code: new Map(), area: new Map(), digits: new Map() }
    bump(s.code, p.code); bump(s.area, !!p.area); bump(s.digits, p.num.length)
    stats.set(r.type, s)
    if (p.area && !areas.includes(p.area)) areas.push(p.area)
  }
  const out: IdScheme = { on: stats.size > 0 || !!prev?.on, sep, areas: areas.map(code => ({ code, name: prev?.areas.find(a => a.code === code)?.name ?? '' })), types: { ...base.types } }
  for (const [t, s] of stats) out.types[t] = { code: top(s.code)!, area: !!top(s.area), digits: top(s.digits)! }
  for (const a of prev?.areas ?? []) if (!out.areas.some(x => x.code === a.code)) out.areas.push(a)
  return out
}

export const prefixFor = (s: IdScheme, type: string, area?: string): string | null => {
  const rule = s.types[type]
  if (!rule?.code) return null
  if (rule.area && !area) return null
  return (rule.area ? area + s.sep : '') + rule.code + s.sep
}

// Next free ID for this type (and area), e.g. ST-FR-090.
export function nextSchemeId(rows: Req[], s: IdScheme, type: string, area?: string): string | null {
  const prefix = prefixFor(s, type, area)
  if (!prefix) return null
  const max = rows.reduce((m, r) => {
    const id = r.id.trim()
    if (id.toUpperCase().startsWith(prefix.toUpperCase()) && /^\d+$/.test(id.slice(prefix.length))) return Math.max(m, Number(id.slice(prefix.length)))
    return m
  }, 0)
  return prefix + String(max + 1).padStart(s.types[type].digits, '0')
}

export function example(s: IdScheme, type: string): string {
  const rule = s.types[type]
  if (!rule?.code) return '—'
  const a = rule.area ? (s.areas[0]?.code || 'AREA') + s.sep : ''
  return a + rule.code + s.sep + '1'.padStart(rule.digits, '0')
}

export function sanitizeScheme(raw: unknown, types: string[]): IdScheme | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Partial<IdScheme>
  const base = defaultScheme(types)
  const tr: Record<string, IdTypeRule> = {}
  for (const t of types) {
    const x = r.types?.[t]
    tr[t] = x ? { code: String(x.code ?? '').trim().toUpperCase(), area: !!x.area, digits: Math.min(8, Math.max(1, Number(x.digits) || 3)) } : base.types[t]
  }
  return {
    on: !!r.on, sep: String(r.sep || '-').slice(0, 2),
    areas: Array.isArray(r.areas) ? r.areas.map(a => ({ code: String(a.code ?? '').trim().toUpperCase(), name: String(a.name ?? '') })).filter(a => a.code) : [],
    types: tr,
  }
}
