// Tree view as a table: Business ▸ Stakeholder ▸ Functional / Non-functional / Transition.
// Built from the Parent field. A requirement with several parents sits under the first one
// ("also under …" names the others). Search and column filters keep the parents of matches.
import { useMemo, useState } from 'react'
import { useArrayDataSource, type DataColumnProps, type DataTableState } from '@epam/uui-core'
import { DataTable, Panel, Text } from '@epam/uui'
import type { Req } from './model'
import { useConfig } from './config'
import { applyFilters, type FilterState } from './Filters'
import { buildTree, levelOf, type TreeNode } from './tree'

type Node = Req & { parentId?: string; also: string[]; kids: number }
const LEVEL_CLASS = ['lv0', 'lv1', 'lv2']

export function TreeTable({ rows, q, filters, selectedId, onOpen }: { rows: Req[]; q: string; filters: FilterState; selectedId?: string; onOpen: (r: Req) => void }) {
  const cfg = useConfig()
  const items = useMemo<Node[]>(() => {
    const t = buildTree(rows)
    const out: Node[] = []
    const walk = (n: TreeNode, parentId?: string) => {
      if (out.some(x => x.id === n.req.id)) return
      out.push({ ...n.req, parentId, also: n.extraParents, kids: n.children.length })
      n.children.forEach(c => walk(c, n.req.id))
    }
    ;[...t.roots, ...t.orphans].forEach(n => walk(n))
    return out
  }, [rows])

  const [state, setState] = useState<DataTableState>({})
  const ds = useArrayDataSource<Node, string, unknown>({
    items, getId: i => i.id, getParentId: i => i.parentId,
    getSearchFields: i => [i.id, i.statement],
    getFilter: () => (i: Node) => applyFilters([i], filters, cfg).length > 0,
  }, [items, filters, cfg])
  const view = ds.useView({ ...state, search: q, filter: filters }, setState as never, {
    getRowOptions: r => ({ onClick: () => onOpen(r), isSelectable: true }),
    isFoldedByDefault: () => false,
  })

  const columns: DataColumnProps<Node, string>[] = [
    {
      key: 'id', caption: 'ID', width: 300, fix: 'left', alignSelf: 'center',
      render: r => <span className="tt-id"><span className={'lvl ' + LEVEL_CLASS[levelOf(r.type)]}>{r.type || '—'}</span><b>{r.id}</b></span>,
    },
    {
      key: 'statement', caption: 'Requirement', width: 520, grow: 1, alignSelf: 'center',
      render: r => <div className="cell-clamp" title={r.statement.length > 60 ? r.statement : undefined}>{r.statement}{r.also.length > 0 && <span className="also"> · also under {r.also.join(', ')}</span>}</div>,
    },
    { key: 'kids', caption: 'Children', width: 110, alignSelf: 'center', textAlign: 'right', render: r => r.kids ? <span className="count">{r.kids}</span> : null },
  ]

  if (!rows.length) return <Panel background="surface-main" shadow cx="empty"><Text color="secondary">No requirements yet.</Text></Panel>
  return (
    <Panel background="surface-main" shadow cx="table-panel">
      <DataTable<Node, string> {...view.getListProps()} getRows={view.getVisibleRows}
        value={{ ...state, selectedId }} onValueChange={setState} columns={columns}
        headerTextCase="upper" border size="48" headerSize="48" />
    </Panel>
  )
}
