// "Versions" tab of a requirement: the current version and every saved older one, read-only,
// with what changed in the next version and everything that was linked to it at the time.
import { useState } from 'react'
import { Text } from '@epam/uui'
import { FIELDS, type Req } from './model'
import { fieldLabel, getVal, type Config } from './config'
import { LinkText } from './ui'
import { VERSIONED, type Version } from './versions'

const LINKS = ['parent', 'dependency', 'epic_id', 'epic_title', 'story_id', 'design_required', 'design_link', 'design_status', 'design_owner',
  'test_case', 'test_case_status', 'test_exec', 'defect', 'spec_link'] as const
const STATE = ['type', 'category', 'priority', 'status', 'owner', 'release', 'delivery', 'source'] as const

export function VersionsTab({ r, versions, cfg }: { r: Req; versions: Version[]; cfg: Config }) {
  const current = versions.length + 1
  const [sel, setSel] = useState<number>(versions[0]?.version ?? current)
  const snapOf = (n: number): Req | undefined => (n === current ? r : versions.find(v => v.version === n)?.snapshot)
  const snap = snapOf(sel)
  const meta = versions.find(v => v.version === sel)
  const next = sel < current ? snapOf(sel + 1) : undefined
  const changed = next && snap ? VERSIONED.filter(k => String(snap[k] ?? '').trim() !== String(next[k] ?? '').trim()) : []

  if (!versions.length) return <Text color="secondary">This is version 1. A new version starts when the requirement text, acceptance criteria, type or parent changes; the old one is kept here with everything linked to it.</Text>

  return (
    <div className="versions">
      <ul className="ver-list" aria-label="Versions">
        {[current, ...versions.map(v => v.version)].map(n => {
          const v = versions.find(x => x.version === n)
          return (
            <li key={n}><button aria-pressed={n === sel} className={'ver-item' + (n === sel ? ' on' : '')} onClick={() => setSel(n)}>
              <b>v{n}</b>{n === current ? ' · current' : ` · until ${new Date(v!.saved_at).toLocaleDateString()}`}
              {v && <span className="ver-by">{v.saved_by}</span>}
            </button></li>
          )
        })}
      </ul>

      {snap && (
        <div className="ver-detail" role="region" aria-label={`Version ${sel}`}>
          <Text fontSize="14" color="secondary">
            {sel === current ? 'Current version.' : `Version ${sel} of ${snap.id}${snap.id !== r.id ? ` (now ${r.id})` : ''} — replaced ${new Date(meta!.saved_at).toLocaleString()} by ${meta!.saved_by}.`}
          </Text>
          {changed.length > 0 && <Text fontSize="14">Changed in v{sel + 1}: <b>{changed.map(k => fieldLabel(cfg, k)).join(', ')}</b></Text>}

          <section className="ver-sec">
            <Text fontSize="12" fontWeight="600" color="secondary">REQUIREMENT</Text>
            <Text cx="ver-text">{snap.statement || '—'}</Text>
            {snap.acceptance && <><Text fontSize="12" fontWeight="600" color="secondary">ACCEPTANCE CRITERIA</Text><Text cx="ver-text">{snap.acceptance}</Text></>}
          </section>

          <section className="ver-sec ver-grid">
            {STATE.map(k => <div key={k}><Text fontSize="12" color="secondary">{fieldLabel(cfg, k)}</Text><Text fontSize="14">{getVal(snap, k) || '—'}</Text></div>)}
          </section>

          <section className="ver-sec">
            <Text fontSize="12" fontWeight="600" color="secondary">LINKED AT THIS VERSION</Text>
            <div className="ver-grid">
              {LINKS.filter(k => getVal(snap, k)).map(k => (
                <div key={k}><Text fontSize="12" color="secondary">{fieldLabel(cfg, k)}</Text><div className="ver-link">{FIELDS.find(f => f.key === k)?.link ? <LinkText value={getVal(snap, k)} /> : getVal(snap, k)}</div></div>
              ))}
            </div>
            {!LINKS.some(k => getVal(snap, k)) && <Text fontSize="14" color="secondary">Nothing was linked.</Text>}
            {(snap.attachments ?? []).length > 0 && (
              <ul className="ver-atts">{snap.attachments!.map(a => <li key={a.id}><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a></li>)}</ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
