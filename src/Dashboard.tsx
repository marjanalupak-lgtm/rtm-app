import { Panel, Text, FlexRow } from '@epam/uui'
import { LISTS, severity, traceCheck, type Req } from './model'
import { CheckBadge } from './ui'

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Panel background="surface-main" shadow cx={'tile ' + (tone ?? '')}>
      <Text fontSize="12" color="secondary">{label.toUpperCase()}</Text>
      <div className="tile-value">{value}</div>
    </Panel>
  )
}

function Bars({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(1, ...data.map(d => d[1]))
  return (
    <Panel background="surface-main" shadow cx="card">
      <Text fontSize="16" fontWeight="600">{title}</Text>
      {!data.length && <Text color="secondary" fontSize="14">No data yet.</Text>}
      {data.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="bar-label">{k}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="bar-num">{v}</span>
        </div>
      ))}
    </Panel>
  )
}

// Known list values first (in list order), then any off-list values found in the data.
const count = (rows: Req[], key: keyof Req, values: readonly string[]): [string, number][] => {
  const all = [...values, ...new Set(rows.map(r => String(r[key] ?? '')).filter(v => v && !values.includes(v)))]
  return all.map(v => [v, rows.filter(r => r[key] === v).length] as [string, number]).filter(d => d[1] > 0)
}

export function Dashboard({ rows, onOpen }: { rows: Req[]; onOpen: (r: Req) => void }) {
  const live = rows.filter(r => r.statement && r.status !== 'Obsolete' && r.status !== 'Rejected')
  const checks = live.map(r => ({ r, c: traceCheck(r) }))
  const covered = checks.filter(x => x.c === 'COVERED').length
  const pct = live.length ? Math.round((covered / live.length) * 100) : 0
  const gaps = checks.filter(x => x.c !== 'COVERED')
  const designGaps = live.filter(r => r.design_required === 'Yes' && r.design_status !== 'Approved').length
  const failed = live.filter(r => r.test_exec === 'Failed').length
  const gapTypes = new Map<string, number>()
  gaps.forEach(g => gapTypes.set(g.c, (gapTypes.get(g.c) ?? 0) + 1))
  const releases = [...new Set(live.map(r => r.release).filter(Boolean))]
  const relCov: [string, number][] = releases.map(rel => {
    const rr = checks.filter(x => x.r.release === rel)
    return [rel, Math.round((rr.filter(x => x.c === 'COVERED').length / rr.length) * 100)]
  })

  return (
    <div className="dash">
      <div className="tiles">
        <Tile label="Requirements" value={live.length} />
        <Tile label="Approved" value={live.filter(r => r.status === 'Approved').length} />
        <Tile label="Coverage" value={pct + '%'} tone={pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'} />
        <Tile label="Open gaps" value={gaps.length} tone={gaps.length ? 'warn' : 'ok'} />
        <Tile label="Design gaps" value={designGaps} tone={designGaps ? 'warn' : 'ok'} />
        <Tile label="Failed tests" value={failed} tone={failed ? 'bad' : 'ok'} />
      </div>
      <div className="cards">
        <Bars title="Requirement status" data={count(live, 'status', LISTS.status)} />
        <Bars title="Delivery status" data={count(live, 'delivery', LISTS.delivery)} />
        <Bars title="Test execution" data={count(live, 'test_exec', LISTS.testExec)} />
        <Bars title="Gap types" data={[...gapTypes.entries()].sort((a, b) => b[1] - a[1])} />
        {relCov.length > 0 && <Bars title="Coverage % by release" data={relCov} />}
        <Bars title="Priority" data={count(live, 'priority', LISTS.priority)} />
      </div>
      <Panel background="surface-main" shadow cx="card">
        <Text fontSize="16" fontWeight="600">Needs attention</Text>
        {!gaps.length && <Text color="secondary">All requirements are covered.</Text>}
        {gaps.sort((a, b) => (severity(a.c) === 'bad' ? -1 : 0) - (severity(b.c) === 'bad' ? -1 : 0)).slice(0, 15).map(({ r, c }) => (
          <FlexRow key={r.id} cx="attn" columnGap="12" onClick={() => onOpen(r)}>
            <Text fontWeight="600" cx="attn-id">{r.id}</Text>
            <Text cx="attn-text">{r.statement}</Text>
            <CheckBadge check={c} />
          </FlexRow>
        ))}
      </Panel>
    </div>
  )
}
