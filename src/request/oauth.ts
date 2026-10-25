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
  const doFetch = options.fetch ?? globalThis.fetch
  const form = new URLSearchParams()
  form.set('grant_type', flow === 'password' ? 'password' : 'client_credentials')
  if (flow === 'password') {
    form.set('username', options.username ?? '')
    form.set('password', options.password ?? '')
  }
  if (options.scopes?.length) form.set('scope', options.scopes.join(' '))

  const headers: [string, string][] = [
    ['Content-Type', 'application/x-www-form-urlencoded'],
    ['Accept', 'application/json'],
  ]
  if (options.clientSecret) {
    const credentials = formEncode(options.clientId) + ':' + formEncode(options.clientSecret)
    headers.push(['Authorization', 'Basic ' + base64Utf8(credentials)])
  } else {
    form.set('client_id', options.clientId)
  }

  const init: RequestInit = { method: 'POST', headers, body: form.toString() }
  if (options.signal) init.signal = options.signal
  const response = await doFetch(options.tokenUrl, init)
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
  const expires = typeof data.expires_in === 'string' ? Number(data.expires_in) : data.expires_in
  if (typeof expires === 'number' && Number.isFinite(expires)) token.expiresIn = expires
  return token
}
