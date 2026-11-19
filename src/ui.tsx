// Small UUI wrappers used across the app.
import { useMemo } from 'react'
import { useArrayDataSource } from '@epam/uui-core'
import { PickerInput, Badge } from '@epam/uui'
import { severity } from './model'

type Opt = { id: string; name: string }

export function Select(p: { value: string; options: readonly string[]; labels?: Record<string, string>; onChange: (v: string) => void; placeholder?: string; isInvalid?: boolean; isDisabled?: boolean; noClear?: boolean }) {
  const items = useMemo<Opt[]>(() => p.options.map(o => ({ id: o, name: p.labels?.[o] ?? o })), [p.options, p.labels])
  const ds = useArrayDataSource<Opt, string, unknown>({ items }, [items])
  return (
    <PickerInput<Opt, string>
      dataSource={ds} selectionMode="single" valueType="id"
      value={p.value} onValueChange={v => p.onChange(v ?? '')}
      getName={i => i.name} searchPosition="none"
      placeholder={p.placeholder ?? 'Select'} isInvalid={p.isInvalid} isDisabled={p.isDisabled} disableClear={p.noClear}
    />
  )
}

export function MultiSelect(p: { value: string[]; options: readonly string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const items = useMemo<Opt[]>(() => p.options.map(o => ({ id: o, name: o })), [p.options])
  const ds = useArrayDataSource<Opt, string, unknown>({ items }, [items])
  return (
    <PickerInput<Opt, string>
      dataSource={ds} selectionMode="multi" valueType="id"
      value={p.value} onValueChange={v => p.onChange(v ?? [])}
      getName={i => i.name} searchPosition={p.options.length > 8 ? 'input' : 'none'}
      placeholder={p.placeholder} size="30"
    />
  )
}

export function CheckBadge({ check }: { check: string }) {
  const s = severity(check)
  if (s === 'none') return null
  const color = s === 'ok' ? 'success' : s === 'bad' ? 'critical' : 'warning'
  return <Badge size="24" color={color} fill={s === 'ok' ? 'solid' : 'outline'} caption={check} />
}

const STATUS_COLOR: Record<string, 'info' | 'success' | 'warning' | 'critical' | 'neutral'> = {
  'Draft': 'neutral', 'Ready for Review': 'info', 'In Review': 'info', 'Approved': 'success',
  'Rejected': 'critical', 'On Hold': 'warning', 'Obsolete': 'neutral',
  'Not Started': 'neutral', 'In Development': 'info', 'Ready for QA': 'info', 'In QA': 'info', 'Done': 'success',
  'Blocked': 'critical', 'Deferred': 'warning',
  'Not Run': 'neutral', 'Passed': 'success', 'Failed': 'critical', 'Skipped': 'neutral', 'N/A': 'neutral',
  'Critical': 'critical', 'High': 'warning', 'Medium': 'info', 'Low': 'neutral',
}

export function StatusBadge({ value }: { value: string }) {
  if (!value) return null
  return <Badge size="24" fill="outline" color={STATUS_COLOR[value] ?? 'neutral'} caption={value} />
}

export function LinkText({ value }: { value: string }) {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) {
    const short = value.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)
    return <a href={value} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{short}</a>
  }
  return <span>{value}</span>
}
