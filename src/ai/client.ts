// Calls Claude from the browser with the user's own key. The key never leaves this browser except to Anthropic.
import Anthropic from '@anthropic-ai/sdk'
import type { Req } from '../model'
import type { Config } from '../config'
import { buildSystemPrompt, parseResult, RESULT_SCHEMA, type AiResult } from './prompt'
import type { Block } from './inputs'

export const MODEL = 'claude-opus-5-5'
const KEY = 'rtm.ai.key'

// ---- key: localStorage when remembered on this computer, otherwise sessionStorage (this tab only) ----
const safe = <T,>(f: () => T, d: T): T => { try { return f() } catch { return d } }
export const getKey = (): string | null => safe(() => sessionStorage.getItem(KEY) || localStorage.getItem(KEY), null)
export const isRemembered = (): boolean => safe(() => !!localStorage.getItem(KEY), false)
export function setKey(k: string, remember = true) {
  clearKey()
  safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, k.trim()), undefined)
}
export function clearKey() {
  safe(() => { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY) }, undefined)
}

// ---- errors ----
export type AiErrorKind = 'no-key' | 'bad-key' | 'busy' | 'too-large' | 'refused' | 'too-long' | 'bad-json' | 'network' | 'cancelled' | 'other'
export class AiError extends Error {
  kind: AiErrorKind
  constructor(kind: AiErrorKind, detail = '') { super(detail || kind); this.kind = kind }
}
const TEXT: Record<AiErrorKind, string> = {
  'no-key': 'Add your Anthropic API key in Settings › AI first.',
  'bad-key': 'The API key was not accepted. Check it in Settings › AI.',
  'busy': 'Claude is busy or the rate limit was reached. Try again in a minute.',
  'too-large': 'The input is too large. Remove a file or split it.',
  'refused': 'Claude declined this request.',
  'too-long': 'The result was too long. Split the input into smaller parts and try again.',
  'bad-json': 'Claude returned a result the app could not read. Try again.',
  'network': 'Could not reach Claude. Check your internet connection.',
  'cancelled': 'Cancelled.',
  'other': 'Something went wrong.',
}
export const explain = (k: AiErrorKind) => TEXT[k]
// Message for the user: the plain explanation plus the API's own detail when it helps.
export const describe = (e: AiError) => explain(e.kind) + (['other', 'too-large', 'refused'].includes(e.kind) && e.message !== e.kind ? ` (${e.message})` : '')

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('cancelled')
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network')
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('bad-key')
  if (e instanceof Anthropic.RateLimitError) return new AiError('busy')
  if (e instanceof Anthropic.APIError) {
    if (e.status === 413) return new AiError('too-large')
    if (e.status === 400 && /too long|too large|exceed|maximum|pages/i.test(e.message)) return new AiError('too-large', e.message)
    if (e.status === 529 || (e.status ?? 0) >= 500) return new AiError('busy')
    return new AiError('other', e.message)
  }
  if (e instanceof Error && e.message === 'bad-json') return new AiError('bad-json')
  return new AiError('other', e instanceof Error ? e.message : String(e))
}

// ---- response ----
type MinimalMessage = { stop_reason: string | null; stop_details: { explanation?: string | null } | null; content: { type: string; text?: string }[] }
export function handleResponse(msg: MinimalMessage): AiResult {
  if (msg.stop_reason === 'refusal') throw new AiError('refused', msg.stop_details?.explanation || '')
  if (msg.stop_reason === 'max_tokens') throw new AiError('too-long')
  const text = msg.content.find(b => b.type === 'text')?.text ?? ''
  return parseResult(text)
}

const client = (key: string) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })

export async function runIntake(a: { rows: Req[]; cfg: Config; text: string; blocks: Block[]; signal?: AbortSignal }): Promise<AiResult> {
  const key = getKey()
  if (!key) throw new AiError('no-key')
  try {
    const content: Block[] = [...a.blocks]
    if (a.text.trim()) content.push({ type: 'text', text: a.text.trim() })
    const stream = client(key).beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      system: [{ type: 'text', text: buildSystemPrompt(a.rows, a.cfg), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    }, { signal: a.signal })
    return handleResponse(await stream.finalMessage())
  } catch (e) { throw toAiError(e) }
}

// Cheap check that a key works (no tokens used).
export async function testKey(key: string): Promise<void> {
  try { await client(key).models.retrieve(MODEL) } catch (e) { throw toAiError(e) }
}
