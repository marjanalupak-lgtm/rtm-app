import { useMemo, useState } from 'react'
import { useArrayDataSource, type DataColumnProps, type DataTableState } from '@epam/uui-core'
import { DataTable, Panel, Text } from '@epam/uui'
import { FIELDS, type Req } from './model'
import { useConfig, getVal, type Config } from './config'
import { check } from './rules'
import { CheckBadge, StatusBadge, LinkText } from './ui'

type Row = Req & { check: string }
const BADGE = new Set(['status', 'priority', 'delivery', 'design_status', 'test_exec', 'test_case_status'])
const WIDTH: Record<string, number> = { id: 100, statement: 320, release: 150, design_required: 100, test_exec: 110, defect: 110, priority: 100 }

function columns(cfg: Config): DataColumnProps<Row, string>[] {
  const cols: DataColumnProps<Row, string>[] = []
  const add = (key: string, label: string, kind: 'text' | 'badge' | 'link', grow = 0) => cols.push({
    key, caption: label, width: WIDTH[key] ?? 140, grow, isSortable: kind !== 'link', fix: key === 'id' ? 'left' : undefined,
    render: r => {
      const v = getVal(r, key)
      if (key === 'id') return <Text fontSize="14" fontWeight="600">{v}</Text>
      if (kind === 'badge') return <StatusBadge value={v} />
      if (kind === 'link') return <Text fontSize="14"><LinkText value={v} /></Text>
      return <Text fontSize="14" cx="cell-text">{v}</Text>
    },
  })
  for (const f of FIELDS) {
    const fc = cfg.fields[f.key]
    if (!fc.visible || !fc.inTable) continue
    add(f.key, fc.label, BADGE.has(f.key) ? 'badge' : f.link ? 'link' : 'text', f.key === 'statement' ? 1 : 0)
    if (f.key === 'statement') cols.push({ key: 'check', caption: 'Traceability', width: 190, isSortable: true, render: r => <CheckBadge check={r.check} /> })
  }
  for (const c of cfg.custom) if (c.inTable) add(c.key, c.label, c.type === 'link' ? 'link' : 'text')
  return cols
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
        headerTextCase="upper" border allowColumnsResizing
      />
    </Panel>
  )
}
