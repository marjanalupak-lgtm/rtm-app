import { beforeEach, describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { AiError, clearKey, describe as describe_, explain, getKey, handleResponse, setKey, toAiError } from './client'

const store = new Map<string, string>()
const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
Object.assign(globalThis, { localStorage: fake, sessionStorage: { ...fake, getItem: (k: string) => store.get('s:' + k) ?? null, setItem: (k: string, v: string) => void store.set('s:' + k, v), removeItem: (k: string) => void store.delete('s:' + k) } })
const as = <T extends object>(cls: { prototype: T }, props: object) => Object.assign(Object.create(cls.prototype), props) as T

describe('AI key', () => {
  beforeEach(() => store.clear())
  it('is remembered on this computer by default', () => {
    setKey('sk-1'); expect(getKey()).toBe('sk-1'); expect(store.get('rtm.ai.key')).toBe('sk-1')
  })
  it('lives only in this tab when not remembered', () => {
    setKey('sk-2', false); expect(getKey()).toBe('sk-2'); expect(store.has('rtm.ai.key')).toBe(false)
  })
  it('can be removed', () => { setKey('sk-3'); clearKey(); expect(getKey()).toBeNull() })
})

describe('AI errors', () => {
  it('maps SDK errors to plain kinds', () => {
    expect(toAiError(as(Anthropic.AuthenticationError, { status: 401 })).kind).toBe('bad-key')
    expect(toAiError(as(Anthropic.RateLimitError, { status: 429 })).kind).toBe('busy')
    expect(toAiError(as(Anthropic.APIError, { status: 529 })).kind).toBe('busy')
    expect(toAiError(as(Anthropic.APIError, { status: 413 })).kind).toBe('too-large')
    expect(toAiError(as(Anthropic.APIConnectionError, {})).kind).toBe('network')
    expect(toAiError(as(Anthropic.APIUserAbortError, {})).kind).toBe('cancelled')
    expect(toAiError(new Error('bad-json')).kind).toBe('bad-json')
    expect(toAiError(new AiError('no-key')).kind).toBe('no-key')
  })
  it('every kind has a message', () => {
    for (const k of ['no-key', 'bad-key', 'busy', 'too-large', 'refused', 'too-long', 'bad-json', 'network', 'cancelled', 'other'] as const) expect(explain(k).length).toBeGreaterThan(5)
  })
})

describe('AI response', () => {
  const ok = JSON.stringify({ summary: 's', structure: [], proposals: [], questions: [], nextSteps: [] })
  it('cut-off output is too-long', () => {
    expect(() => handleResponse({ stop_reason: 'max_tokens', stop_details: null, content: [{ type: 'text', text: '{' }] })).toThrow(expect.objectContaining({ kind: 'too-long' }))
  })
  it('a refusal says why', () => {
    expect(() => handleResponse({ stop_reason: 'refusal', stop_details: { explanation: 'policy' }, content: [] })).toThrow(/policy/)
  })
  it('reads the JSON from the text block', () => {
    expect(handleResponse({ stop_reason: 'end_turn', stop_details: null, content: [{ type: 'thinking' }, { type: 'text', text: ok }] }).summary).toBe('s')
  })
})

describe('AI errors — review fixes', () => {
  it('a 400 about size or pages is too-large and keeps the detail', () => {
    const e = toAiError(as(Anthropic.BadRequestError, { status: 400, message: '400 prompt is too long: 1200000 tokens > 1000000 maximum' }))
    expect(e.kind).toBe('too-large'); expect(e.message).toContain('prompt is too long')
    expect(toAiError(as(Anthropic.BadRequestError, { status: 400, message: 'A maximum of 600 PDF pages may be provided.' })).kind).toBe('too-large')
  })
  it('other API errors keep their detail for the user', () => {
    expect(describe_(toAiError(as(Anthropic.NotFoundError, { status: 404, message: 'model: not found' })))).toContain('model: not found')
  })
})
