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
