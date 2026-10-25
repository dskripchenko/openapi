/**
 * The constructor's model of a block: flat, form-friendly fields (texts for
 * examples and schemas) — and the way back to block data.
 *
 * The way back patches the data the model was made from: a field the form
 * left alone keeps its value exactly as written (shorthand or object, key
 * order, `enum`, response headers, `x-` extensions…), and only what the form
 * changed is rewritten. So `modelToBlock(blockToModel(data), data)` gives
 * `data` back, and what the form cannot express survives its edits.
 */
import { detectFormat } from '../json'
import { parseSpec, stringifySpec } from '../load'
import {
  BLOCK_METHODS,
  MEDIA_ALIASES,
  OAUTH_FLOWS,
  PARAM_LOCATIONS,
  blockParameter,
  isRequestList,
  mediaType,
  pathParamNames,
  statusReason,
  type ParamLocation,
} from './document'
import { formatShorthand, parseShorthand } from './shorthand'
import type { BlockFormat } from './types'

type Obj = Record<string, unknown>

export type BlockMethod = (typeof BLOCK_METHODS)[number]
export type AuthKind = 'inherit' | 'none' | 'bearer' | 'basic' | 'apiKey' | 'oauth2' | 'openIdConnect'
export type OAuthFlowName = (typeof OAUTH_FLOWS)[number]

export interface AuthModel {
  /** 'inherit': no `auth` of its own (the block's shared one, or none). */
  kind: AuthKind
  /** apiKey: where the key goes and its name. */
  in: 'header' | 'query' | 'cookie'
  name: string
  /** bearer: the token format hint, e.g. JWT. */
  bearerFormat: string
  /** oauth2. */
  flow: OAuthFlowName
  authorizationUrl: string
  tokenUrl: string
  /** oauth2 / openIdConnect: scope names, separated by spaces. */
  scopes: string
  /** openIdConnect: the discovery URL. */
  url: string
}

export interface ParamModel {
  in: ParamLocation
  name: string
  /** A shorthand type: string, integer, string(email), integer[], file… */
  type: string
  /** Always true for a path parameter. */
  required: boolean
  description: string
  /** The example as typed; numbers, booleans and JSON are read by the type. */
  example: string
  /** Where the parameter sits in the data the model came from. */
  origin?: { in: ParamLocation; name: string }
  /** A path parameter the URL implies and the data does not declare. */
  implicit?: boolean
}

export interface BodyModel {
  enabled: boolean
  /** As written: an alias (json, form, multipart, text, xml, binary) or a media type. */
  type: string
  /** Which editor the form shows; both texts are kept. */
  mode: 'example' | 'schema'
  /** JSON for structured media types, the plain text otherwise. */
  example: string
  /** YAML or JSON (the block's format); a shorthand type works too. */
  schema: string
  description: string
  required: boolean
}

export interface ResponseModel {
  status: string
  description: string
  example: string
  /** The status the response had in the data. */
  origin?: string
}

export interface RequestModel {
  method: BlockMethod
  url: string
  summary: string
  description: string
  auth: AuthModel
  params: ParamModel[]
  body: BodyModel
  responses: ResponseModel[]
  /** The request's index in the data. */
  origin?: number
}

export interface BlockModel {
  /** `requests: [...]` rather than one request at the top. */
  multiple: boolean
  title: string
  baseUrl: string
  /** The shared auth of several requests. */
  auth: AuthModel
  requests: RequestModel[]
}

/** A form field whose text did not read; its old value stays in the data. */
export interface BlockModelError {
  /** `{request}.body.example`, `{request}.body.schema`, `{request}.responses.{index}.example`. */
  field: string
  message: string
}

/* ---------------------------------- defaults --------------------------------- */

export function emptyAuth(kind: AuthKind = 'inherit'): AuthModel {
  return { kind, in: 'header', name: 'X-API-Key', bearerFormat: '', flow: 'clientCredentials', authorizationUrl: '', tokenUrl: '', scopes: '', url: '' }
}

export function emptyParam(loc: ParamLocation = 'query', name = ''): ParamModel {
  return { in: loc, name, type: 'string', required: loc === 'path', description: '', example: '' }
}

export function emptyBody(): BodyModel {
  return { enabled: false, type: 'json', mode: 'example', example: '', schema: '', description: '', required: true }
}

export function emptyRequest(url = '/resource'): RequestModel {
  const req: RequestModel = { method: 'GET', url, summary: '', description: '', auth: emptyAuth(), params: [], body: emptyBody(), responses: [{ status: '200', description: 'OK', example: '' }] }
  syncPathParams(req)
  return req
}

/** True for a media type whose examples are JSON values (objects for forms). */
export function isStructuredMedia(type: string): boolean {
  const full = mediaType(type || 'json').toLowerCase()
  return full.includes('json') || full === 'application/x-www-form-urlencoded' || full === 'multipart/form-data'
}

/* ------------------------------- data → model ------------------------------- */

/**
 * The constructor's model of block data in the compact shape (parseBlock's
 * `data` when `kind` is 'requests'). Schemas are written in `format`.
 */
export function blockToModel(data: unknown, format: BlockFormat = 'yaml'): BlockModel {
  const top = isObj(data) ? data : {}
  const multiple = isRequestList(top)
  const raws = multiple ? (Array.isArray(top.requests) ? top.requests : []) : [top]
  return {
    multiple,
    title: text(top.title),
    baseUrl: text(top.baseUrl),
    auth: multiple ? authModel(top.auth) : emptyAuth(),
    requests: raws.map((r, i) => requestModel(r, i, format)),
  }
}

function requestModel(raw: unknown, index: number, format: BlockFormat): RequestModel {
  const r = isObj(raw) ? raw : {}
  const method = text(r.method).toUpperCase() || 'GET'
  const req: RequestModel = {
    method: ((BLOCK_METHODS as readonly string[]).includes(method) ? method : 'GET') as BlockMethod,
    url: text(r.url),
    summary: text(r.summary),
    description: text(r.description),
    auth: authModel(r.auth),
    params: [],
    body: bodyModel(r.body, format),
    responses: isObj(r.responses) ? Object.entries(r.responses).map(([s, v]) => responseModel(s, v)) : [],
    origin: index,
  }
  const params = isObj(r.params) ? r.params : {}
  for (const loc of PARAM_LOCATIONS) {
    const group = params[loc]
    if (!isObj(group)) continue
    for (const [name, def] of Object.entries(group)) req.params.push(paramModel(loc, name, def))
  }
  syncPathParams(req)
  return req
}

function paramModel(loc: ParamLocation, name: string, def: unknown): ParamModel {
  let p: Obj
  try {
    p = blockParameter(name, loc, def)
  } catch {
    p = { schema: { type: 'string' } }
  }
  const schema = isObj(p.schema) ? p.schema : {}
  const type = formatShorthand(schema) ?? formatShorthand(pick(schema, ['type', 'format', 'items'])) ?? (typeof schema.type === 'string' ? schema.type : 'string')
  return {
    in: loc,
    name,
    type,
    required: loc === 'path' || p.required === true,
    description: text(p.description),
    example: p.example === undefined ? '' : typeof p.example === 'string' ? p.example : JSON.stringify(p.example),
    origin: { in: loc, name },
  }
}

function bodyModel(raw: unknown, format: BlockFormat): BodyModel {
  if (!isObj(raw)) return emptyBody()
  const type = text(raw.type) || 'json'
  return {
    enabled: true,
    type,
    mode: raw.schema !== undefined && raw.example === undefined ? 'schema' : 'example',
    example: exampleText(raw.example, type),
    schema: raw.schema === undefined ? '' : stringifySpec(raw.schema, format).trimEnd(),
    description: text(raw.description),
    required: raw.required !== false,
  }
}

function responseModel(status: string, raw: unknown): ResponseModel {
  if (!isObj(raw)) return { status, description: typeof raw === 'string' ? raw : '', example: '', origin: status }
  return { status, description: text(raw.description), example: exampleText(raw.example, text(raw.type) || 'json'), origin: status }
}

/** The form's view of an `auth` value. */
export function authModel(raw: unknown): AuthModel {
  const a = emptyAuth()
  if (raw === undefined || raw === null) return a
  const spec: Obj = typeof raw === 'string' ? { type: raw } : isObj(raw) ? raw : {}
  const type = text(spec.type).toLowerCase()
  if (type === 'none') a.kind = 'none'
  else if (type === 'bearer' || type === 'jwt') {
    a.kind = 'bearer'
    a.bearerFormat = text(spec.format ?? spec.bearerFormat) || (type === 'jwt' ? 'JWT' : '')
  } else if (type === 'basic') a.kind = 'basic'
  else if (type === 'apikey') {
    a.kind = 'apiKey'
    const where = text(spec.in)
    a.in = where === 'query' || where === 'cookie' ? where : 'header'
    a.name = spec.name === undefined ? 'X-API-Key' : text(spec.name)
  } else if (type === 'oauth2') {
    a.kind = 'oauth2'
    const flows = isObj(spec.flows) ? spec.flows : undefined
    const [flowName, flow] = flows ? (Object.entries(flows)[0] ?? []) : []
    const src: Obj = isObj(flow) ? flow : spec
    a.authorizationUrl = text(src.authorizationUrl)
    a.tokenUrl = text(src.tokenUrl)
    const named = text(flowName ?? spec.flow)
    a.flow = (OAUTH_FLOWS as readonly string[]).includes(named)
      ? (named as OAuthFlowName)
      : a.authorizationUrl && a.tokenUrl
        ? 'authorizationCode'
        : a.authorizationUrl
          ? 'implicit'
          : 'clientCredentials'
    a.scopes = scopeNames(src.scopes).join(' ')
  } else if (type === 'openidconnect' || type === 'oidc') {
    a.kind = 'openIdConnect'
    a.url = text(spec.url ?? spec.openIdConnectUrl)
    a.scopes = scopeNames(spec.scopes).join(' ')
  }
  return a
}

/* ------------------------------- model → data ------------------------------- */

/**
 * Block data for the model, patched onto `base` — the data the model was
 * made from (or last written as). Fields the model did not change keep their
 * value from `base` as written. A text that does not read (an example that is
 * not JSON, a schema that does not parse) leaves the old value and is listed
 * in `errors`.
 */
export function modelToBlock(model: BlockModel, base?: unknown, format: BlockFormat = 'yaml'): { data: Obj; errors: BlockModelError[] } {
  const errors: BlockModelError[] = []
  const prev = isObj(base) ? base : {}
  const prevModel = blockToModel(prev, format)
  const baseMulti = isRequestList(prev)
  const prevRequests: unknown[] = baseMulti ? (Array.isArray(prev.requests) ? prev.requests : []) : isObj(base) ? [requestPart(prev)] : []
  const write = (m: RequestModel, i: number): Obj => writeRequest(m, m.origin !== undefined ? prevRequests[m.origin] : undefined, format, `${i}`, errors)

  let out: Obj
  if (!model.multiple && model.requests.length <= 1 && !baseMulti) {
    // One request at the top: its fields and the shared ones live side by side.
    out = writeRequest(model.requests[0] ?? emptyRequest(), isObj(base) ? prev : undefined, format, '0', errors)
  } else {
    // A single request becoming several: its shared keys stay at the top, the rest is the first request.
    out = baseMulti ? { ...prev } : pick(prev, SINGLE_SHARED)
    if (!sameAuth(model.auth, prevModel.multiple ? prevModel.auth : emptyAuth())) setOrDelete(out, 'auth', writeAuth(model.auth, out.auth))
    out.requests = model.requests.map(write)
    if (!baseMulti) out = order(out, ['title', 'description', 'version', 'baseUrl', 'servers', 'auth', 'requests'])
  }
  if (model.title !== prevModel.title) setOrDelete(out, 'title', model.title || undefined)
  if (model.baseUrl !== prevModel.baseUrl) setOrDelete(out, 'baseUrl', model.baseUrl.trim() || undefined)
  if (!isObj(base)) out = order(out, ['title', 'baseUrl'])
  return { data: out, errors }
}

/**
 * After the data is written: the model's items now come from it — each
 * request, parameter and response points at its own place in the new data.
 */
export function syncOrigins(model: BlockModel): void {
  model.requests.forEach((r, i) => {
    r.origin = i
    for (const p of r.params) {
      if (p.implicit && isDefaultImplicit(p)) continue
      p.implicit = false
      p.origin = p.name.trim() ? { in: p.in, name: p.name.trim() } : undefined
    }
    for (const res of r.responses) res.origin = res.status.trim() || undefined
  })
}

/**
 * Brings the path parameters in line with the URL: one for each `{x}`, in the
 * URL's order (new ones are strings), none for a name the URL lost.
 */
export function syncPathParams(req: RequestModel): void {
  const names = pathParamNames(req.url)
  const byName = new Map(req.params.filter((p) => p.in === 'path').map((p) => [p.name, p]))
  const path = names.map((n) => byName.get(n) ?? { ...emptyParam('path', n), implicit: true })
  for (const p of path) p.required = true
  const rest = req.params.filter((p) => p.in !== 'path')
  // Same items in the same order: leave the array alone, so a watcher does not fire for nothing.
  const next = [...path, ...rest]
  if (next.length === req.params.length && next.every((p, i) => p === req.params[i])) return
  req.params.splice(0, req.params.length, ...next)
}

/** The keys a single-request block shares with the document rather than its request. */
const SINGLE_SHARED = ['title', 'version', 'baseUrl', 'servers']

/** A single-request block without its shared keys. */
function requestPart(single: Obj): Obj {
  return omit(single, SINGLE_SHARED)
}

function writeRequest(m: RequestModel, prevRaw: unknown, format: BlockFormat, at: string, errors: BlockModelError[]): Obj {
  const fresh = !isObj(prevRaw)
  const prev: Obj = isObj(prevRaw) ? prevRaw : {}
  const pm = fresh ? undefined : requestModel(prev, 0, format)
  const out: Obj = { ...prev }
  if (!pm || pm.method !== m.method) {
    if (m.method === 'GET' && !('method' in prev)) delete out.method
    else out.method = m.method
  }
  if (!pm || pm.url !== m.url) out.url = m.url
  if (!pm || pm.summary !== m.summary) setOrDelete(out, 'summary', m.summary || undefined)
  if (!pm || pm.description !== m.description) setOrDelete(out, 'description', m.description || undefined)
  if (!pm || !sameAuth(pm.auth, m.auth)) setOrDelete(out, 'auth', writeAuth(m.auth, prev.auth))
  setOrDelete(out, 'params', writeParams(m.params, prev.params))
  setOrDelete(out, 'body', writeBody(m.body, prev.body, format, `${at}.body`, errors))
  setOrDelete(out, 'responses', writeResponses(m.responses, prev.responses, `${at}.responses`, errors))
  return fresh ? order(out, ['method', 'url', 'summary', 'description', 'auth', 'params', 'body', 'responses']) : out
}

function writeParams(params: ParamModel[], prevRaw: unknown): unknown {
  const prev = isObj(prevRaw) ? prevRaw : {}
  const groups: Partial<Record<ParamLocation, Obj>> = {}
  for (const p of params) {
    const name = p.name.trim()
    if (!name || (p.implicit && isDefaultImplicit(p))) continue
    const prevGroup = p.origin ? prev[p.origin.in] : undefined
    const prevVal = p.origin && isObj(prevGroup) && p.origin.name in prevGroup ? prevGroup[p.origin.name] : undefined
    ;(groups[p.in] ??= {})[name] = writeParam({ ...p, name }, prevVal)
  }
  const locs = [...Object.keys(prev).filter((k) => k in groups), ...PARAM_LOCATIONS.filter((l) => !(l in prev))] as ParamLocation[]
  const out: Obj = {}
  for (const loc of locs) if (groups[loc]) out[loc] = groups[loc]
  if (!Object.keys(out).length) return isObj(prevRaw) && !Object.values(prevRaw).some((g) => isObj(g) && Object.keys(g).length) ? prevRaw : undefined
  return same(out, prevRaw) ? prevRaw : out
}

function writeParam(m: ParamModel, prevVal: unknown): unknown {
  const pm = prevVal !== undefined && m.origin ? paramModel(m.origin.in, m.origin.name, prevVal) : undefined
  if (pm && pm.in === m.in && pm.type === m.type && pm.required === m.required && pm.description === m.description && pm.example === m.example) return prevVal
  const example = m.example.trim() === '' ? undefined : coerce(m.example, m.type)
  const wasObject = isObj(prevVal)
  if (!wasObject && example === undefined && !m.description.includes('\n')) {
    return `${m.type}${m.required && m.in !== 'path' ? '!' : ''}${m.description ? ` ${m.description}` : ''}`
  }
  const obj: Obj = wasObject ? { ...prevVal } : {}
  if (!wasObject || pm?.type !== m.type) {
    const schema = parseShorthand(m.type).schema
    if (isObj(obj.schema)) obj.schema = { ...omit(obj.schema, ['type', 'format', 'items']), ...schema }
    else {
      delete obj.format
      delete obj.items
      obj.type = m.type
    }
  }
  if (!wasObject || pm?.required !== m.required) {
    if (m.in !== 'path') {
      if (m.required) obj.required = true
      else delete obj.required
      // A `!` in a shorthand `type` would keep it required.
      if (!m.required && typeof obj.type === 'string') obj.type = obj.type.replace(/!(?=\s|$)/, '')
    }
  }
  if (!wasObject || pm?.description !== m.description) setOrDelete(obj, 'description', m.description || undefined)
  if (!wasObject || pm?.example !== m.example) setOrDelete(obj, 'example', example)
  return wasObject ? obj : order(obj, ['type', 'required', 'description', 'example'])
}

function writeBody(m: BodyModel, prevRaw: unknown, format: BlockFormat, at: string, errors: BlockModelError[]): unknown {
  if (!m.enabled) return undefined
  const prev = isObj(prevRaw) ? prevRaw : undefined
  const pm = prev ? bodyModel(prev, format) : undefined
  const out: Obj = prev ? { ...prev } : {}
  if (!pm || pm.type !== m.type) {
    if (m.type === 'json' && !(prev && 'type' in prev)) delete out.type
    else out.type = m.type
  }
  if (!pm || pm.example !== m.example || pm.type !== m.type) {
    const read = readExample(m.example, m.type)
    if ('error' in read) errors.push({ field: `${at}.example`, message: read.error })
    else setOrDelete(out, 'example', read.value)
  }
  if (!pm || pm.schema !== m.schema) {
    const read = readSchema(m.schema)
    if ('error' in read) errors.push({ field: `${at}.schema`, message: read.error })
    else setOrDelete(out, 'schema', read.value)
  }
  if (!pm || pm.description !== m.description) setOrDelete(out, 'description', m.description || undefined)
  if (!pm || pm.required !== m.required) {
    if (m.required) delete out.required
    else out.required = false
  }
  return prev ? out : order(out, ['type', 'description', 'required', 'example', 'schema'])
}

function writeResponses(list: ResponseModel[], prevRaw: unknown, at: string, errors: BlockModelError[]): unknown {
  const prev = isObj(prevRaw) ? prevRaw : {}
  const out: Obj = {}
  list.forEach((m, i) => {
    const status = m.status.trim()
    if (!status) return
    const prevVal = m.origin !== undefined && m.origin in prev ? prev[m.origin] : undefined
    out[status] = writeResponse({ ...m, status }, prevVal, `${at}.${i}`, errors)
  })
  if (!Object.keys(out).length) return undefined
  return same(out, prevRaw) ? prevRaw : out
}

function writeResponse(m: ResponseModel, prevVal: unknown, at: string, errors: BlockModelError[]): unknown {
  const pm = m.origin !== undefined && prevVal !== undefined ? responseModel(m.origin, prevVal) : undefined
  if (pm && pm.description === m.description && pm.example === m.example) return prevVal
  const wasObject = isObj(prevVal)
  const type = wasObject ? text(prevVal.type) || 'json' : 'json'
  let example: unknown
  let hasExample = false
  if (!pm || pm.example !== m.example) {
    const read = readExample(m.example, type)
    if ('error' in read) {
      errors.push({ field: `${at}.example`, message: read.error })
      if (wasObject) example = prevVal.example
      hasExample = wasObject && prevVal.example !== undefined
    } else {
      example = read.value
      hasExample = read.value !== undefined
    }
  } else if (wasObject) {
    example = prevVal.example
    hasExample = example !== undefined
  }
  if (!wasObject && !hasExample) return m.description || statusReason(m.status)
  const obj: Obj = wasObject ? { ...prevVal } : {}
  setOrDelete(obj, 'description', m.description || (wasObject ? undefined : statusReason(m.status)))
  setOrDelete(obj, 'example', hasExample ? example : undefined)
  return wasObject ? obj : order(obj, ['description', 'example'])
}

function writeAuth(m: AuthModel, prevRaw: unknown): unknown {
  const prev = authModel(prevRaw)
  if (sameAuth(prev, m) && prevRaw !== undefined) return prevRaw
  const keep: Obj = isObj(prevRaw) && prev.kind === m.kind && typeof prevRaw.description === 'string' ? { description: prevRaw.description } : {}
  const scopes = (): unknown => {
    // Unchanged scopes keep their descriptions.
    if (prev.kind === m.kind && prev.scopes === m.scopes && isObj(prevRaw) && prevRaw.scopes !== undefined) return prevRaw.scopes
    const list = m.scopes.split(/[\s,]+/).filter(Boolean)
    return list.length ? list : undefined
  }
  switch (m.kind) {
    case 'inherit':
      return undefined
    case 'none':
    case 'basic':
      return Object.keys(keep).length ? { type: m.kind, ...keep } : m.kind
    case 'bearer':
      return m.bearerFormat || Object.keys(keep).length ? clean({ type: 'bearer', format: m.bearerFormat || undefined, ...keep }) : 'bearer'
    case 'apiKey':
      return clean({ type: 'apiKey', in: m.in, name: m.name || 'X-API-Key', ...keep })
    case 'oauth2': {
      const needsAuth = m.flow === 'authorizationCode' || m.flow === 'implicit'
      const needsToken = m.flow !== 'implicit'
      return clean({
        type: 'oauth2',
        flow: m.flow,
        authorizationUrl: needsAuth ? m.authorizationUrl : undefined,
        tokenUrl: needsToken ? m.tokenUrl : undefined,
        scopes: scopes(),
        ...keep,
      })
    }
    case 'openIdConnect':
      return clean({ type: 'openIdConnect', url: m.url, scopes: scopes(), ...keep })
  }
}

/* ---------------------------------- texts ---------------------------------- */

function exampleText(value: unknown, type: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string' && !isStructuredMedia(type)) return value
  return JSON.stringify(value, null, 2)
}

/** An example as typed: JSON (or YAML) for structured media, the text itself otherwise. */
function readExample(textValue: string, type: string): { value: unknown } | { error: string } {
  if (!textValue.trim()) return { value: undefined }
  if (!isStructuredMedia(type)) return { value: textValue }
  try {
    return { value: parseSpec(textValue, detectFormat(textValue)).value }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function readSchema(textValue: string): { value: unknown } | { error: string } {
  if (!textValue.trim()) return { value: undefined }
  try {
    return { value: parseSpec(textValue, detectFormat(textValue)).value }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** A parameter example read by its type: numbers, booleans, JSON for arrays and objects. */
function coerce(value: string, type: string): unknown {
  const t = value.trim()
  const base = type.replace(/\(.*\)/, '')
  if (base.endsWith('[]') || base === 'object' || base === 'array') {
    try {
      return JSON.parse(t)
    } catch {
      return value
    }
  }
  if ((base === 'integer' || base === 'number') && t !== '' && !Number.isNaN(Number(t))) return Number(t)
  if (base === 'boolean' && (t === 'true' || t === 'false')) return t === 'true'
  return value
}

/* --------------------------------- helpers --------------------------------- */

function isDefaultImplicit(p: ParamModel): boolean {
  return p.in === 'path' && p.type === 'string' && !p.description && !p.example
}

function sameAuth(a: AuthModel, b: AuthModel): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'bearer':
      return a.bearerFormat === b.bearerFormat
    case 'apiKey':
      return a.in === b.in && a.name === b.name
    case 'oauth2':
      return a.flow === b.flow && a.authorizationUrl === b.authorizationUrl && a.tokenUrl === b.tokenUrl && a.scopes === b.scopes
    case 'openIdConnect':
      return a.url === b.url && a.scopes === b.scopes
    default:
      return true
  }
}

function scopeNames(scopes: unknown): string[] {
  if (typeof scopes === 'string') return scopes.split(/[\s,]+/).filter(Boolean)
  if (Array.isArray(scopes)) return scopes.map(String)
  if (isObj(scopes)) return Object.keys(scopes)
  return []
}

/** Deep equality of JSON data; object key order does not matter. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]))
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && same(a[k], b[k]))
  }
  return false
}

function setOrDelete(o: Obj, key: string, value: unknown): void {
  if (value === undefined) delete o[key]
  else o[key] = value
}

function clean(o: Obj): Obj {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''))
}

function order(o: Obj, keys: string[]): Obj {
  const out: Obj = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  for (const [k, v] of Object.entries(o)) if (!(k in out)) out[k] = v
  return out
}

function pick(o: Obj, keys: string[]): Obj {
  return Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)))
}

function omit(o: Obj, keys: string[]): Obj {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
}

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '')
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The aliases a body or response `type` takes. */
export const BODY_TYPES = Object.keys(MEDIA_ALIASES)
