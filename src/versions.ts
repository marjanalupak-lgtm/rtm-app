// Requirement versions. A change to what a requirement *means* (text, acceptance criteria, type, parent)
// starts a new version; the old one is kept as a full snapshot, including everything linked to it then.
// Process changes (status, delivery, tests, design, defects) stay in the same version.
import type { Req } from './model'

export const VERSIONED = ['statement', 'acceptance', 'type', 'parent'] as const
export type Version = { req_id: string; version: number; saved_at: string; saved_by: string; snapshot: Req }

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function isNewVersion(prev: Req | undefined, next: Req): boolean {
  if (!prev) return false
  return VERSIONED.some(k => norm(prev[k]) !== norm(next[k]))
}

export const versionsFor = (id: string, all: Version[]) => all.filter(v => v.req_id === id).sort((a, b) => b.version - a.version)
export const versionOf = (id: string, all: Version[]) => all.filter(v => v.req_id === id).length + 1

// Version numbers come from the order of saved snapshots per requirement (1, 2, 3…), not from the stored
// column, so a duplicate or a deleted row can never make two versions share a number.
export function numberVersions(list: Version[]): Version[] {
  const seen = new Map<string, number>()
  return list.map(v => { const n = (seen.get(v.req_id) ?? 0) + 1; seen.set(v.req_id, n); return { ...v, version: n } })
}

// A Google Sheets cell holds at most 50,000 characters; long snapshots are spread over several cells.
export function splitCells(s: string, size = 45_000): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out.length ? out : ['']
}
export const deletedTag = (id: string, when: string) => `${id} (deleted ${when.slice(0, 10)})`
