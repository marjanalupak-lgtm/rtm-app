// Export to .xlsx (styled, via ExcelJS). Import lives in import.ts (SheetJS — tolerant of comments, macros, etc.).
import ExcelJS from 'exceljs'
import { FIELDS, type Req } from './model'
import { defaultConfig, getVal, type Config } from './config'
import { check } from './rules'
import { areaName, areaOf } from './idScheme'
import { versionOf, type Version } from './versions'
export { importExcel } from './import'

type Col = { label: string; get: (r: Req) => string; wide?: boolean }

// Columns of the export. Area (and its name) follow the ID when the project uses structured IDs.
export function exportColumns(cfg: Config, versions: Version[] = []): Col[] {
  const sc = cfg.id.scheme?.on && cfg.id.scheme.areas.length ? cfg.id.scheme : undefined
  const cols: Col[] = []
  for (const f of FIELDS) {
    const fc = cfg.fields[f.key]
    if (!fc.visible) continue
    cols.push({ label: fc.label + (fc.required ? '*' : ''), get: r => getVal(r, f.key), wide: f.key === 'statement' })
    if (f.key === 'id') cols.push({ label: 'Version', get: r => 'v' + versionOf(r.id, versions) })
    if (f.key === 'id' && sc) {
      cols.push({ label: 'Area', get: r => areaOf(r.id, sc) })
      if (sc.areas.some(a => a.name)) cols.push({ label: 'Area name', get: r => areaName(areaOf(r.id, sc), sc) })
    }
    if (f.key === 'defect') cols.push({ label: 'Traceability Check', get: r => check(r, cfg) })
  }
  for (const c of cfg.custom) cols.push({ label: c.label + (c.required ? '*' : ''), get: r => getVal(r, c.key) })
  cols.push({ label: 'Attachments & links', get: r => (r.attachments ?? []).map(x => `${x.name}: ${x.url}`).join('\n'), wide: true })
  return cols
}

// Sheet "Versions": every older version of the exported requirements, with all fields as they were.
export function versionSheet(versions: Version[], cfg: Config, ids: string[]): { head: string[]; rows: string[][] } {
  const keep = new Set(ids)
  const fields = FIELDS.filter(f => cfg.fields[f.key].visible)
  const head = ['Requirement ID', 'Version', 'Replaced at (UTC)', 'Replaced by', ...fields.map(f => cfg.fields[f.key].label), 'Attachments & links']
  const rows = versions.filter(v => keep.has(v.req_id))
    .sort((a, b) => a.req_id.localeCompare(b.req_id, undefined, { numeric: true }) || a.version - b.version)
    .map(v => [v.req_id, 'v' + v.version, v.saved_at.slice(0, 16).replace('T', ' '), v.saved_by,
      ...fields.map(f => getVal(v.snapshot, f.key)), (v.snapshot.attachments ?? []).map(x => `${x.name}: ${x.url}`).join('\n')])
  return { head, rows }
}

export async function exportExcel(rows: Req[], name = 'RTM', cfg: Config = defaultConfig(), versions: Version[] = []) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('RTM', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  const cols = exportColumns(cfg, versions)
  ws.addRow(cols.map(c => c.label))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF40109E' } }
  for (const r of rows) ws.addRow(cols.map(c => c.get(r)))
  ws.columns.forEach((c, i) => { c.width = cols[i]?.wide ? 60 : 22 })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  const vs = versionSheet(versions, cfg, rows.map(r => r.id))
  if (vs.rows.length) {
    const ws2 = wb.addWorksheet('Versions', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] })
    ws2.addRow(vs.head)
    ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF40109E' } }
    for (const r of vs.rows) ws2.addRow(r)
    ws2.columns.forEach((c, i) => { c.width = vs.head[i] === cfg.fields.statement.label ? 60 : i < 2 ? 14 : 22 })
    ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: vs.head.length } }
  }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = window.URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'RTM'}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
}
