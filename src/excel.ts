// Export to .xlsx (styled, via ExcelJS). Import lives in import.ts (SheetJS — tolerant of comments, macros, etc.).
import ExcelJS from 'exceljs'
import { FIELDS, traceCheck, type Req } from './model'
export { importExcel } from './import'

export async function exportExcel(rows: Req[], name = 'RTM') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('RTM', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  const headers = FIELDS.map(f => f.label + f.req)
  headers.splice(26, 0, 'Traceability Check')
  ws.addRow(headers)
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }
  for (const r of rows) {
    const vals: string[] = FIELDS.map(f => String(r[f.key] ?? ''))
    vals.splice(26, 0, traceCheck(r))
    ws.addRow(vals)
  }
  ws.columns.forEach((c, i) => { c.width = i === 11 ? 60 : 22 })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = window.URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'RTM'}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
}
