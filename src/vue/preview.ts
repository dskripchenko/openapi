/**
 * "What will be sent": the request's headers as the preview shows them, with
 * credentials masked.
 */
import type { HttpRequest, SecurityScheme } from '../core/types'

/** Headers that carry credentials whatever the spec says. */
const SECRET_HEADERS = ['authorization', 'proxy-authorization']

/** The header names (lower case) to mask: Authorization and the spec's API key headers. */
export function secretHeaderNames(schemes: (SecurityScheme | undefined)[]): Set<string> {
  const names = new Set(SECRET_HEADERS)
  for (const s of schemes) if (s?.type === 'apiKey' && s.in === 'header' && s.name) names.add(s.name.toLowerCase())
  return names
}

/** A secret as `Bearer ••••abcd`: the scheme word stays, only the last 4 characters of a long value show. */
export function maskSecret(value: string): string {
  const m = /^([A-Za-z][\w-]*)\s+(\S.*)$/.exec(value)
  const [prefix, secret] = m && /^(bearer|basic|digest|token|dpop|mac|hoba|negotiate)$/i.test(m[1]!) ? [`${m[1]} `, m[2]!] : ['', value]
  return `${prefix}••••${secret.length > 8 ? secret.slice(-4) : ''}`
}

/**
 * The headers of a request for the preview: secrets masked. A multipart body
 * shows the Content-Type the HTTP client will add, boundary elided.
 */
export function previewHeaders(request: HttpRequest, secrets: Set<string>): [string, string][] {
  const out = request.headers.map(([k, v]): [string, string] => [k, secrets.has(k.toLowerCase()) ? maskSecret(v) : v])
  const type = request.body?.mediaType
  if (type && /^multipart\//i.test(type) && !out.some(([k]) => k.toLowerCase() === 'content-type'))
    out.push(['Content-Type', `${type.split(';')[0]}; boundary=…`])
  return out
}
