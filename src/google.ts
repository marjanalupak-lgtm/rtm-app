// Google sign-in (Google Identity Services, token model) + Drive / Sheets REST helpers + Picker.
// Data goes straight from the browser to the user's Google Drive — there is no server in between.

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined     // Picker only (public, site-restricted)
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined       // Cloud project number (Picker)
// drive.file = only files this app created or the user opened with it. No access to the rest of Drive.
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile'

export class AuthError extends Error { constructor() { super('Your Google session expired. Please sign in again.') } }

type TokenResp = { access_token?: string; expires_in?: number; error?: string }
type TokenClient = { requestAccessToken: (o?: { prompt?: string; hint?: string }) => void; callback: (r: TokenResp) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: object) => TokenClient; revoke: (t: string, cb?: () => void) => void } }; picker?: any } // eslint-disable-line @typescript-eslint/no-explicit-any
    gapi?: { load: (n: string, cb: () => void) => void }
  }
}

const TK = 'rtm.gtoken'
let token: { value: string; exp: number; email: string } | null = (() => {
  try { const t = JSON.parse(sessionStorage.getItem(TK) ?? 'null'); return t && t.exp > Date.now() + 60_000 ? t : null } catch { return null }
})()
const listeners = new Set<(email: string | null) => void>()
export const onAuthChange = (fn: (email: string | null) => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const emit = () => listeners.forEach(f => f(token?.email ?? null))
export const currentEmail = () => token?.email ?? null

const scripts: Record<string, Promise<void>> = {}
function loadScript(src: string): Promise<void> {
  return scripts[src] ??= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s)
  })
}

let client: TokenClient | null = null
export async function signIn(hint?: string): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google client ID is not configured.')
  await loadScript('https://accounts.google.com/gsi/client')
  const resp = await new Promise<TokenResp>((resolve) => {
    client = window.google!.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: resolve, error_callback: (e: { type: string }) => resolve({ error: e.type }) })
    client.requestAccessToken({ prompt: token ? '' : 'select_account', hint })
  })
  if (!resp.access_token) throw new Error(resp.error === 'popup_closed' ? 'Sign-in window was closed.' : 'Google sign-in failed: ' + (resp.error ?? 'unknown'))
  const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + resp.access_token } }).then(r => r.json())
  token = { value: resp.access_token, exp: Date.now() + (resp.expires_in ?? 3600) * 1000, email: String(info.email ?? '').toLowerCase() }
  try { sessionStorage.setItem(TK, JSON.stringify(token)) } catch { /* ignore */ }
  emit()
  return token.email
}

export function signOut() {
  if (token) window.google?.accounts.oauth2.revoke(token.value)
  token = null
  try { sessionStorage.removeItem(TK) } catch { /* ignore */ }
  emit()
}

function expire() { token = null; try { sessionStorage.removeItem(TK) } catch { /* ignore */ } emit() }

export async function api<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  if (!token || token.exp < Date.now()) { expire(); throw new AuthError() }
  const res = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + token.value, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } })
  if (res.status === 401) { expire(); throw new AuthError() }
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error?.message ?? msg } catch { /* ignore */ }
    throw new Error(`Google ${res.status}: ${msg}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const DRIVE = 'https://www.googleapis.com/drive/v3/files'
export const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
export const q = (o: Record<string, string | number | boolean>) => '?' + new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString()

// Google Picker: lets a user open a project spreadsheet someone shared with them (grants this app access to it).
export async function pickSpreadsheet(): Promise<{ id: string; name: string } | null> {
  if (!API_KEY || !APP_ID) throw new Error('Google Picker is not configured.')
  if (!token) throw new AuthError()
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>(r => window.gapi!.load('picker', r))
  const g = window.google!.picker
  return new Promise(resolve => {
    const view = new g.DocsView(g.ViewId.SPREADSHEETS).setMimeTypes('application/vnd.google-apps.spreadsheet').setIncludeFolders(false).setOwnedByMe(false)
    const picker = new g.PickerBuilder()
      .setTitle('Open an RTM project shared with you')
      .addView(view).addView(new g.DocsView(g.ViewId.SPREADSHEETS))
      .setOAuthToken(token!.value).setDeveloperKey(API_KEY).setAppId(APP_ID)
      .setCallback((d: { action: string; docs?: { id: string; name: string }[] }) => {
        if (d.action === g.Action.PICKED && d.docs?.[0]) resolve({ id: d.docs[0].id, name: d.docs[0].name })
        else if (d.action === g.Action.CANCEL) resolve(null)
      })
      .build()
    picker.setVisible(true)
  })
}
