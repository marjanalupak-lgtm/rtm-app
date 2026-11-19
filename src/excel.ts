// Export to .xlsx (styled, via ExcelJS). Import lives in import.ts (SheetJS — tolerant of comments, macros, etc.).
import ExcelJS from 'exceljs'
import { FIELDS, type Req } from './model'
import { defaultConfig, getVal, type Config } from './config'
import { check } from './rules'
export { importExcel } from './import'

export async function exportExcel(rows: Req[], name = 'RTM', cfg: Config = defaultConfig()) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('RTM', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  const cols: { label: string; get: (r: Req) => string; wide?: boolean }[] = []
  for (const f of FIELDS) {
    const fc = cfg.fields[f.key]
    if (!fc.visible) continue
    cols.push({ label: fc.label + (fc.required ? '*' : ''), get: r => getVal(r, f.key), wide: f.key === 'statement' })
    if (f.key === 'defect') cols.push({ label: 'Traceability Check', get: r => check(r, cfg) })
  }
  for (const c of cfg.custom) cols.push({ label: c.label + (c.required ? '*' : ''), get: r => getVal(r, c.key) })
  ws.addRow(cols.map(c => c.label))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }
  for (const r of rows) ws.addRow(cols.map(c => c.get(r)))
  ws.columns.forEach((c, i) => { c.width = cols[i]?.wide ? 60 : 22 })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = window.URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'RTM'}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
}
