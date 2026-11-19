// Import requirements from an RTM workbook (.xlsx / .xlsm).
// Finds the sheet + header row that contains "Requirement ID" and maps columns by header name.
import * as XLSX from 'xlsx'
import { FIELDS, emptyReq, type Req } from './model'
import { defaultConfig, type Config } from './config'

const norm = (s: string) => s.toLowerCase().replace(/[*†]/g, '').replace(/\s+/g, ' ').trim()

function cellText(c: XLSX.CellObject | undefined): string {
  if (!c) return ''
  if (c.l?.Target && !c.l.Target.startsWith('#')) return c.l.Target      // hyperlink → keep the URL
  if (c.v instanceof Date) return c.v.toISOString().slice(0, 10)
  if (c.t === 'e') return ''                                               // #N/A, #REF! etc.
  return String(c.v ?? '').trim()
}

export function parseWorkbook(data: ArrayBuffer, cfg: Config = defaultConfig()): Req[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false, bookVBA: false })
  const names = [...wb.SheetNames].sort((a, b) => (b === 'RTM' ? 1 : 0) - (a === 'RTM' ? 1 : 0))  // "RTM" first
  for (const name of names) {
    if (/^(versions|history|meta)$/i.test(name)) continue   // app's own sheets, never requirements
    const ws = wb.Sheets[name]
    if (!ws['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])
    const at = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
    // Header row = first row (within the top 30) having a "Requirement ID" cell.
    let header = -1
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 30) && header < 0; r++)
      for (let c = range.s.c; c <= range.e.c; c++) if (norm(cellText(at(r, c))) === 'requirement id') { header = r; break }
    if (header < 0) continue
    const colOf = new Map<string, number>()
    for (let c = range.s.c; c <= range.e.c; c++) { const h = norm(cellText(at(header, c))); if (h && !colOf.has(h)) colOf.set(h, c) }
    const out: Req[] = []
    for (let r = header + 1; r <= range.e.r; r++) {
      const req = emptyReq()
      for (const f of FIELDS) {
        const c = colOf.get(norm(cfg.fields[f.key].label)) ?? colOf.get(norm(f.label))   // project label or template label
        ;(req as unknown as Record<string, string>)[f.key] = c === undefined ? '' : cellText(at(r, c))
      }
      for (const cf of cfg.custom) {
        const c = colOf.get(norm(cf.label))
        const v = c === undefined ? '' : cellText(at(r, c))
        if (v) req.extra = { ...(req.extra ?? {}), [cf.key]: v }
      }
      if (!req.id && !req.statement) continue
      out.push(req)
    }
    return out
  }
  throw new Error('No sheet with a "Requirement ID" header was found.')
}

export async function importExcel(file: File, cfg?: Config): Promise<Req[]> {
  return parseWorkbook(await file.arrayBuffer(), cfg)
}
