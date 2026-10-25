import { base64Utf8 } from './encode'

export interface OAuthTokenOptions {
  tokenUrl: string
  clientId: string
  clientSecret?: string
  /** Resource owner credentials, for the `password` flow. */
  username?: string
  password?: string
  scopes?: string[]
  fetch?: typeof fetch
  signal?: AbortSignal
}

export interface OAuthToken {
  accessToken: string
  tokenType?: string
  expiresIn?: number
}

const FORM_HEADERS: [string, string][] = [
  ['Content-Type', 'application/x-www-form-urlencoded'],
  ['Accept', 'application/json'],
]

/** RFC 6749 §2.3.1: id and secret are form-urlencoded before going into Basic. */
function formEncode(value: string): string {
  return new URLSearchParams([['', value]]).toString().slice(1)
}

/**
 * Requests a token from the token endpoint (RFC 6749 §4.3 password, §4.4
 * client credentials). With a client secret the client authenticates with
 * HTTP Basic; without one `client_id` goes into the form body.
 * Rejects with the server's `error_description`/`error` on failure.
 */
export async function fetchOAuthToken(
  flow: 'clientCredentials' | 'password',
  options: OAuthTokenOptions,
): Promise<OAuthToken> {
  const form = new URLSearchParams()
  form.set('grant_type', flow === 'password' ? 'password' : 'client_credentials')
  if (flow === 'password') {
    form.set('username', options.username ?? '')
    form.set('password', options.password ?? '')
  }
  if (options.scopes?.length) form.set('scope', options.scopes.join(' '))

  const headers = [...FORM_HEADERS]
  if (options.clientSecret) {
    const credentials = formEncode(options.clientId) + ':' + formEncode(options.clientSecret)
    headers.push(['Authorization', 'Basic ' + base64Utf8(credentials)])
  } else {
    form.set('client_id', options.clientId)
  }
  return postToken(options.tokenUrl, form, headers, options.fetch ?? globalThis.fetch, options.signal)
}

/** Posts the form to the token endpoint and reads the token, or the reason the server gave none. */
async function postToken(
  tokenUrl: string,
  form: URLSearchParams,
  headers: [string, string][],
  doFetch: typeof fetch,
  signal?: AbortSignal,
): Promise<OAuthToken> {
  const init: RequestInit = { method: 'POST', headers, body: form.toString() }
  if (signal) init.signal = signal
  const response = await doFetch(tokenUrl, init)
  const text = await response.text()
  let data: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
  } catch {
    // Not JSON: handled below.
  }
  if (!response.ok || typeof data.access_token !== 'string') {
    const reason =
      (typeof data.error_description === 'string' && data.error_description) ||
      (typeof data.error === 'string' && data.error) ||
      `HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`
    throw new Error(`Token request failed: ${reason}`)
  }
  const token: OAuthToken = { accessToken: data.access_token }
  if (typeof data.token_type === 'string') token.tokenType = data.token_type
  const expires = toSeconds(data.expires_in)
  if (expires !== undefined) token.expiresIn = expires
  return token
}

function toSeconds(value: unknown): number | undefined {
  const n = typeof value === 'string' && value !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/* ------------------------- browser-based flows -------------------------- */

/** Base64url without padding (RFC 4648 §5), as PKCE and OAuth state use it. */
export function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A random URL-safe string made of `bytes` random bytes (Web Crypto). */
export function randomToken(bytes = 32): string {
  return base64Url(globalThis.crypto.getRandomValues(new Uint8Array(bytes)))
}

/** A PKCE code verifier (RFC 7636 §4.1): 43 characters from 32 random bytes. */
export function createCodeVerifier(): string {
  return randomToken(32)
}

/** The S256 code challenge of a verifier (RFC 7636 §4.2): base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export interface AuthorizeUrlOptions {
  authorizationUrl: string
  /** `code` for the authorization code flow, `token` for the implicit one. */
  responseType: 'code' | 'token'
  clientId: string
  redirectUri: string
  scopes?: string[]
  state: string
  /** The S256 challenge; sent with `code_challenge_method=S256`. */
  codeChallenge?: string
}

/** The authorization request URL (RFC 6749 §4.1.1, §4.2.1). A query already in the URL is kept. */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const url = new URL(options.authorizationUrl)
  const q = url.searchParams
  q.set('response_type', options.responseType)
  q.set('client_id', options.clientId)
  q.set('redirect_uri', options.redirectUri)
  if (options.scopes?.length) q.set('scope', options.scopes.join(' '))
  q.set('state', options.state)
  if (options.codeChallenge) {
    q.set('code_challenge', options.codeChallenge)
    q.set('code_challenge_method', 'S256')
  }
  return url.toString()
}

/** What the authorization server put on the redirect URI. */
export interface OAuthCallback {
  state?: string
  code?: string
  accessToken?: string
  tokenType?: string
  expiresIn?: number
  error?: string
  errorDescription?: string
}

/**
 * Reads the authorization response from a redirect URL: the query for the
 * code flow, the fragment for the implicit one (both are read, the query
 * wins). Returns null when the URL carries no OAuth response.
 */
export function parseCallbackUrl(url: string): OAuthCallback | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const params = new URLSearchParams(parsed.search)
  new URLSearchParams(parsed.hash.replace(/^#/, '')).forEach((v, k) => {
    if (!params.has(k)) params.set(k, v)
  })
  const get = (k: string): string | undefined => params.get(k) ?? undefined
  if (!get('code') && !get('access_token') && !get('error')) return null
  const result: OAuthCallback = {}
  const fields: [keyof OAuthCallback, string | number | undefined][] = [
    ['state', get('state')],
    ['code', get('code')],
    ['accessToken', get('access_token')],
    ['tokenType', get('token_type')],
    ['expiresIn', toSeconds(get('expires_in'))],
    ['error', get('error')],
    ['errorDescription', get('error_description')],
  ]
  for (const [key, value] of fields) if (value !== undefined) (result as Record<string, unknown>)[key] = value
  return result
}

export interface CodeExchangeOptions {
  tokenUrl: string
  code: string
  redirectUri: string
  clientId: string
  /** Sent in the form when given; a public client leaves it out and relies on PKCE. */
  clientSecret?: string
  codeVerifier?: string
  fetch?: typeof fetch
  signal?: AbortSignal
}

/** Exchanges an authorization code for a token (RFC 6749 §4.1.3, RFC 7636 §4.5). */
export async function exchangeAuthorizationCode(options: CodeExchangeOptions): Promise<OAuthToken> {
  const form = new URLSearchParams()
  form.set('grant_type', 'authorization_code')
  form.set('code', options.code)
  form.set('redirect_uri', options.redirectUri)
  form.set('client_id', options.clientId)
  if (options.codeVerifier) form.set('code_verifier', options.codeVerifier)
  if (options.clientSecret) form.set('client_secret', options.clientSecret)
  return postToken(options.tokenUrl, form, [...FORM_HEADERS], options.fetch ?? globalThis.fetch, options.signal)
}

/** The parts of an OpenID Connect discovery document the auth panel uses. */
export interface OpenIdConfiguration {
  authorizationEndpoint?: string
  tokenEndpoint?: string
  scopesSupported: string[]
  responseTypesSupported: string[]
  grantTypesSupported: string[]
}

/** Fetches and reads an OpenID Connect discovery document (`/.well-known/openid-configuration`). */
export async function fetchOpenIdConfiguration(
  url: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<OpenIdConfiguration> {
  const init: RequestInit = { method: 'GET', headers: [['Accept', 'application/json']] }
  if (options.signal) init.signal = options.signal
  const response = await (options.fetch ?? globalThis.fetch)(url, init)
  if (!response.ok) {
    throw new Error(`Discovery failed: HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`)
  }
  let data: unknown
  try {
    data = JSON.parse(await response.text())
  } catch {
    // Not JSON: handled below.
  }
  if (!data || typeof data !== 'object') throw new Error('Discovery failed: the document is not a JSON object')
  const d = data as Record<string, unknown>
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const config: OpenIdConfiguration = {
    scopesSupported: list(d.scopes_supported),
    responseTypesSupported: list(d.response_types_supported),
    grantTypesSupported: list(d.grant_types_supported),
  }
  if (typeof d.authorization_endpoint === 'string') config.authorizationEndpoint = d.authorization_endpoint
  if (typeof d.token_endpoint === 'string') config.tokenEndpoint = d.token_endpoint
  return config
}
