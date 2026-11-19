// Turn the files a user adds into Claude content blocks: PDFs and images as-is, everything else as text.
import type Anthropic from '@anthropic-ai/sdk'

export type Block = Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam

export const MAX_BYTES = 32 * 1024 * 1024
export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.vtt,.srt,.csv,.json,.docx,.xlsx,.xlsm'

const IMAGE: Record<string, Anthropic.Base64ImageSource['media_type']> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const TEXT = new Set(['txt', 'md', 'vtt', 'srt', 'csv', 'json'])
const ext = (name: string) => name.toLowerCase().split('.').pop() ?? ''

async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const asText = (name: string, text: string): Block => ({ type: 'text', text: `File: ${name}\n${text}` })

export async function fileToBlocks(file: File): Promise<Block[]> {
  const e = ext(file.name)
  if (e === 'pdf') return [{ type: 'document', title: file.name, source: { type: 'base64', media_type: 'application/pdf', data: await base64(file) } }]
  if (IMAGE[e]) return [{ type: 'image', source: { type: 'base64', media_type: IMAGE[e], data: await base64(file) } }]
  if (TEXT.has(e)) return [asText(file.name, await file.text())]
  if (e === 'docx') {
    const { extractRawText } = await import('mammoth')
    return [asText(file.name, (await extractRawText({ arrayBuffer: await file.arrayBuffer() })).value)]
  }
  if (e === 'xlsx' || e === 'xlsm') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', bookVBA: false })
    return [asText(file.name, wb.SheetNames.map(n => `## Sheet ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n'))]
  }
  throw new Error('unsupported:' + file.name)
}

// Name of the file that pushes the request past the 32 MB limit (base64 grows binaries by 4/3), or null.
export function checkSize(files: File[], text: string): string | null {
  let total = text.length + 200_000   // the system prompt with existing requirements
  for (const f of files) {
    const e = ext(f.name)
    total += e === 'pdf' || IMAGE[e] ? Math.ceil(f.size * 4 / 3) : f.size
    if (total > MAX_BYTES) return f.name
  }
  return null
}
