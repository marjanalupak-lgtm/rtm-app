import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook } from './import'

function book(withComment: boolean) {
  const rows = [
    ['Requirements Traceability Matrix (RTM)'],
    [],
    ['Requirement ID*', 'Date Added*', 'User Story / Requirement*', 'Priority*', 'Test Case ID / Link†'],
    ['REQ-001', new Date('2023-06-01T00:00:00Z'), 'As a user I log in', 'High', 'TC-1'],
    [],
    ['REQ-002', '', 'Second', 'Low', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })
  ws['E4'].l = { Target: 'https://jira.example.com/TC-1' }
  if (withComment) ws['A4'].c = [{ a: 'me', t: 'reviewer note' }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Guide']]), 'Guide')
  XLSX.utils.book_append_sheet(wb, ws, 'RTM')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseWorkbook', () => {
  it('reads RTM sheet even with cell comments', () => {
    const rows = parseWorkbook(book(true))
    expect(rows.map(r => r.id)).toEqual(['REQ-001', 'REQ-002'])
    expect(rows[0].date_added).toBe('2023-06-01')
    expect(rows[0].statement).toBe('As a user I log in')
    expect(rows[0].test_case).toBe('https://jira.example.com/TC-1')
  })
  it('fails clearly when no header', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b']]), 'S')
    expect(() => parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))).toThrow(/Requirement ID/)
  })
})
