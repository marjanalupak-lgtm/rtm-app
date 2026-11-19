// Filter bar: quick filters (Type, Status, Priority, Traceability) plus "+ Filter" for any other field.
// Options are the values that actually occur in the project; "(empty)" matches blank cells.
import { useState } from 'react'
import { Button, Checkbox, FlexSpacer, IconButton, LinkButton, SearchInput, Text } from '@epam/uui'
import { FIELDS, type Req } from './model'
import { getVal, type Config } from './config'
import { check } from './rules'
import { SHORT } from './RtmTable'

export type FilterState = { fields: string[]; values: Record<string, string[]> }
export const DEFAULT_FILTERS = ['type', 'status', 'priority', 'check']
export const emptyFilters = (): FilterState => ({ fields: [...DEFAULT_FILTERS], values: {} })
export const EMPTY = '(empty)'
const SKIP = new Set(['id', 'statement', 'acceptance', 'notes', 'spec_link', 'design_link'])

export function filterableFields(cfg: Config): { key: string; label: string }[] {
  const out = [{ key: 'check', label: 'Traceability' }]
  for (const f of FIELDS) if (!SKIP.has(f.key) && cfg.fields[f.key].visible) out.push({ key: f.key, label: cfg.fields[f.key].label !== f.label ? cfg.fields[f.key].label : SHORT[f.key] ?? f.label })
  for (const c of cfg.custom) if (c.type !== 'long') out.push({ key: c.key, label: c.label })
  return out
}

export const valueOf = (r: Req, key: string, cfg: Config) => (key === 'check' ? check(r, cfg) : getVal(r, key)).trim()

export function applyFilters(rows: Req[], st: FilterState, cfg: Config): Req[] {
  const active = Object.entries(st.values).filter(([k, v]) => v.length && st.fields.includes(k))
  if (!active.length) return rows
  return rows.filter(r => active.every(([k, vals]) => vals.includes(valueOf(r, k, cfg) || EMPTY)))
}

export function optionsFor(rows: Req[], key: string, cfg: Config): string[] {
  const seen = new Set(rows.map(r => valueOf(r, key, cfg) || EMPTY))
  const f = FIELDS.find(x => x.key === key)
  const listOrder: string[] = f?.list ? cfg.lists[f.list] : key === 'release' ? cfg.lists.release : cfg.custom.find(c => c.key === key)?.options ?? []
  const ordered = listOrder.filter(v => seen.has(v))
  const rest = [...seen].filter(v => v !== EMPTY && !ordered.includes(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return [...ordered, ...rest, ...(seen.has(EMPTY) ? [EMPTY] : [])]
}

// Summary of active filters (set from the column headers): "Filtered by: Priority: Critical, High ×" + Clear.
export function ActiveFilters({ cfg, st, onChange }: { cfg: Config; st: FilterState; onChange: (s: FilterState) => void }) {
  const all = filterableFields(cfg)
  const active = st.fields.filter(k => st.values[k]?.length && all.some(f => f.key === k))
  if (!active.length) return null
  const label = (k: string) => all.find(f => f.key === k)?.label ?? k
  const remove = (k: string) => { const values = { ...st.values }; delete values[k]; onChange({ ...st, values }) }
  return (
    <div className="active-filters" role="group" aria-label="Active filters">
      <span className="af-title">Filtered by</span>
      {active.map(k => (
        <span key={k} className="af-chip">
          <b>{label(k)}:</b> {st.values[k].join(', ')}
          <IconButton icon={() => <span className="fchip-x" aria-hidden>×</span>} onClick={() => remove(k)} rawProps={{ 'aria-label': `Remove ${label(k)} filter` }} />
        </span>
      ))}
      <Button size="24" fill="none" color="secondary" caption="Clear filters" onClick={() => onChange(emptyFilters())} />
      <Text fontSize="12" color="secondary">Applies to the table, Dashboard and Excel export.</Text>
    </div>
  )
}

// Filter shown in a column header dropdown. Shares state with the filter bar.
export type FilterCtx = { rows: Req[]; cfg: Config; st: FilterState; onChange: (s: FilterState) => void }
export const isFilterable = (key: string, cfg: Config) => filterableFields(cfg).some(f => f.key === key)

export function HeaderFilter({ field, ctx, close }: { field: string; ctx: FilterCtx; close?: () => void }) {
  const { rows, cfg, st, onChange } = ctx
  const [q, setQ] = useState('')
  const opts = optionsFor(rows, field, cfg)
  const counts = new Map<string, number>()
  for (const r of rows) { const v = valueOf(r, field, cfg) || EMPTY; counts.set(v, (counts.get(v) ?? 0) + 1) }
  const sel = st.values[field] ?? []
  const set = (vals: string[]) => onChange({ fields: st.fields.includes(field) ? st.fields : [...st.fields, field], values: { ...st.values, [field]: vals } })
  const toggle = (v: string) => set(sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v])
  const shown = opts.filter(v => !q || v.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="hfilter" onClick={e => e.stopPropagation()}>
      {opts.length > 8 && <SearchInput size="30" value={q} onValueChange={v => setQ(v ?? '')} placeholder="Search values" />}
      <div className="hfilter-list">
        {shown.map(v => (
          <div key={v} className="hfilter-item">
            <Checkbox label={v} value={sel.includes(v)} onValueChange={() => toggle(v)} />
            <span className="hfilter-count">{counts.get(v) ?? 0}</span>
          </div>
        ))}
        {!shown.length && <Text fontSize="14" color="secondary">No values</Text>}
      </div>
      <div className="hfilter-foot">
        <LinkButton size="30" caption="Select all" onClick={() => set(opts)} />
        <LinkButton size="30" caption="Clear" isDisabled={!sel.length} onClick={() => set([])} />
        {close && <><FlexSpacer /><Button size="24" color="primary" caption="Done" onClick={close} /></>}
      </div>
    </div>
  )
}
