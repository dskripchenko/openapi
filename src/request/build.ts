import type {
  Encoding,
  FormValue,
  HttpRequest,
  HttpRequestBody,
  Parameter,
  ParameterIn,
} from '../core/types'
import { encodeComponent, encodeCookie, isFormUrlEncoded, isMultipart } from './encode'
import { applySecurity, type AppliedSecurity } from './security'
import { isFileValue, serializeParam, serializeValue, stringifyLeaf } from './serialize'
import { joinUrl } from './server'

export interface BuildInput {
  method: string
  /** Path template, e.g. `/pets/{id}`. */
  path: string
  /** Base URL (already resolved with {@link serverUrl}); may be relative. */
  server?: string
  /** Dereferenced parameters of the path item and the operation. */
  parameters: Parameter[]
  values: Partial<Record<ParameterIn, Record<string, unknown>>>
  body?: {
    mediaType: string
    /**
     * An object for structured media types, or the body text as typed. For
     * other media types a file value (`{ filename, contentType?, data? }`)
     * makes the file the whole body.
     */
    value: unknown
    encoding?: Record<string, Encoding>
  }
  security?: AppliedSecurity[]
  /**
   * Name/value pairs the spec does not declare, typed by the user; they go
   * after the declared parameters. Pairs with an empty name are skipped;
   * names and values are encoded here.
   */
  extra?: ExtraParams
}

/** Undeclared query parameters, headers and cookies, in order. */
export interface ExtraParams {
  query?: [string, string][]
  header?: [string, string][]
  cookie?: [string, string][]
}

/** Header parameters the spec says to ignore: they are set by other means. */
const IGNORED_HEADERS = new Set(['accept', 'content-type', 'authorization'])

function isEmptyValue(value: unknown, param: Parameter | undefined): boolean {
  if (value === undefined || value === null) return true
  return value === '' && !param?.allowEmptyValue
}

/** Builds the form fields of an `application/x-www-form-urlencoded` body (unencoded). */
function urlEncodedFields(
  value: Record<string, unknown>,
  encoding: Record<string, Encoding> = {},
): [string, FormValue][] {
  const fields: [string, FormValue][] = []
  for (const [name, v] of Object.entries(value)) {
    const enc = encoding[name] ?? {}
    const style = enc.style ?? 'form'
    const serialized = serializeValue('query', name, v, {
      style,
      explode: enc.explode ?? style === 'form',
      raw: true,
    })
    if (serialized && 'pairs' in serialized) fields.push(...serialized.pairs)
  }
  return fields
}

/** Builds multipart fields: files pass through, objects become JSON, arrays repeat the field. */
function multipartFields(value: Record<string, unknown>): [string, FormValue][] {
  const fields: [string, FormValue][] = []
  const push = (name: string, v: unknown) => {
    if (v === undefined || v === null) return
    if (isFileValue(v)) {
      const file: FormValue = { filename: v.filename }
      if (v.contentType !== undefined) file.contentType = v.contentType
      if (typeof v.data === 'string' || (typeof Blob !== 'undefined' && v.data instanceof Blob)) {
        file.data = v.data as Blob | string
      }
      fields.push([name, file])
    } else {
      fields.push([name, stringifyLeaf(v)])
    }
  }
  for (const [name, v] of Object.entries(value)) {
    if (Array.isArray(v)) v.forEach((item) => push(name, item))
    else push(name, v)
  }
  return fields
}

function buildBody(body: NonNullable<BuildInput['body']>): HttpRequestBody {
  const { mediaType, value, encoding } = body
  const structured = typeof value === 'object' && value !== null && !Array.isArray(value)
  if (isFormUrlEncoded(mediaType) && structured) {
    return { mediaType, form: urlEncodedFields(value as Record<string, unknown>, encoding) }
  }
  if (isMultipart(mediaType) && structured) {
    return { mediaType, form: multipartFields(value as Record<string, unknown>) }
  }
  if (!isFormUrlEncoded(mediaType) && !isMultipart(mediaType) && isFileValue(value)) {
    const file: NonNullable<HttpRequestBody['file']> = { filename: value.filename }
    if (value.contentType !== undefined) file.contentType = value.contentType
    if (typeof Blob !== 'undefined' && value.data instanceof Blob) file.data = value.data
    return { mediaType, file }
  }
  if (typeof value === 'string') return { mediaType, text: value }
  if (value === undefined) return { mediaType, text: '' }
  // JSON types, and the fallback for structured values of any other type.
  return { mediaType, text: JSON.stringify(value, null, 2) }
}

/**
 * Builds the HTTP request from the try-it form values.
 *
 * - Path placeholders without a value stay as `{name}`.
 * - Optional values that are undefined, null, empty arrays/objects are
 *   omitted; an empty string is kept only with `allowEmptyValue`.
 * - Header parameters named Accept, Content-Type or Authorization are
 *   ignored, as the spec requires.
 * - Cookies (parameters and API keys) go into a single `Cookie` header.
 * - Undeclared `extra` query and cookie pairs follow the declared
 *   parameters, before the credentials. Extra headers come last and replace
 *   a generated header of the same name (case-insensitive).
 * - `Content-Type` is set from the body media type, except for multipart:
 *   the HTTP client adds it with the boundary (`body.mediaType` keeps it).
 *   A file body under a wildcard type (`image/*`) declares the file's type.
 * - A relative `server` gives a relative URL; resolve it against the page.
 */
export function buildRequest(input: BuildInput): HttpRequest {
  const { parameters, values } = input
  const find = (location: ParameterIn, name: string) =>
    parameters.find((p) => p.in === location && p.name === name)

  // Path
  const path = input.path.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const param = find('path', name) ?? { name, in: 'path' as const }
    const value = values.path?.[name]
    if (isEmptyValue(value, undefined)) return match
    const serialized = serializeParam(param, value)
    return serialized && 'value' in serialized ? serialized.value : match
  })

  const query: [string, string][] = []
  const headers: [string, string][] = []
  const cookies: [string, string][] = []

  for (const param of parameters) {
    if (param.in === 'path') continue
    const value = values[param.in]?.[param.name]
    if (isEmptyValue(value, param)) continue
    if (param.in === 'header' && IGNORED_HEADERS.has(param.name.toLowerCase())) continue
    const serialized = serializeParam(param, value)
    if (!serialized) continue
    if (serialized.in === 'header') headers.push([param.name, serialized.value])
    else if (serialized.in === 'query') query.push(...serialized.pairs)
    else if (serialized.in === 'cookie') cookies.push(...serialized.pairs)
  }

  const named = (pairs: [string, string][] | undefined) => (pairs ?? []).filter(([k]) => k.trim() !== '').map(([k, v]): [string, string] => [k.trim(), v])
  for (const [k, v] of named(input.extra?.query)) query.push([encodeComponent(k), encodeComponent(v)])
  for (const [k, v] of named(input.extra?.cookie)) cookies.push([encodeCookie(k), encodeCookie(v)])

  const security = applySecurity(input.security)
  query.push(...security.query)
  headers.push(...security.headers)
  cookies.push(...security.cookies)

  let url = joinUrl(input.server ?? '', path)
  if (query.length) {
    url += (url.includes('?') ? '&' : '?') + query.map(([k, v]) => k + '=' + v).join('&')
  }

  const request: HttpRequest = { method: input.method.toUpperCase(), url, headers }
  if (input.body) {
    const body = buildBody(input.body)
    request.body = body
    if (!isMultipart(body.mediaType)) {
      const wildcard = body.file !== undefined && body.mediaType.includes('*')
      headers.push([
        'Content-Type',
        wildcard ? body.file?.contentType || 'application/octet-stream' : body.mediaType,
      ])
    }
  }
  if (cookies.length) headers.push(['Cookie', cookies.map(([k, v]) => k + '=' + v).join('; ')])
  // The user's own headers come last and win: one named like a generated
  // header (Content-Type, Authorization, Accept…) replaces it.
  const own = named(input.extra?.header)
  if (own.length) {
    const names = new Set(own.map(([k]) => k.toLowerCase()))
    request.headers = [...headers.filter(([k]) => !names.has(k.toLowerCase())), ...own]
  }
  return request
}
