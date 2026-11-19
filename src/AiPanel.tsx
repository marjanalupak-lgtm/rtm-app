// AI intake: paste text / add files → Claude proposes requirements → the user reviews, edits, ticks and applies.
// All text from files and from Claude is rendered as plain text (never as HTML).
import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Checkbox, FlexRow, FlexSpacer, IconButton, LabeledInput, Text, TextArea, TextInput, WarningAlert } from '@epam/uui'
import type { Req } from './model'
import type { Config } from './config'
import { Select } from './ui'
import * as store from './store'
import { ACCEPT, checkSize, fileToBlocks, type Block } from './ai/inputs'
import { AiError, explain, getKey, runIntake } from './ai/client'
import { cardProblem, planApply } from './ai/apply'
import type { AiResult, Proposal, ProposalKind } from './ai/prompt'

const KIND: Record<ProposalKind, { label: string; color: 'success' | 'info' | 'neutral' | 'warning' }> = {
  new: { label: 'NEW', color: 'success' }, update: { label: 'UPDATE', color: 'info' },
  duplicate: { label: 'DUPLICATE', color: 'neutral' }, conflict: { label: 'CONFLICT', color: 'warning' },
}
const today = () => new Date().toISOString().slice(0, 10)

export function AiPanel(p: { pid: string; rows: Req[]; cfg: Config; me: string; onClose: () => void; onApplied: () => void | Promise<void>; notify: (m: string, ok?: boolean) => void; openSettingsAi: () => void }) {
  const { rows, cfg } = p
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [res, setRes] = useState<AiResult | null>(null)
  const [cards, setCards] = useState<Proposal[]>([])
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<ProposalKind | 'all'>('all')
  const [defs, setDefs] = useState({ release: cfg.lists.release[cfg.lists.release.length - 1] ?? '', owner: p.me, source: `AI intake ${today()}` })
  const abort = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sc = cfg.id.scheme?.on ? cfg.id.scheme : undefined
  const hasKey = !!getKey()
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])

  const addFiles = (list: FileList | null) => { setFiles(f => [...f, ...Array.from(list ?? [])]); setErr('') }
  const analyse = async () => {
    const tooBig = checkSize(files, text)
    if (tooBig) return setErr(`${explain('too-large')} (${tooBig})`)
    setErr(''); abort.current = new AbortController()
    try {
      const blocks: Block[] = []
      for (const f of files) {
        setBusy(`Reading ${f.name}…`)
        try { blocks.push(...await fileToBlocks(f)) }
        catch (e) { throw new Error((e as Error).message.startsWith('unsupported:') ? `This file type isn't supported: ${f.name}` : `Couldn't read ${f.name}`) }
      }
      setBusy('Claude is analysing… this can take a minute or two.')
      const r = await runIntake({ rows, cfg, text, blocks, signal: abort.current.signal })
      setRes(r); setCards(r.proposals)
      setTicked(new Set(r.proposals.map((x, i) => (x.kind === 'new' || x.kind === 'update') && !cardProblem(x, rows, cfg) ? i : -1).filter(i => i >= 0)))
    } catch (e) {
      setErr(e instanceof AiError ? explain(e.kind) + (e.kind === 'refused' && e.message !== 'refused' ? ` (${e.message})` : '') : (e as Error).message)
    } finally { setBusy(''); abort.current = null }
  }

  const edit = (i: number, patch: Partial<Proposal>) => setCards(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const toggle = (i: number) => setTicked(t => { const n = new Set(t); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const chosen = [...ticked].filter(i => !cardProblem(cards[i], rows, cfg) && cards[i].kind !== 'duplicate')
  const apply = async () => {
    setBusy('Saving…'); setErr('')
    try {
      const plan = planApply(chosen.map(i => cards[i]), rows, cfg, { ...defs, date: today() })
      const r = await store.applyIntake(p.pid, plan, rows)
      await p.onApplied()
      const extra = [...r.skipped.map(s => `${s.id} skipped: ${s.why}`), ...plan.warnings]
      p.notify(`Added ${r.created}, updated ${r.updated}` + (extra.length ? ` — ${extra.join('; ')}` : ''), !r.skipped.length)
      p.onClose()
    } catch (e) { setErr('Save failed: ' + (e as Error).message) } finally { setBusy('') }
  }
  const close = () => {
    if (busy && abort.current) abort.current.abort()
    if ((res || text.trim() || files.length) && !confirm('Close the AI panel? Your input and results here will be lost.')) return
    p.onClose()
  }

  const counts = (k: ProposalKind) => cards.filter(c => c.kind === k).length
  const shown = cards.map((c, i) => [c, i] as const).filter(([c]) => filter === 'all' || c.kind === filter)
  const areaOpts = sc?.areas.map(a => a.code) ?? []
  const areaLabels = Object.fromEntries((sc?.areas ?? []).map(a => [a.code, a.name ? `${a.code} · ${a.name}` : a.code]))

  return (
    <div className="ai-overlay" role="dialog" aria-modal="true" aria-label="AI intake">
      <div className="ai-panel">
        <FlexRow padding="24" vPadding="18" borderBottom columnGap="12">
          <Text fontSize="18" fontWeight="600">AI intake</Text>
          {res && <Text color="secondary" fontSize="14">{counts('new')} new · {counts('update')} updates · {counts('duplicate')} duplicates · {counts('conflict')} conflicts</Text>}
          <FlexSpacer />
          <IconButton icon={() => <span className="pane-x" aria-hidden>×</span>} onClick={close} rawProps={{ 'aria-label': 'Close AI intake' }} />
        </FlexRow>

        <div className="ai-body">
          {err && <WarningAlert cx="mb">{err}</WarningAlert>}
          {!hasKey && (
            <WarningAlert cx="mb">
              <FlexRow columnGap="12"><Text>{explain('no-key')}</Text><Button size="24" caption="Add key in Settings" onClick={p.openSettingsAi} /></FlexRow>
            </WarningAlert>
          )}

          {!res && (
            <div className="ai-input">
              <TextArea value={text} onValueChange={v => setText(v ?? '')} rows={10} autoSize placeholder="Paste or type notes, an email, meeting notes or a transcript…" isDisabled={!!busy} />
              <FlexRow columnGap="12" cx="ai-files">
                <Button fill="outline" color="secondary" caption="+ Add files" onClick={() => fileRef.current?.click()} isDisabled={!!busy} />
                <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
                {files.map((f, i) => (
                  <span key={i} className="af-chip">{f.name}
                    <IconButton icon={() => <span className="fchip-x" aria-hidden>×</span>} onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} rawProps={{ 'aria-label': `Remove ${f.name}` }} />
                  </span>
                ))}
              </FlexRow>
              <Text color="secondary" fontSize="12">PDF, images, Word, Excel, .txt / .md / .vtt / .srt / .csv. Audio is not supported yet: paste a transcript instead.</Text>
              <Text color="secondary" fontSize="12">Context sent: {rows.length} requirements, ID structure, lists. Your text and files are sent to Anthropic (Claude).</Text>
            </div>
          )}

          {res && (
            <div className="ai-review">
              <section className="ai-sec"><Text fontWeight="600">Summary</Text><Text>{res.summary}</Text></section>
              {res.structure.length > 0 && <section className="ai-sec"><Text fontWeight="600">Structure suggestions</Text><ul>{res.structure.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}

              <FlexRow columnGap="6" cx="ai-filter">
                {(['all', 'new', 'update', 'duplicate', 'conflict'] as const).map(k => (
                  <Button key={k} size="24" fill={filter === k ? 'solid' : 'outline'} color={filter === k ? 'primary' : 'secondary'}
                    caption={k === 'all' ? `All (${cards.length})` : `${KIND[k].label[0]}${KIND[k].label.slice(1).toLowerCase()} (${counts(k)})`} onClick={() => setFilter(k)} />
                ))}
              </FlexRow>

              {shown.map(([c, i]) => {
                const problem = cardProblem(c, rows, cfg)
                const ex = c.existingId ? byId.get(c.existingId) : undefined
                const needsArea = !!sc?.types[c.type]?.area
                return (
                  <div key={i} className={'ai-card k-' + c.kind + (ticked.has(i) && !problem ? ' on' : '')}>
                    <FlexRow columnGap="12">
                      {c.kind !== 'duplicate' && <Checkbox value={ticked.has(i) && !problem} isDisabled={!!problem} onValueChange={() => toggle(i)} rawProps={{ 'aria-label': 'Apply this proposal' }} />}
                      <Badge size="24" fill="outline" color={KIND[c.kind].color} caption={KIND[c.kind].label} />
                      {c.kind === 'new' && <Text fontSize="14" color="secondary">{c.type || '—'}{c.area ? ' · ' + c.area : ''}{c.tmpId ? ' · ' + c.tmpId : ''}</Text>}
                      {c.existingId && <span className="trace-chip">{c.existingId}{ex ? ' · ' + ex.type : ' · not found'}</span>}
                      {problem && <Badge size="24" fill="outline" color="critical" caption={problem} />}
                    </FlexRow>

                    {c.kind === 'new' && (
                      <div className="ai-edit">
                        <TextArea value={c.statement} onValueChange={v => edit(i, { statement: v ?? '' })} rows={2} autoSize />
                        <div className="ai-grid">
                          <LabeledInput label="Type"><Select value={c.type} options={cfg.lists.type} onChange={v => edit(i, { type: v })} /></LabeledInput>
                          {needsArea && <LabeledInput label="Area"><Select value={c.area} options={areaOpts} labels={areaLabels} onChange={v => edit(i, { area: v })} /></LabeledInput>}
                          <LabeledInput label="Parent"><TextInput value={c.parent} onValueChange={v => edit(i, { parent: v ?? '' })} placeholder="ID or tmp-…" /></LabeledInput>
                          <LabeledInput label="Priority"><Select value={c.priority} options={cfg.lists.priority} onChange={v => edit(i, { priority: v })} /></LabeledInput>
                        </div>
                        <LabeledInput label="Acceptance criteria"><TextArea value={c.acceptance} onValueChange={v => edit(i, { acceptance: v ?? '' })} rows={2} autoSize /></LabeledInput>
                      </div>
                    )}
                    {c.kind !== 'new' && ex && <Text fontSize="14" color="secondary" cx="ai-existing">Now: {ex.statement}</Text>}
                    {c.kind !== 'new' && Object.keys(c.changes).length > 0 && (
                      <ul className="ai-changes">{Object.entries(c.changes).map(([k, v]) => <li key={k}><b>{k}</b> → {v}</li>)}</ul>
                    )}
                    {c.kind !== 'new' && c.statement && <Text fontSize="14">{c.statement}</Text>}
                    <Text fontSize="12" color="secondary">{c.reason}{c.source ? ` — source: ${c.source}` : ''}</Text>
                  </div>
                )
              })}

              {res.questions.length > 0 && <section className="ai-sec"><Text fontWeight="600">Open questions</Text><ul>{res.questions.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}
              {res.nextSteps.length > 0 && <section className="ai-sec"><Text fontWeight="600">Next steps</Text><ul>{res.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}

              <section className="ai-sec">
                <Text fontWeight="600">For new requirements</Text>
                <div className="ai-grid">
                  <LabeledInput label="Release">{cfg.lists.release.length
                    ? <Select value={defs.release} options={cfg.lists.release} onChange={v => setDefs(d => ({ ...d, release: v }))} />
                    : <TextInput value={defs.release} onValueChange={v => setDefs(d => ({ ...d, release: v ?? '' }))} />}</LabeledInput>
                  <LabeledInput label="Owner"><TextInput value={defs.owner} onValueChange={v => setDefs(d => ({ ...d, owner: v ?? '' }))} /></LabeledInput>
                  <LabeledInput label="Source"><TextInput value={defs.source} onValueChange={v => setDefs(d => ({ ...d, source: v ?? '' }))} /></LabeledInput>
                </div>
              </section>
            </div>
          )}
        </div>

        <FlexRow padding="24" vPadding="12" borderTop columnGap="12" cx="ai-foot">
          {busy && <Text color="secondary" fontSize="14">{busy}</Text>}
          <FlexSpacer />
          {!res && busy && abort.current && <Button fill="outline" color="secondary" caption="Cancel" onClick={() => abort.current?.abort()} />}
          {!res && !busy && <Button fill="none" color="secondary" caption="Close" onClick={close} />}
          {!res && !busy && <Button color="primary" caption="Analyse" isDisabled={!hasKey || (!text.trim() && !files.length)} onClick={analyse} />}
          {res && !busy && <Button fill="outline" color="secondary" caption="Back to input" onClick={() => { if (confirm('Go back? These results will be discarded.')) { setRes(null); setCards([]) } }} />}
          {res && <Button color="primary" caption={`Apply ${chosen.length} selected`} isDisabled={!chosen.length || !!busy} onClick={apply} />}
        </FlexRow>
      </div>
    </div>
  )
}
