import type { SecurityScheme } from '../core/types'
import { base64Utf8, encodeComponent, encodeCookie } from './encode'

export interface BasicCredentials {
  username: string
  password: string
}

/** A security scheme with the value the user entered for it. */
export interface AppliedSecurity {
  scheme: SecurityScheme
  /** API key, token, or basic credentials (`'user:pass'` is accepted too). */
  value: string | BasicCredentials
}

export interface SecurityParts {
  headers: [string, string][]
  /** Encoded query pairs. */
  query: [string, string][]
  /** Encoded cookie pairs. */
  cookies: [string, string][]
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** `Authorization: Basic …` value for the credentials. */
export function basicAuth(username: string, password: string): string {
  return 'Basic ' + base64Utf8(username + ':' + password)
}

/** Turns applied schemes into headers, query pairs and cookies. Empty values are skipped. */
export function applySecurity(list: AppliedSecurity[] = []): SecurityParts {
  const parts: SecurityParts = { headers: [], query: [], cookies: [] }
  for (const { scheme, value } of list) {
    if (typeof value === 'string' ? value === '' : !value.username && !value.password) continue
    const text = typeof value === 'string' ? value : value.username + ':' + value.password
    switch (scheme.type) {
      case 'apiKey': {
        const name = scheme.name ?? ''
        if (!name) break
        if (scheme.in === 'query') parts.query.push([encodeComponent(name), encodeComponent(text)])
        else if (scheme.in === 'cookie')
          parts.cookies.push([encodeCookie(name), encodeCookie(text)])
        else parts.headers.push([name, text])
        break
      }
      case 'http': {
        const name = (scheme.scheme ?? 'bearer').toLowerCase()
        if (name === 'basic') parts.headers.push(['Authorization', 'Basic ' + base64Utf8(text)])
        else if (name === 'bearer') parts.headers.push(['Authorization', 'Bearer ' + text])
        else parts.headers.push(['Authorization', capitalize(scheme.scheme ?? '') + ' ' + text])
        break
      }
      case 'oauth2':
      case 'openIdConnect':
        parts.headers.push(['Authorization', 'Bearer ' + text])
        break
      // mutualTLS is a transport concern: nothing to add.
    }
  }
  return parts
}
