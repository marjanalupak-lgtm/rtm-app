// Traceability tree: Business → Stakeholder → Functional / Non-functional / Transition.
import { useMemo, useState } from 'react'
import { Badge, Button, FlexRow, FlexSpacer, Panel, Text } from '@epam/uui'
import type { Req } from './model'
import { useConfig } from './config'
import { check } from './rules'
import { buildTree, levelOf, type TreeNode } from './tree'
import { CheckBadge, StatusBadge } from './ui'

const LEVEL_NAME = ['Business', 'Stakeholder', 'Solution & transition']
const LEVEL_CLASS = ['lv0', 'lv1', 'lv2']

function Node({ n, depth, open, toggle, onOpen, q }: { n: TreeNode; depth: number; open: Set<string>; toggle: (id: string) => void; onOpen: (r: Req) => void; q: string }) {
  const cfg = useConfig()
  const isOpen = open.has(n.req.id)
  const hit = q && [n.req.id, n.req.statement].some(v => v.toLowerCase().includes(q))
  return (
    <>
      <div className={'tree-row ' + (hit ? 'hit' : '')} style={{ paddingLeft: 12 + depth * 28 }}>
        <button className="twisty" aria-label={isOpen ? 'Collapse' : 'Expand'} disabled={!n.children.length} onClick={() => toggle(n.req.id)}>
          {n.children.length ? (isOpen ? '▾' : '▸') : '·'}
        </button>
        <span className={'lvl ' + LEVEL_CLASS[levelOf(n.req.type)]}>{n.req.type || '—'}</span>
        <button className="tree-id" onClick={() => onOpen(n.req)}>{n.req.id}</button>
        <span className="tree-text" title={n.req.statement}>{n.req.statement}</span>
        {n.extraParents.length > 0 && <span className="also">also under {n.extraParents.join(', ')}</span>}
        {n.children.length > 0 && <span className="count">{n.children.length}</span>}
        <StatusBadge value={n.req.status} />
        <CheckBadge check={check(n.req, cfg)} />
      </div>
      {isOpen && n.children.map(c => <Node key={n.req.id + '>' + c.req.id} n={c} depth={depth + 1} open={open} toggle={toggle} onOpen={onOpen} q={q} />)}
    </>
  )
}

export function TreeView({ rows, onOpen, q, filtersActive }: { rows: Req[]; onOpen: (r: Req) => void; q: string; filtersActive?: boolean }) {
  const t = useMemo(() => buildTree(rows), [rows])
  const all = useMemo(() => {
    const s = new Set<string>(); const walk = (n: TreeNode) => { if (n.children.length) s.add(n.req.id); n.children.forEach(walk) }
    ;[...t.roots, ...t.orphans].forEach(walk); return s
  }, [t])
  const [open, setOpen] = useState<Set<string>>(() => all)
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const counts = [0, 1, 2].map(l => rows.filter(r => r.id && levelOf(r.type) === l).length)
  const query = q.trim().toLowerCase()

  if (!rows.length) return <Panel background="surface-main" shadow cx="empty"><Text color="secondary">No requirements yet.</Text></Panel>
  return (
    <div className="dash">
      <Panel background="surface-main" shadow cx="card">
        <FlexRow columnGap="18" cx="tree-legend">
          {LEVEL_NAME.map((n, i) => <span key={n} className="legend-item"><span className={'lvl ' + LEVEL_CLASS[i]}>{n}</span><b>{counts[i]}</b></span>)}
          <FlexSpacer />
          <Button size="30" fill="none" color="secondary" caption="Expand all" onClick={() => setOpen(all)} />
          <Button size="30" fill="none" color="secondary" caption="Collapse all" onClick={() => setOpen(new Set())} />
        </FlexRow>
        <Text fontSize="14" color="secondary">Links come from “Parent Requirement / Business Objective”: put the parent’s ID there (several IDs separated by commas). Click an ID to open it. Search highlights matches.{filtersActive ? ' Column filters from the List view are not applied here, so the hierarchy stays whole.' : ''}</Text>
      </Panel>

      {t.issues.length > 0 && (
        <Panel background="surface-main" shadow cx="card">
          <FlexRow columnGap="12"><Text fontSize="16" fontWeight="600">Structure issues</Text><Badge size="24" color="warning" fill="outline" caption={String(t.issues.length)} /></FlexRow>
          {t.issues.slice(0, 20).map((i, k) => {
            const r = rows.find(x => x.id === i.id)
            return (
              <FlexRow key={k} columnGap="12" cx="attn" onClick={() => r && onOpen(r)}>
                <Text fontWeight="600" cx="attn-id">{i.id}</Text>
                <Badge size="18" fill="outline" color={i.kind === 'orphan' ? 'warning' : 'critical'} caption={i.kind === 'orphan' ? 'no parent' : i.kind === 'level' ? 'level' : 'cycle'} />
                <Text cx="attn-text">{i.text}</Text>
              </FlexRow>
            )
          })}
        </Panel>
      )}

      <Panel background="surface-main" shadow cx="card tree">
        {t.roots.length === 0 && <Text color="secondary">No Business requirements at the top yet. Set Requirement Type = Business on your top-level needs.</Text>}
        {t.roots.map(n => <Node key={n.req.id} n={n} depth={0} open={open} toggle={toggle} onOpen={onOpen} q={query} />)}
      </Panel>

      {t.orphans.length > 0 && (
        <Panel background="surface-main" shadow cx="card tree">
          <Text fontSize="16" fontWeight="600">Not linked to a parent ({t.orphans.length})</Text>
          {t.orphans.map(n => <Node key={n.req.id} n={n} depth={0} open={open} toggle={toggle} onOpen={onOpen} q={query} />)}
        </Panel>
      )}
    </div>
  )
}
