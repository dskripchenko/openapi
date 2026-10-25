/**
 * Keeping the credentials between visits (opt-in `persistCredentials`).
 * Per spec, under a key made of the spec id and the document title, in
 * sessionStorage or localStorage. Kept: API keys, bearer and OAuth access
 * tokens (with their expiry) and basic-auth usernames. Never kept: basic-auth
 * passwords and anything else typed into the OAuth forms (client secrets,
 * resource owner passwords) — those never reach the credentials at all.
 * Storage may be missing or refuse writes: every access is guarded.
 */
import { reactive, watch } from 'vue'
import type { SecurityScheme } from '../core/types'
import type { BasicCredentials } from '../request/security'
import type { ReferenceContext } from './context'

export type PersistMode = 'session' | 'local'

/** The prop's value as a storage choice: `true` means sessionStorage. */
export function persistMode(value: boolean | PersistMode | undefined): PersistMode | null {
  return value === true ? 'session' : value === 'session' || value === 'local' ? value : null
}

export function credentialsKey(specId: string, title: string): string {
  return `dsk-openapi:credentials:${specId}:${title}`
}

/** What goes into storage: values by scheme name, and token expiry (epoch ms). */
export interface StoredCredentials {
  credentials: Record<string, string | { username: string }>
  expiry: Record<string, number>
}

function storage(mode: PersistMode): Storage | null {
  try {
    return mode === 'local' ? globalThis.localStorage : globalThis.sessionStorage
  } catch {
    return null
  }
}

/** The part of the credentials that may be stored, by the scheme each belongs to. */
export function persistable(
  credentials: Record<string, string | BasicCredentials>,
  expiry: Record<string, number>,
  schemes: Record<string, SecurityScheme | undefined>,
): StoredCredentials {
  const out: StoredCredentials = { credentials: {}, expiry: {} }
  for (const [name, value] of Object.entries(credentials)) {
    const scheme = schemes[name]
    if (!scheme) continue
    if (typeof value === 'object') {
      // Basic auth: the username only.
      if (value.username) out.credentials[name] = { username: value.username }
    } else if (value) {
      out.credentials[name] = value
      if (typeof expiry[name] === 'number') out.expiry[name] = expiry[name]
    }
  }
  return out
}

export function readCredentials(mode: PersistMode, key: string): StoredCredentials | null {
  try {
    const raw = storage(mode)?.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<StoredCredentials>
    if (!data || typeof data.credentials !== 'object' || !data.credentials) return null
    return { credentials: data.credentials, expiry: data.expiry && typeof data.expiry === 'object' ? data.expiry : {} }
  } catch {
    return null
  }
}

/** Writes the stored part; removes the entry when nothing is left to keep. */
export function writeCredentials(mode: PersistMode, key: string, stored: StoredCredentials): void {
  try {
    const s = storage(mode)
    if (!s) return
    if (Object.keys(stored.credentials).length) s.setItem(key, JSON.stringify(stored))
    else s.removeItem(key)
  } catch {
    // Full or blocked storage: the credentials stay in memory only.
  }
}

export function removeCredentials(mode: PersistMode, key: string): void {
  try {
    storage(mode)?.removeItem(key)
  } catch {
    // Nothing to remove.
  }
}

/**
 * Restores the open spec's stored credentials when its key appears (on load
 * and on a spec switch) and stores every change. Values already in memory win
 * over stored ones; expired tokens are dropped. `key` is null while no spec
 * is open, or while the open one is still loading.
 */
export function usePersistedCredentials(
  ctx: ReferenceContext,
  mode: () => PersistMode | null,
  key: () => string | null,
): { forget: () => void } {
  const schemes = (): Record<string, SecurityScheme | undefined> => {
    const spec = ctx.spec.value
    return Object.fromEntries(
      Object.entries(spec?.document.components?.securitySchemes ?? {}).map(([n, s]) => [n, spec.resolver.deref(s) as SecurityScheme | undefined]),
    )
  }
  let last: string | null = null

  function restore(m: PersistMode, k: string): void {
    const stored = readCredentials(m, k)
    if (!stored) return
    const now = Date.now()
    for (const [name, value] of Object.entries(stored.credentials)) {
      const current = ctx.credentials[name]
      const empty = current === undefined || current === '' || (typeof current === 'object' && !current.username && !current.password)
      if (!empty) continue
      const expires = stored.expiry[name]
      if (typeof value === 'string') {
        if (typeof expires === 'number' && expires <= now) continue
        ctx.credentials[name] = value
        if (typeof expires === 'number') ctx.tokenExpiry[name] = expires
      } else if (value && typeof value.username === 'string') {
        ctx.credentials[name] = reactive({ username: value.username, password: '' })
      }
    }
  }

  watch(
    () => [mode(), key(), JSON.stringify(ctx.credentials), JSON.stringify(ctx.tokenExpiry)] as const,
    ([m, k]) => {
      if (!m || !k) {
        last = null
        return
      }
      if (k !== last) {
        last = k
        restore(m, k)
      }
      writeCredentials(m, k, persistable(ctx.credentials, ctx.tokenExpiry, schemes()))
    },
    { immediate: true },
  )

  return {
    forget(): void {
      for (const name of Object.keys(ctx.credentials)) delete ctx.credentials[name]
      for (const name of Object.keys(ctx.tokenExpiry)) delete ctx.tokenExpiry[name]
      const m = mode()
      const k = key()
      if (m && k) removeCredentials(m, k)
    },
  }
}
