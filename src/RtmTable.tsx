import { useEffect, useMemo, useState } from 'react'
import { useArrayDataSource, type DataColumnProps, type DataTableState } from '@epam/uui-core'
import { DataTable, Panel, Text } from '@epam/uui'
import { FIELDS, type Req } from './model'
import { useConfig, getVal, type Config } from './config'
import { check } from './rules'
import { CheckBadge, StatusBadge, LinkText } from './ui'
import { HeaderFilter, isFilterable, type FilterCtx } from './Filters'

type Row = Req & { check: string }
const BADGE = new Set(['status', 'priority', 'delivery', 'design_status', 'test_exec', 'test_case_status'])

// Reading order for the table: what it is → is it traced → where it stands → where it comes from → evidence.
const ORDER = ['id', 'statement', 'check', 'type', 'status', 'priority', 'release', 'owner', 'delivery',
  'parent', 'source', 'category', 'epic_id', 'epic_title', 'story_id', 'design_required', 'design_status', 'design_owner',
  'test_case', 'test_case_status', 'test_exec', 'defect', 'dependency', 'date_added', 'spec_link', 'acceptance', 'design_link', 'notes']

// Short column captions (the full field name shows as a tooltip).
export const SHORT: Record<string, string> = {
  id: 'ID', statement: 'Requirement', check: 'Traceability', type: 'Type', status: 'Status', priority: 'Priority',
  release: 'Release', owner: 'Owner', delivery: 'Delivery', parent: 'Parent', source: 'Source', category: 'Category',
  epic_id: 'Epic ID', epic_title: 'Epic', story_id: 'Story', design_required: 'Design?', design_status: 'Design status',
  design_owner: 'Designer', test_case: 'Test case', test_case_status: 'Test status', test_exec: 'Test run', defect: 'Defect',
  dependency: 'Depends on', date_added: 'Added', spec_link: 'Spec', acceptance: 'Acceptance', design_link: 'Design link', notes: 'Notes',
}
const WIDTH: Record<string, number> = {
  id: 104, statement: 380, check: 204, type: 144, status: 160, priority: 132, release: 160, owner: 152, delivery: 160,
  parent: 168, source: 168, category: 160, epic_id: 136, epic_title: 168, story_id: 140, design_required: 128, design_status: 172,
  design_owner: 150, test_case: 148, test_case_status: 152, test_exec: 140, defect: 136, dependency: 150, date_added: 128, notes: 220,
}

function headerFilter(key: string, cfg: Config, fctx?: FilterCtx): Partial<DataColumnProps<Row, string>> {
  if (!fctx || !isFilterable(key, cfg)) return {}
  return {
    renderFilter: (_lens, dropdown) => <HeaderFilter field={key} ctx={fctx} close={() => dropdown.onClose?.()} />,
    isFilterActive: () => !!fctx.st.values[key]?.length,
  }
}

const Cell = ({ v, strong }: { v: string; strong?: boolean }) => <div className={'cell-clamp' + (strong ? ' strong' : '')} title={v.length > 40 ? v : undefined}>{v}</div>

export function columns(cfg: Config, fctx?: FilterCtx): DataColumnProps<Row, string>[] {
  const defaults = Object.fromEntries(FIELDS.map(f => [f.key, f.label]))
  const shown = new Map<string, DataColumnProps<Row, string>>()
  const add = (key: string, full: string, kind: 'text' | 'badge' | 'link' | 'check', renamed: boolean, hidden: boolean) => {
    const label = renamed ? full : (SHORT[key] ?? full)
    shown.set(key, {
      key, caption: <span title={full}>{label}</span>, width: WIDTH[key] ?? 150, grow: key === 'statement' ? 1 : 0,
      minWidth: key === 'statement' ? 260 : 80, isSortable: kind !== 'link', fix: key === 'id' ? 'left' : undefined, alignSelf: 'center',
      isAlwaysVisible: key === 'id' || key === 'statement', isHiddenByDefault: hidden,
      ...headerFilter(key, cfg, fctx),
      render: r => {
        if (kind === 'check') return <CheckBadge check={r.check} />
        const v = getVal(r, key)
        if (kind === 'badge') return <StatusBadge value={v} />
        if (kind === 'link') return <div className="cell-clamp"><LinkText value={v} /></div>
        return <Cell v={v} strong={key === 'id'} />
      },
    })
  }
  for (const f of FIELDS) {
    const fc = cfg.fields[f.key]
    if (!fc.visible) continue
    add(f.key, fc.label, BADGE.has(f.key) ? 'badge' : f.link ? 'link' : 'text', fc.label !== defaults[f.key], !fc.inTable)
    if (f.key === 'statement') add('check', 'Traceability check', 'check', false, false)
  }
  const ordered = [...ORDER.filter(k => shown.has(k)).map(k => shown.get(k)!), ...[...shown.entries()].filter(([k]) => !ORDER.includes(k)).map(([, c]) => c)]
  for (const c of cfg.custom) {
    ordered.push({
      key: c.key, caption: <span title={c.label}>{c.label}</span>, width: c.type === 'long' ? 220 : 150, isSortable: c.type !== 'link', alignSelf: 'center', isHiddenByDefault: !c.inTable,
      ...headerFilter(c.key, cfg, fctx),
      render: r => c.type === 'link' ? <div className="cell-clamp"><LinkText value={getVal(r, c.key)} /></div> : <Cell v={getVal(r, c.key)} />,
    })
  }
  return ordered
}

export type TableState = DataTableState
type SetTable = (u: DataTableState | ((p: DataTableState) => DataTableState)) => void

// Column choice, order, widths and sorting are remembered per project in this browser.
export function useTableState(projectId: string): [DataTableState, SetTable] {
  const key = 'rtm.table.' + projectId
  const load = (): DataTableState => { try { const s = JSON.parse(localStorage.getItem(key) ?? ''); return { sorting: s.sorting ?? [{ field: 'id', direction: 'asc' }], columnsConfig: s.columnsConfig } } catch { return { sorting: [{ field: 'id', direction: 'asc' }] } } }
  const [state, setRaw] = useState<DataTableState>(load)
  useEffect(() => { setRaw(load()) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const set: SetTable = u => setRaw(prev => {
    const next = typeof u === 'function' ? u(prev) : u
    try { localStorage.setItem(key, JSON.stringify({ sorting: next.sorting, columnsConfig: next.columnsConfig })) } catch { /* ignore */ }
    return next
  })
  return [state, set]
}

export function RtmTable({ rows, onOpen, state, setState, fctx, selectedId }: { rows: Req[]; onOpen: (r: Req) => void; state: DataTableState; setState: SetTable; fctx?: FilterCtx; selectedId?: string }) {
  const cfg = useConfig()
  const items = useMemo<Row[]>(() => rows.map(r => ({ ...r, ...Object.fromEntries(cfg.custom.map(c => [c.key, getVal(r, c.key)])), check: check(r, cfg) })), [rows, cfg])
  const cols = useMemo(() => columns(cfg, fctx), [cfg, fctx])
  const ds = useArrayDataSource<Row, string, unknown>({ items, getId: r => r.id }, [items])
  const view = ds.useView(state, setState as never, { getRowOptions: r => ({ onClick: () => onOpen(r), isSelectable: true }) })
  if (!rows.length) {
    return <Panel background="surface-main" shadow cx="empty"><Text color="secondary">No requirements match. Add one or import your RTM.xlsm.</Text></Panel>
  }
  return (
    <Panel background="surface-main" shadow cx="table-panel">
      <DataTable<Row, string>
        {...view.getListProps()} getRows={view.getVisibleRows}
        value={{ ...state, selectedId }} onValueChange={s => setState(({ ...s, selectedId: undefined }))} columns={cols}
        headerTextCase="upper" border allowColumnsResizing size="48" headerSize="48" showColumnsConfig
      />
    </Panel>
  )
}
