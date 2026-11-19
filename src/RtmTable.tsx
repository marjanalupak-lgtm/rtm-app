import { useMemo, useState } from 'react'
import { useArrayDataSource, type DataColumnProps, type DataTableState } from '@epam/uui-core'
import { DataTable, Panel, Text } from '@epam/uui'
import { traceCheck, type Req } from './model'
import { CheckBadge, StatusBadge, LinkText } from './ui'

type Row = Req & { check: string }

const txt = (k: keyof Req, w = 140): DataColumnProps<Row, string> => ({
  key: k, caption: k, width: w, isSortable: true,
  render: r => <Text fontSize="14" cx="cell-text">{String(r[k] ?? '')}</Text>,
})
const lnk = (k: keyof Req, caption: string, w = 140): DataColumnProps<Row, string> => ({
  key: k, caption, width: w, render: r => <Text fontSize="14"><LinkText value={String(r[k] ?? '')} /></Text>,
})
const badge = (k: keyof Req, caption: string, w = 140): DataColumnProps<Row, string> => ({
  key: k, caption, width: w, isSortable: true, render: r => <StatusBadge value={String(r[k] ?? '')} />,
})

const COLUMNS: DataColumnProps<Row, string>[] = [
  { ...txt('id', 100), caption: 'ID', fix: 'left', render: r => <Text fontSize="14" fontWeight="600">{r.id}</Text> },
  { ...txt('statement', 320), caption: 'User Story / Requirement', grow: 1 },
  { key: 'check', caption: 'Traceability', width: 190, isSortable: true, render: r => <CheckBadge check={r.check} /> },
  badge('status', 'Status', 140),
  badge('priority', 'Priority', 100),
  { ...txt('release', 150), caption: 'Release' },
  { ...txt('type', 120), caption: 'Type' },
  { ...txt('owner', 120), caption: 'Owner' },
  badge('delivery', 'Delivery', 140),
  lnk('story_id', 'Story'),
  { ...txt('epic_title', 130), caption: 'Epic' },
  { ...txt('design_required', 90), caption: 'Design?' },
  badge('design_status', 'Design status', 140),
  lnk('test_case', 'Test case'),
  badge('test_exec', 'Test run', 110),
  lnk('defect', 'Defect', 110),
  { ...txt('parent', 130), caption: 'Parent / Objective' },
  { ...txt('source', 130), caption: 'Source' },
]

export function RtmTable({ rows, onOpen }: { rows: Req[]; onOpen: (r: Req) => void }) {
  const items = useMemo<Row[]>(() => rows.map(r => ({ ...r, check: traceCheck(r) })), [rows])
  const [state, setState] = useState<DataTableState>({ sorting: [{ field: 'id', direction: 'asc' }] })
  const ds = useArrayDataSource<Row, string, unknown>({ items, getId: r => r.id }, [items])
  const view = ds.useView(state, setState, {
    getRowOptions: r => ({ onClick: () => onOpen(r) }),
  })
  if (!rows.length) {
    return <Panel background="surface-main" shadow cx="empty"><Text color="secondary">No requirements match. Add one or import your RTM.xlsm.</Text></Panel>
  }
  return (
    <Panel background="surface-main" shadow cx="table-panel">
      <DataTable<Row, string>
        {...view.getListProps()} getRows={view.getVisibleRows}
        value={state} onValueChange={setState} columns={COLUMNS}
        headerTextCase="upper" border allowColumnsResizing
      />
    </Panel>
  )
}
