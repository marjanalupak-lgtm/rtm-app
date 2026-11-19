// Export to .xlsx (styled, via ExcelJS). Import lives in import.ts (SheetJS — tolerant of comments, macros, etc.).
import ExcelJS from 'exceljs'
import { FIELDS, type Req } from './model'
import { defaultConfig, getVal, type Config } from './config'
import { check } from './rules'
import { areaName, areaOf } from './idScheme'
export { importExcel } from './import'

type Col = { label: string; get: (r: Req) => string; wide?: boolean }

// Columns of the export. Area (and its name) follow the ID when the project uses structured IDs.
export function exportColumns(cfg: Config): Col[] {
  const sc = cfg.id.scheme?.on && cfg.id.scheme.areas.length ? cfg.id.scheme : undefined
  const cols: Col[] = []
  for (const f of FIELDS) {
    const fc = cfg.fields[f.key]
    if (!fc.visible) continue
    cols.push({ label: fc.label + (fc.required ? '*' : ''), get: r => getVal(r, f.key), wide: f.key === 'statement' })
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

export async function exportExcel(rows: Req[], name = 'RTM', cfg: Config = defaultConfig()) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('RTM', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  const cols = exportColumns(cfg)
  ws.addRow(cols.map(c => c.label))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF40109E' } }
  for (const r of rows) ws.addRow(cols.map(c => c.get(r)))
  ws.columns.forEach((c, i) => { c.width = cols[i]?.wide ? 60 : 22 })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = window.URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'RTM'}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
}
