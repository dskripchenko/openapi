/**
 * Low-level encoders shared by the request builder and the snippets:
 * RFC 3986 percent-encoding, cookie-safe encoding and a UTF-8 base64 that
 * works the same in Node and the browser (no `btoa`, no `Buffer`).
 */

const UNRESERVED = /[A-Za-z0-9\-._~]/
/** RFC 3986 gen-delims + sub-delims. `#` is left out on purpose: it would end the query. */
const RESERVED = /[:/?[\]@!$&'()*+,;=]/

const encoder = new TextEncoder()

function hexByte(byte: number): string {
  return '%' + byte.toString(16).toUpperCase().padStart(2, '0')
}

function percentEncodeChar(char: string): string {
  // TextEncoder turns lone surrogates into U+FFFD instead of throwing.
  let out = ''
  for (const byte of encoder.encode(char)) out += hexByte(byte)
  return out
}

/**
 * Percent-encodes everything except RFC 3986 unreserved characters.
 * With `allowReserved` the reserved characters (except `#`) and existing
 * `%XX` triplets are kept as they are.
 */
export function encodeComponent(value: string, allowReserved = false): string {
  let out = ''
  const chars = Array.from(value)
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!
    if (UNRESERVED.test(char)) {
      out += char
    } else if (allowReserved && RESERVED.test(char)) {
      out += char
    } else if (
      allowReserved &&
      char === '%' &&
      /^[0-9A-Fa-f]$/.test(chars[i + 1] ?? '') &&
      /^[0-9A-Fa-f]$/.test(chars[i + 2] ?? '')
    ) {
      out += char
    } else {
      out += percentEncodeChar(char)
    }
  }
  return out
}

/**
 * Encodes a cookie value: only characters outside RFC 6265 `cookie-octet`
 * (controls, whitespace, `"`, `,`, `;`, `\`, non-ASCII) are percent-encoded.
 */
export function encodeCookie(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0)!
    const ok =
      code === 0x21 ||
      (code >= 0x23 && code <= 0x2b) ||
      (code >= 0x2d && code <= 0x3a) ||
      (code >= 0x3c && code <= 0x5b) ||
      (code >= 0x5d && code <= 0x7e)
    out += ok && char !== '%' ? char : percentEncodeChar(char)
  }
  return out
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard base64 (with padding) of the UTF-8 bytes of `value`. */
export function base64Utf8(value: string): string {
  const bytes = encoder.encode(value)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]!
    out += b === undefined ? '=' : BASE64[(n >> 6) & 63]!
    out += c === undefined ? '=' : BASE64[n & 63]!
  }
  return out
}

/** `application/json; charset=utf-8` → `application/json`. */
export function baseMediaType(mediaType: string): string {
  return (mediaType.split(';')[0] ?? '').trim().toLowerCase()
}

export function isJsonMediaType(mediaType: string): boolean {
  const base = baseMediaType(mediaType)
  return base === 'application/json' || base.endsWith('+json') || base.endsWith('/json')
}

export function isFormUrlEncoded(mediaType: string): boolean {
  return baseMediaType(mediaType) === 'application/x-www-form-urlencoded'
}

export function isMultipart(mediaType: string): boolean {
  return baseMediaType(mediaType).startsWith('multipart/')
}

/**
 * True for media types read as text: `text/*`, JSON, XML, YAML, JavaScript,
 * form data and the like. An empty type counts as text (servers omit it on
 * plain answers); everything else (images, PDFs, octet streams) is bytes.
 */
export function isTextualMediaType(mediaType: string): boolean {
  const base = baseMediaType(mediaType)
  if (base === '' || base.startsWith('text/')) return true
  if (isJsonMediaType(base) || isFormUrlEncoded(base)) return true
  return /[/+](xml|yaml|x-yaml|javascript|ecmascript|x-ndjson|ndjson|graphql|csv)$/.test(base)
}
