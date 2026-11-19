// Saved table views: named sets of columns (visibility, order, width, pinning) — table look only, no filters.
// Stored per project in this browser.
import { indexToOrder, type ColumnsConfig } from '@epam/uui-core'

export type TableView = { id: string; name: string; builtIn?: boolean; columns?: ColumnsConfig }
type Stored = { custom: TableView[]; overrides: Record<string, ColumnsConfig>; active: string; removed: string[] }

// Built-in starting points. Default = whatever Settings › Fields › "In table" says.
export const PRESETS: { id: string; name: string; keys: string[] | null }[] = [
  { id: 'default', name: 'Default', keys: null },
  { id: 'testing', name: 'Testing', keys: ['id', 'statement', 'check', 'status', 'release', 'test_case', 'test_case_status', 'test_exec', 'defect', 'priority'] },
  { id: 'design', name: 'Design', keys: ['id', 'statement', 'check', 'design_required', 'design_status', 'design_link', 'design_owner', 'story_id', 'epic_title', 'status'] },
  { id: 'delivery', name: 'Delivery', keys: ['id', 'statement', 'check', 'status', 'delivery', 'story_id', 'epic_title', 'release', 'owner', 'priority'] },
]

// A columns config that shows `keys` in that order (ID pinned left) and hides the rest.
// Built on `base` (UUI's default config: widths, pinning) with UUI's own order keys, so the
// columns dialog can read it.
export function configFromKeys(allKeys: string[], keys: string[], base: ColumnsConfig = {}): ColumnsConfig {
  const shown = keys.filter(k => allKeys.includes(k))
  const hidden = allKeys.filter(k => !shown.includes(k))
  const cfg: ColumnsConfig = {}
  ;[...shown, ...hidden].forEach((k, i) => {
    cfg[k] = { ...(base[k] ?? {}), isVisible: shown.includes(k), order: indexToOrder(i), fix: k === 'id' ? 'left' : base[k]?.fix }
  })
  return cfg
}

// Same look? Visible columns in the same order, same pinning and (where both set) same widths.
export function sameColumns(a: ColumnsConfig, b: ColumnsConfig): boolean {
  const vis = (c: ColumnsConfig) => Object.entries(c).filter(([, v]) => v.isVisible).sort((x, y) => String(x[1].order).localeCompare(String(y[1].order)))
  const va = vis(a), vb = vis(b)
  if (va.length !== vb.length) return false
  return va.every(([k, v], i) => {
    const [k2, v2] = vb[i]
    if (k !== k2 || (v.fix ?? null) !== (v2.fix ?? null)) return false
    return v.width === undefined || v2.width === undefined || v.width === v2.width
  })
}

const key = (pid: string) => 'rtm.views.' + pid
export function loadViews(pid: string): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(key(pid)) ?? '')
    return { custom: s.custom ?? [], overrides: s.overrides ?? {}, active: s.active ?? 'default', removed: s.removed ?? [] }
  } catch { return { custom: [], overrides: {}, active: 'default', removed: [] } }
}
export function saveViews(pid: string, s: Stored) {
  try { localStorage.setItem(key(pid), JSON.stringify(s)) } catch { /* ignore */ }
}

// All views for the menu: built-ins (possibly updated by the user) + custom ones.
export function allViews(s: Stored, allKeys: string[], base: ColumnsConfig = {}): TableView[] {
  const built = PRESETS.filter(p => p.id === 'default' || !s.removed?.includes(p.id)).map(p => ({
    id: p.id, name: p.name, builtIn: true,
    columns: s.overrides[p.id] ?? (p.keys ? configFromKeys(allKeys, p.keys, base) : undefined),
  }))
  return [...built, ...s.custom]
}

export const newViewId = () => 'v_' + Math.random().toString(36).slice(2, 9)
