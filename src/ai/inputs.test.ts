import { describe, expect, it } from 'vitest'
import { checkSize, fileToBlocks } from './inputs'

const f = (name: string, body: string | Uint8Array<ArrayBuffer>, type = '') => new File([body], name, { type })

describe('AI inputs', () => {
  it('text files become one text block named after the file', async () => {
    const b = await fileToBlocks(f('notes.txt', 'Hello'))
    expect(b).toEqual([{ type: 'text', text: 'File: notes.txt\nHello' }])
  })
  it('transcripts (.vtt) are read as text', async () => {
    const b = await fileToBlocks(f('call.vtt', 'WEBVTT\n\n00:01 Anna: we need SSO'))
    expect(b[0].type).toBe('text')
    expect((b[0] as { text: string }).text).toContain('we need SSO')
  })
  it('PDFs become a base64 document block', async () => {
    const b = await fileToBlocks(f('rfp.pdf', 'abc', 'application/pdf'))
    expect(b[0]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'YWJj' } })
  })
  it('images become a base64 image block', async () => {
    const b = await fileToBlocks(f('board.png', 'abc', 'image/png'))
    expect(b[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'YWJj' } })
  })
  it('unknown types are refused with the file name', async () => {
    await expect(fileToBlocks(f('a.exe', 'x'))).rejects.toThrow('unsupported:a.exe')
  })
  it('names the file that pushes the request over 32 MB', () => {
    expect(checkSize([f('small.pdf', new Uint8Array(1000)), f('big.pdf', new Uint8Array(26e6))], 'hi')).toBe('big.pdf')
    expect(checkSize([f('small.pdf', new Uint8Array(1000))], 'hi')).toBeNull()
  })
})
