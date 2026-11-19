// Import from / export to the RTM.xlsm layout (sheet "RTM", header row 5, data from row 6).
import ExcelJS from 'exceljs'
import { FIELDS, traceCheck, type Req, emptyReq } from './model'

const norm = (s: string) => s.toLowerCase().replace(/[*†]/g, '').replace(/\s+/g, ' ').trim()

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
    if ('hyperlink' in v) return String(v.hyperlink || v.text || '')
    if ('richText' in v) return v.richText.map(t => t.text).join('')
    if ('text' in v) return String(v.text)
    return ''
  }
  return String(v).trim()
}

export async function importExcel(file: File): Promise<Req[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.getWorksheet('RTM') ?? wb.worksheets[0]
  // Find header row: the one containing "Requirement ID".
  let headerRow = 0
  ws.eachRow((row, n) => {
    if (!headerRow && (row.values as ExcelJS.CellValue[]).some(v => norm(cellText(v)) === 'requirement id')) headerRow = n
  })
  if (!headerRow) throw new Error('Header row with "Requirement ID" not found')
  const colOf = new Map<string, number>()
  ws.getRow(headerRow).eachCell((c, col) => colOf.set(norm(cellText(c.value)), col))
  const out: Req[] = []
  for (let n = headerRow + 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n)
    const r = emptyReq()
    for (const f of FIELDS) {
      const col = colOf.get(norm(f.label))
      ;(r as Record<string, string>)[f.key] = col ? cellText(row.getCell(col).value) : ''
    }
    if (!r.id && !r.statement) continue
    out.push(r)
  }
  return out
}

export async function exportExcel(rows: Req[]) {
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
  a.download = `RTM-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
}
