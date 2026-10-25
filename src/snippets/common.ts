/**
 * Shared helpers for the snippet generators: request analysis, string
 * escaping per language and JSON → native literal rendering.
 */

import type { HttpRequest } from '../core/types'
import { baseMediaType, isFormUrlEncoded, isJsonMediaType, isMultipart } from '../request/encode'

export interface FileField {
  filename: string
  contentType?: string
  /** Inline text content, when the request carries it. */
  data?: string
}

export type MultipartField = { name: string; value: string } | { name: string; file: FileField }

export type SnippetBody =
  | { kind: 'none' }
  /** `value` is set when the JSON can be printed as a native literal without loss. */
  | { kind: 'json'; text: string; mediaType: string; value?: unknown }
  | { kind: 'text'; text: string; mediaType: string }
  | { kind: 'urlencoded'; fields: [string, string][]; mediaType: string }
  | { kind: 'multipart'; fields: MultipartField[]; mediaType: string }
  /** A binary body: the file named `filename` is sent as it is. */
  | { kind: 'file'; filename: string; mediaType: string }

export interface Prepared {
  method: string
  url: string
  /** Request headers in order (Content-Type included when present). */
  headers: [string, string][]
  /** Content-Type to declare: the header if present, else the body media type. */
  contentType?: string
  body: SnippetBody
}

export function prepare(request: HttpRequest): Prepared {
  const method = request.method.toUpperCase()
  const body = analyzeBody(request)
  // Multipart Content-Type carries the boundary: the client must set it.
  const headers =
    body.kind === 'multipart' ? withoutHeaders(request.headers, 'Content-Type') : request.headers
  const header = headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1]
  const prepared: Prepared = { method, url: request.url, headers, body }
  const contentType =
    header ?? (body.kind === 'none' || body.kind === 'multipart' ? undefined : body.mediaType)
  if (contentType !== undefined) prepared.contentType = contentType
  return prepared
}

function analyzeBody(request: HttpRequest): SnippetBody {
  const body = request.body
  if (!body) return { kind: 'none' }
  const { mediaType } = body
  if (body.file) return { kind: 'file', filename: body.file.filename, mediaType }
  if (body.form) {
    if (isMultipart(mediaType)) {
      return {
        kind: 'multipart',
        mediaType,
        fields: body.form.map(([name, v]): MultipartField => {
          if (typeof v === 'string') return { name, value: v }
          const file: FileField = { filename: v.filename }
          if (v.contentType) file.contentType = v.contentType
          if (typeof v.data === 'string') file.data = v.data
          return { name, file }
        }),
      }
    }
    return {
      kind: 'urlencoded',
      mediaType,
      fields: body.form.map(([k, v]): [string, string] => [
        k,
        typeof v === 'string' ? v : v.filename,
      ]),
    }
  }
  const text = body.text ?? ''
  if (isJsonMediaType(mediaType)) {
    const json: SnippetBody = { kind: 'json', text, mediaType }
    const value = literalJson(text)
    if (value !== NOT_LITERAL) json.value = value
    return json
  }
  return { kind: 'text', text, mediaType }
}

const NOT_LITERAL = Symbol('not-literal')

/**
 * Parses JSON text for literal rendering. Returns NOT_LITERAL for invalid
 * JSON and for integers beyond 2^53 (they would lose precision).
 */
function literalJson(text: string): unknown {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return NOT_LITERAL
  }
  // Scan number tokens outside strings.
  const re = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
  for (const match of text.matchAll(re)) {
    const token = match[0]
    if (token.startsWith('"')) continue
    if (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) return NOT_LITERAL
  }
  return value
}

/* ------------------------------ headers ------------------------------ */

export function withoutHeaders(
  headers: [string, string][],
  ...names: string[]
): [string, string][] {
  const skip = new Set(names.map((n) => n.toLowerCase()))
  return headers.filter(([k]) => !skip.has(k.toLowerCase()))
}

/** Merges repeated header names with `, ` for map-based APIs. */
export function mergeHeaders(headers: [string, string][]): [string, string][] {
  const out: [string, string][] = []
  for (const [k, v] of headers) {
    const existing = out.find(([name]) => name.toLowerCase() === k.toLowerCase())
    if (existing) existing[1] += ', ' + v
    else out.push([k, v])
  }
  return out
}

export function hasDuplicateKeys(pairs: readonly (readonly [string, unknown])[]): boolean {
  return new Set(pairs.map(([k]) => k)).size !== pairs.length
}

export function encodeForm(fields: [string, string][]): string {
  return new URLSearchParams(fields).toString()
}

/** `Content-Type` value without parameters, keeping the original case. */
export function mediaTypeOnly(contentType: string): string {
  return (contentType.split(';')[0] ?? '').trim()
}

export function isPlainJson(contentType: string | undefined): boolean {
  return contentType !== undefined && baseMediaType(contentType) === 'application/json'
}

export function isUrlEncodedType(contentType: string | undefined): boolean {
  return contentType !== undefined && isFormUrlEncoded(contentType)
}

/** Content-Disposition for a multipart part; quotes in names are percent-encoded (HTML spec). */
export function contentDisposition(name: string, filename?: string): string {
  const q = (s: string) => s.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  return (
    `form-data; name="${q(name)}"` + (filename !== undefined ? `; filename="${q(filename)}"` : '')
  )
}

export function indentLines(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line ? indent + line : line))
    .join('\n')
}

/* ------------------------------ strings ------------------------------ */

/** True when the text has control characters (except tab and line feed, unless `strict`). */
export function hasControlChars(text: string, strict = false): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code < 0x20 || code === 0x7f) && (strict || (code !== 0x09 && code !== 0x0a))) return true
  }
  return false
}

interface EscapeOptions {
  quote: string
  /** Formats a control character (code < 0x20 or 0x7f) not covered by \n \r \t. */
  control: (code: number) => string
  /** Extra replacements, e.g. `$` for PHP/Kotlin. */
  extra?: Record<string, string>
  /** Escape U+2028/U+2029 (JavaScript). */
  lineSeparators?: boolean
}

function hex(code: number, width: number): string {
  return code.toString(16).toUpperCase().padStart(width, '0')
}

function escapeString(s: string, o: EscapeOptions): string {
  let out = o.quote
  for (const char of s) {
    const code = char.codePointAt(0)!
    if (char === '\\') out += '\\\\'
    else if (char === o.quote) out += '\\' + char
    else if (o.extra?.[char] !== undefined) out += o.extra[char]
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += o.control(code)
    else if (o.lineSeparators && (code === 0x2028 || code === 0x2029)) out += '\\u' + hex(code, 4)
    else out += char
  }
  return out + o.quote
}

/** POSIX shell single quotes: `'` becomes `'\''`. */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/** PowerShell single quotes: `'` and the typographic single quotes are doubled. */
export function psQuote(s: string): string {
  return "'" + s.replace(/['‘’‚‛]/g, (q) => q + q) + "'"
}

export const jsString = (s: string) =>
  escapeString(s, { quote: "'", control: (c) => '\\x' + hex(c, 2), lineSeparators: true })

export const pyString = (s: string) =>
  escapeString(s, { quote: "'", control: (c) => '\\x' + hex(c, 2).toLowerCase() })

/** Single quotes when nothing needs escaping beyond `\` and `'`, else double quotes. */
export function phpString(s: string): string {
  if (!hasControlChars(s, true)) return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
  return escapeString(s, { quote: '"', control: (c) => '\\x' + hex(c, 2), extra: { $: '\\$' } })
}

export const goString = (s: string) =>
  escapeString(s, { quote: '"', control: (c) => '\\x' + hex(c, 2).toLowerCase() })

/** Java: octal escapes, since `\u` escapes are processed before lexing. */
export const javaString = (s: string) =>
  escapeString(s, { quote: '"', control: (c) => '\\' + c.toString(8).padStart(3, '0') })

export const csString = (s: string) =>
  escapeString(s, { quote: '"', control: (c) => '\\u' + hex(c, 4) })

export const kotlinString = (s: string) =>
  escapeString(s, { quote: '"', control: (c) => '\\u' + hex(c, 4), extra: { $: '\\$' } })

export const swiftString = (s: string) =>
  escapeString(s, { quote: '"', control: (c) => (c === 0 ? '\\0' : '\\u{' + hex(c, 1) + '}') })

/** Escapes the inside of a Swift string literal (no quotes added). */
export const swiftInner = (s: string) => swiftString(s).slice(1, -1)
/** Escapes the inside of a Java string literal (no quotes added). */
export const javaInner = (s: string) => javaString(s).slice(1, -1)

/* ------------------------------ literals ------------------------------ */

export interface LiteralStyle {
  string: (s: string) => string
  key: (k: string) => string
  /** Between key and value: `: ` or ` => `. */
  separator: string
  true: string
  false: string
  null: string
  objectOpen: string
  objectClose: string
  emptyObject: string
  arrayOpen: string
  arrayClose: string
  indent: string
}

/**
 * Renders a JSON value as a multi-line native literal with trailing commas.
 * The first line has no indent; nested lines get `base` + levels of indent.
 */
export function renderLiteral(value: unknown, style: LiteralStyle, base = ''): string {
  const render = (v: unknown, pad: string): string => {
    if (v instanceof Raw) return v.code.replace(/\n(?=[^\n])/g, '\n' + pad)
    if (v === null || v === undefined) return style.null
    if (v === true) return style.true
    if (v === false) return style.false
    if (typeof v === 'number') return String(v)
    if (typeof v === 'string') return style.string(v)
    const inner = pad + style.indent
    if (Array.isArray(v)) {
      if (!v.length) return style.arrayOpen + style.arrayClose
      const items = v.map((item) => inner + render(item, inner) + ',')
      return style.arrayOpen + '\n' + items.join('\n') + '\n' + pad + style.arrayClose
    }
    const entries = v instanceof Ordered ? v.entries : Object.entries(v as Record<string, unknown>)
    if (!entries.length) return style.emptyObject
    const lines = entries.map(
      ([k, item]) => inner + style.key(k) + style.separator + render(item, inner) + ',',
    )
    return style.objectOpen + '\n' + lines.join('\n') + '\n' + pad + style.objectClose
  }
  return render(value, base)
}

export const PYTHON_LITERAL: LiteralStyle = {
  string: pyString,
  key: pyString,
  separator: ': ',
  true: 'True',
  false: 'False',
  null: 'None',
  objectOpen: '{',
  objectClose: '}',
  emptyObject: '{}',
  arrayOpen: '[',
  arrayClose: ']',
  indent: '    ',
}

export const PHP_LITERAL: LiteralStyle = {
  string: phpString,
  key: phpString,
  separator: ' => ',
  true: 'true',
  false: 'false',
  null: 'null',
  objectOpen: '[',
  objectClose: ']',
  // An empty PHP array would encode as `[]`; this keeps `{}`.
  emptyObject: '(object) []',
  arrayOpen: '[',
  arrayClose: ']',
  indent: '    ',
}

export const JS_LITERAL: LiteralStyle = {
  string: jsString,
  key: (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : jsString(k)),
  separator: ': ',
  true: 'true',
  false: 'false',
  null: 'null',
  objectOpen: '{',
  objectClose: '}',
  emptyObject: '{}',
  arrayOpen: '[',
  arrayClose: ']',
  indent: '  ',
}

/** Code inserted verbatim into a literal (an expression such as `fopen(...)`). */
export class Raw {
  constructor(public code: string) {}
}

/** An object with explicit key order (plain objects move integer-like keys first). */
export class Ordered {
  constructor(public entries: [string, unknown][]) {}
}

/** Renders `[key, value]` string pairs as a literal map, in order. */
export function renderPairs(pairs: [string, string][], style: LiteralStyle, base = ''): string {
  return renderLiteral(new Ordered(pairs), style, base)
}
