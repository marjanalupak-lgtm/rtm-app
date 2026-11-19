import { useMemo, useState } from 'react'
import { useArrayDataSource, type DataColumnProps, type DataTableState } from '@epam/uui-core'
import { DataTable, Panel, Text } from '@epam/uui'
import { FIELDS, type Req } from './model'
import { useConfig, getVal, type Config } from './config'
import { check } from './rules'
import { CheckBadge, StatusBadge, LinkText } from './ui'

type Row = Req & { check: string }
const BADGE = new Set(['status', 'priority', 'delivery', 'design_status', 'test_exec', 'test_case_status'])

// Reading order for the table: what it is → is it traced → where it stands → where it comes from → evidence.
const ORDER = ['id', 'statement', 'check', 'type', 'status', 'priority', 'release', 'owner', 'delivery',
  'parent', 'source', 'category', 'epic_id', 'epic_title', 'story_id', 'design_required', 'design_status', 'design_owner',
  'test_case', 'test_case_status', 'test_exec', 'defect', 'dependency', 'date_added', 'spec_link', 'acceptance', 'design_link', 'notes']

// Short column captions (the full field name shows as a tooltip).
const SHORT: Record<string, string> = {
  id: 'ID', statement: 'Requirement', check: 'Traceability', type: 'Type', status: 'Status', priority: 'Priority',
  release: 'Release', owner: 'Owner', delivery: 'Delivery', parent: 'Parent', source: 'Source', category: 'Category',
  epic_id: 'Epic ID', epic_title: 'Epic', story_id: 'Story', design_required: 'Design?', design_status: 'Design status',
  design_owner: 'Designer', test_case: 'Test case', test_case_status: 'Test status', test_exec: 'Test run', defect: 'Defect',
  dependency: 'Depends on', date_added: 'Added', spec_link: 'Spec', acceptance: 'Acceptance', design_link: 'Design link', notes: 'Notes',
}
const WIDTH: Record<string, number> = {
  id: 104, statement: 380, check: 196, type: 132, status: 148, priority: 112, release: 148, owner: 136, delivery: 148,
  parent: 156, source: 156, category: 150, epic_title: 156, story_id: 132, design_required: 108, design_status: 156,
  test_case: 136, test_case_status: 136, test_exec: 124, defect: 124, date_added: 116, notes: 220,
}

const Cell = ({ v, strong }: { v: string; strong?: boolean }) => <div className={'cell-clamp' + (strong ? ' strong' : '')} title={v.length > 40 ? v : undefined}>{v}</div>

function columns(cfg: Config): DataColumnProps<Row, string>[] {
  const defaults = Object.fromEntries(FIELDS.map(f => [f.key, f.label]))
  const shown = new Map<string, DataColumnProps<Row, string>>()
  const add = (key: string, full: string, kind: 'text' | 'badge' | 'link' | 'check', renamed: boolean) => {
    const label = renamed ? full : (SHORT[key] ?? full)
    shown.set(key, {
      key, caption: <span title={full}>{label}</span>, width: WIDTH[key] ?? 150, grow: key === 'statement' ? 1 : 0,
      minWidth: key === 'statement' ? 260 : 80, isSortable: kind !== 'link', fix: key === 'id' ? 'left' : undefined, alignSelf: 'center',
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
    if (!fc.visible || !fc.inTable) continue
    add(f.key, fc.label, BADGE.has(f.key) ? 'badge' : f.link ? 'link' : 'text', fc.label !== defaults[f.key])
    if (f.key === 'statement') add('check', 'Traceability check', 'check', false)
  }
  const ordered = [...ORDER.filter(k => shown.has(k)).map(k => shown.get(k)!), ...[...shown.entries()].filter(([k]) => !ORDER.includes(k)).map(([, c]) => c)]
  for (const c of cfg.custom) if (c.inTable) {
    ordered.push({
      key: c.key, caption: <span title={c.label}>{c.label}</span>, width: c.type === 'long' ? 220 : 150, isSortable: c.type !== 'link', alignSelf: 'center',
      render: r => c.type === 'link' ? <div className="cell-clamp"><LinkText value={getVal(r, c.key)} /></div> : <Cell v={getVal(r, c.key)} />,
    })
  }
  return ordered
}

export function RtmTable({ rows, onOpen }: { rows: Req[]; onOpen: (r: Req) => void }) {
  const cfg = useConfig()
  const items = useMemo<Row[]>(() => rows.map(r => ({ ...r, ...Object.fromEntries(cfg.custom.map(c => [c.key, getVal(r, c.key)])), check: check(r, cfg) })), [rows, cfg])
  const cols = useMemo(() => columns(cfg), [cfg])
  const [state, setState] = useState<DataTableState>({ sorting: [{ field: 'id', direction: 'asc' }] })
  const ds = useArrayDataSource<Row, string, unknown>({ items, getId: r => r.id }, [items])
  const view = ds.useView(state, setState, { getRowOptions: r => ({ onClick: () => onOpen(r) }) })
  if (!rows.length) {
    return <Panel background="surface-main" shadow cx="empty"><Text color="secondary">No requirements match. Add one or import your RTM.xlsm.</Text></Panel>
  }
  return (
    <Panel background="surface-main" shadow cx="table-panel">
      <DataTable<Row, string>
        {...view.getListProps()} getRows={view.getVisibleRows}
        value={state} onValueChange={setState} columns={cols}
        headerTextCase="upper" border allowColumnsResizing size="48" headerSize="48"
      />
    </Panel>
  )
}
