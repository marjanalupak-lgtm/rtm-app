// Small inline icons for the AI panel (currentColor, decorative unless labelled).
type P = { size?: number }
const svg = (d: React.ReactNode, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>

export const Sparkle = ({ size }: P) => svg(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" fill="currentColor" stroke="none" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" stroke="none" /></>, size)
export const Upload = ({ size }: P) => svg(<><path d="M12 15V4" /><path d="M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>, size)
export const Shield = ({ size }: P) => svg(<><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></>, size)
export const Layers = ({ size }: P) => svg(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>, size)
export const Check = ({ size }: P) => svg(<path d="m5 12 5 5 9-10" />, size)
export const Edit = ({ size }: P) => svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>, size)

const FILE_COLORS: Record<string, string> = { pdf: '#E5484D', doc: '#3E63DD', sheet: '#30A46C', image: '#8E4EC6', text: '#6F6E77' }
export function fileKind(name: string): keyof typeof FILE_COLORS {
  const e = name.toLowerCase().split('.').pop() ?? ''
  if (e === 'pdf') return 'pdf'
  if (e === 'docx') return 'doc'
  if (['xlsx', 'xlsm', 'csv'].includes(e)) return 'sheet'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) return 'image'
  return 'text'
}
export const FileIcon = ({ name, size = 18 }: { name: string; size?: number }) => {
  const k = fileKind(name)
  return (
    <span className="ai-fileicon" style={{ color: FILE_COLORS[k] }}>
      {svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>, size)}
      <span className="ai-fileicon-tag">{k === 'sheet' ? 'XLS' : k === 'doc' ? 'DOC' : k === 'image' ? 'IMG' : k.toUpperCase().slice(0, 3)}</span>
    </span>
  )
}
export const sizeLabel = (b: number) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
export const Bulb = ({ size }: P) => svg(<><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>, size)
export const Question = ({ size }: P) => svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><path d="M12 17.5v.01" /></>, size)
export const Arrow = ({ size }: P) => svg(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>, size)
export const Quote = ({ size }: P) => svg(<><path d="M7 7h4v4c0 3-1.5 5-4 6" /><path d="M14 7h4v4c0 3-1.5 5-4 6" /></>, size)
