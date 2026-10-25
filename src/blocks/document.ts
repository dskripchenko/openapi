/**
 * Compact block data → an OpenAPI 3.1 document. Checks the shape on the way
 * and throws BlockError with the JSON Pointer of the value at fault, so
 * parseBlock can name its line.
 */
import type { OpenApiDocument } from '../core/types'
import { BlockError } from './errors'
import { inferSchema } from './infer'
import { expandSchema, parseShorthand } from './shorthand'

type Obj = Record<string, unknown>

export const BLOCK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'] as const
export const PARAM_LOCATIONS = ['path', 'query', 'header', 'cookie'] as const
export type ParamLocation = (typeof PARAM_LOCATIONS)[number]

/** Body and response `type` aliases. */
export const MEDIA_ALIASES: Readonly<Record<string, string>> = {
  json: 'application/json',
  form: 'application/x-www-form-urlencoded',
  multipart: 'multipart/form-data',
  text: 'text/plain',
  xml: 'application/xml',
  binary: 'application/octet-stream',
}

export const AUTH_TYPES = ['bearer', 'basic', 'apiKey', 'oauth2', 'openIdConnect', 'none'] as const
export const OAUTH_FLOWS = ['authorizationCode', 'clientCredentials', 'password', 'implicit'] as const

const REQUEST_KEYS = new Set(['method', 'url', 'summary', 'description', 'operationId', 'tags', 'deprecated', 'auth', 'params', 'body', 'responses'])
const SHARED_KEYS = new Set(['title', 'description', 'version', 'baseUrl', 'servers', 'auth', 'requests'])
const PARAM_KEYS = new Set(['description', 'required', 'deprecated', 'example', 'style', 'explode', 'schema'])
const BODY_KEYS = new Set(['type', 'example', 'schema', 'description', 'required'])
const RESPONSE_KEYS = new Set(['description', 'type', 'example', 'schema', 'headers'])

const REASONS: Record<string, string> = {
  '200': 'OK', '201': 'Created', '202': 'Accepted', '204': 'No Content', '301': 'Moved Permanently', '302': 'Found',
  '304': 'Not Modified', '400': 'Bad Request', '401': 'Unauthorized', '403': 'Forbidden', '404': 'Not Found',
  '405': 'Method Not Allowed', '409': 'Conflict', '410': 'Gone', '415': 'Unsupported Media Type',
  '422': 'Unprocessable Entity', '429': 'Too Many Requests', '500': 'Internal Server Error', '502': 'Bad Gateway',
  '503': 'Service Unavailable', '504': 'Gateway Timeout', default: 'Error',
}

/** The usual reason phrase of a status ("Not Found"), or "Response". */
export function statusReason(status: string): string {
  return REASONS[status] ?? (/^[1-5]XX$/i.test(status) ? `${status[0]}XX` : 'Response')
}

/** The media type an alias stands for; a full media type as is. */
export function mediaType(type: string): string {
  return MEDIA_ALIASES[type.toLowerCase()] ?? type
}

/** True for data in the several-requests shape. */
export function isRequestList(data: unknown): data is Obj & { requests: unknown[] } {
  return isObj(data) && 'requests' in data
}

/** An absolute URL split into its server (scheme and host) and path, or a path alone. */
export function splitUrl(url: string): { origin?: string; path: string; query: string } | null {
  const abs = /^(https?:\/\/[^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?$/i.exec(url)
  if (abs) return { origin: abs[1]!, path: abs[2] || '/', query: abs[3]?.slice(1) ?? '' }
  const rel = /^(\/[^?#\s]*)(\?[^#\s]*)?$/.exec(url)
  if (rel) return { path: rel[1]!, query: rel[2]?.slice(1) ?? '' }
  return null
}

/** The names of `{x}` path parameters in a URL, in order, once each. */
export function pathParamNames(url: string): string[] {
  const path = splitUrl(url)?.path ?? url
  return [...new Set([...path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!))]
}

/**
 * A readable operationId from the method and the path:
 * `GET /v1/users/{id}/orders` → `getV1UsersByIdOrders`.
 */
export function operationIdFor(method: string, path: string): string {
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
  const words = path
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const param = /^\{(.+)\}$/.exec(seg)
      const parts = (param ? param[1]! : seg).split(/[^A-Za-z0-9]+/).filter(Boolean)
      return (param ? 'By' : '') + parts.map(cap).join('')
    })
  return method.toLowerCase() + (words.join('') || 'Root')
}

/**
 * Turns compact block data — one request, or `requests:` with shared
 * settings — into an OpenAPI 3.1 document. Throws BlockError for data that
 * is not a block.
 */
export function blockToDocument(data: unknown): OpenApiDocument {
  if (!isObj(data)) throw new BlockError('A block is an object: a request with `url`, or `requests: [...]`')
  const multi = isRequestList(data)
  for (const key of Object.keys(data)) {
    if (key.startsWith('x-') || SHARED_KEYS.has(key) || (!multi && REQUEST_KEYS.has(key))) continue
    throw new BlockError(unknownKey(key, multi ? [...SHARED_KEYS] : [...REQUEST_KEYS, ...SHARED_KEYS]), `/${esc(key)}`)
  }
  const requests: { req: Obj; at: string }[] = multi
    ? (() => {
        if (!Array.isArray(data.requests)) throw new BlockError('`requests` is a list of requests', '/requests')
        if (data.requests.length === 0) throw new BlockError('`requests` is empty: add a request with `url`', '/requests')
        return data.requests.map((req, i) => ({ req: req as Obj, at: `/requests/${i}` }))
      })()
    : [{ req: data, at: '' }]

  const doc: Obj = { openapi: '3.1.0' }
  const firstSummary = typeof requests[0]!.req?.summary === 'string' ? (requests[0]!.req.summary as string) : ''
  const info: Obj = { title: optStr(data.title, '/title') || (multi ? '' : firstSummary) || 'API', version: optStr(data.version, '/version') || '1.0.0' }
  if (multi && data.description !== undefined) info.description = str(data.description, '/description')
  doc.info = info

  // Servers: given, or the base URL, or the host of the first absolute URL.
  const servers: Obj[] = []
  const baseUrl = data.baseUrl !== undefined ? str(data.baseUrl, '/baseUrl').replace(/\/+$/, '') : ''
  if (data.baseUrl !== undefined && !baseUrl) throw new BlockError('`baseUrl` is empty', '/baseUrl')
  if (data.servers !== undefined) {
    if (!Array.isArray(data.servers)) throw new BlockError('`servers` is a list of URLs', '/servers')
    data.servers.forEach((s, i) => {
      if (typeof s === 'string') servers.push(server(s))
      else if (isObj(s) && typeof s.url === 'string') servers.push({ ...s, ...server(s.url) })
      else throw new BlockError('A server is a URL or { url, description }', `/servers/${i}`)
    })
  } else if (baseUrl) servers.push(server(baseUrl))

  const schemes = new Schemes()
  if (data.auth !== undefined && multi) {
    const shared = schemes.add(data.auth, '/auth')
    if (shared) doc.security = shared === 'none' ? [] : [shared]
  }

  const paths: Obj = {}
  const ids = new Set<string>()
  for (const { req, at } of requests) {
    const { path, method, operation, origin } = toOperation(req, at, schemes, baseUrl, !multi)
    if (origin) {
      if (servers.length === 0) servers.push(server(origin))
      else if (!servers.some((s) => s.url === origin)) operation.servers = [server(origin)]
    }
    let id = operation.operationId as string
    for (let n = 2; ids.has(id); n++) id = `${operation.operationId as string}${n}`
    operation.operationId = id
    ids.add(id)
    const item = ((paths[path] as Obj | undefined) ??= {})
    if (item[method]) throw new BlockError(`${method.toUpperCase()} ${path} is already in the block`, `${at}/url`)
    item[method] = operation
  }
  if (servers.length) doc.servers = servers
  doc.paths = paths
  if (schemes.size) doc.components = { securitySchemes: schemes.toObject() }
  // A single request's extensions are the operation's (toOperation copies them).
  if (multi) for (const [k, v] of Object.entries(data)) if (k.startsWith('x-')) doc[k] = v
  return doc as unknown as OpenApiDocument
}

function toOperation(
  req: Obj,
  at: string,
  schemes: Schemes,
  baseUrl: string,
  single: boolean,
): { path: string; method: string; operation: Obj; origin?: string } {
  if (!isObj(req)) throw new BlockError('A request is an object with `url`', at)
  if (!single) {
    for (const key of Object.keys(req)) {
      if (!key.startsWith('x-') && !REQUEST_KEYS.has(key)) throw new BlockError(unknownKey(key, [...REQUEST_KEYS]), `${at}/${esc(key)}`)
    }
  }
  const rawMethod = req.method === undefined ? 'GET' : str(req.method, `${at}/method`)
  const method = rawMethod.trim().toUpperCase()
  if (!(BLOCK_METHODS as readonly string[]).includes(method)) {
    throw new BlockError(`Unknown method "${rawMethod}": use ${BLOCK_METHODS.join(', ')}`, `${at}/method`)
  }
  if (req.url === undefined) throw new BlockError('A request needs `url`: https://api.example.com/users or /users', at)
  const url = str(req.url, `${at}/url`).trim()
  const parts = splitUrl(url)
  if (!parts) throw new BlockError(`"${url}" is not a URL: write https://host/path or a path starting with /`, `${at}/url`)
  let { path } = parts
  let origin = parts.origin
  // An absolute URL under the base URL is a path of it.
  if (origin && baseUrl && /^https?:/i.test(baseUrl) && (origin + path).startsWith(baseUrl + '/')) {
    path = (origin + path).slice(baseUrl.length)
    origin = undefined
  }

  const op: Obj = {}
  if (req.tags !== undefined) {
    const tags = typeof req.tags === 'string' ? [req.tags] : req.tags
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) throw new BlockError('`tags` is a tag or a list of tags', `${at}/tags`)
    op.tags = tags
  }
  if (req.summary !== undefined) op.summary = str(req.summary, `${at}/summary`)
  if (req.description !== undefined) op.description = str(req.description, `${at}/description`)
  op.operationId = req.operationId !== undefined ? str(req.operationId, `${at}/operationId`) : operationIdFor(method, path)

  const parameters = toParameters(req.params, at, path, parts.query)
  if (parameters.length) op.parameters = parameters
  if (req.body !== undefined && req.body !== null) op.requestBody = toBody(req.body, `${at}/body`)
  op.responses = toResponses(req.responses, `${at}/responses`)
  if (req.deprecated !== undefined) {
    if (typeof req.deprecated !== 'boolean') throw new BlockError('`deprecated` is true or false', `${at}/deprecated`)
    if (req.deprecated) op.deprecated = true
  }
  if (req.auth !== undefined) {
    const req1 = schemes.add(req.auth, `${at}/auth`)
    if (req1) op.security = req1 === 'none' ? [] : [req1]
  }
  for (const [k, v] of Object.entries(req)) if (k.startsWith('x-')) op[k] = v
  return { path, method: method.toLowerCase(), operation: op, ...(origin ? { origin } : {}) }
}

function toParameters(params: unknown, at: string, path: string, query: string): Obj[] {
  const out: Obj[] = []
  const inPath = pathParamNames(path)
  const declared: Partial<Record<ParamLocation, Obj>> = {}
  if (params !== undefined && params !== null) {
    if (!isObj(params)) throw new BlockError('`params` maps locations (path, query, header, cookie) to parameters', `${at}/params`)
    for (const [loc, group] of Object.entries(params)) {
      if (!(PARAM_LOCATIONS as readonly string[]).includes(loc)) {
        throw new BlockError(`Unknown parameter location "${loc}": use path, query, header or cookie`, `${at}/params/${esc(loc)}`)
      }
      if (group === null) continue
      if (!isObj(group)) throw new BlockError(`\`params.${loc}\` maps names to types`, `${at}/params/${loc}`)
      declared[loc as ParamLocation] = group
    }
  }
  for (const name of Object.keys(declared.path ?? {})) {
    if (!inPath.includes(name)) throw new BlockError(`Path parameter "${name}" is not in the URL: add {${name}} to it`, `${at}/params/path/${esc(name)}`)
  }
  // Path parameters in URL order; undeclared ones are strings.
  for (const name of inPath) {
    const def = declared.path?.[name]
    out.push(def === undefined ? { name, in: 'path', required: true, schema: { type: 'string' } } : blockParameter(name, 'path', def, `${at}/params/path/${esc(name)}`))
  }
  const queryNames = new Set(Object.keys(declared.query ?? {}))
  for (const loc of ['query', 'header', 'cookie'] as const) {
    for (const [name, def] of Object.entries(declared[loc] ?? {})) out.push(blockParameter(name, loc, def, `${at}/params/${loc}/${esc(name)}`))
    // `?page=1` in the URL: a query parameter with that example, unless declared.
    if (loc === 'query' && query) {
      for (const pair of query.split('&')) {
        if (!pair) continue
        const [rawName = '', ...rest] = pair.split('=')
        const name = decode(rawName)
        if (!name || queryNames.has(name)) continue
        queryNames.add(name)
        const value = decode(rest.join('='))
        const example = /^-?\d+$/.test(value) ? Number(value) : value === 'true' || value === 'false' ? value === 'true' : value
        out.push({ name, in: 'query', schema: inferSchema(example), ...(value !== '' ? { example } : {}) })
      }
    }
  }
  return out
}

/**
 * One parameter of a block as an OpenAPI parameter object. `def` is a
 * shorthand string, null (a string), or an object of parameter fields
 * (description, required, example, style, explode, schema) and schema
 * fields (type — shorthand too —, format, enum, minimum…).
 */
export function blockParameter(name: string, loc: ParamLocation, def: unknown, at = ''): Obj {
  const p: Obj = { name, in: loc }
  if (def === null || def === undefined) {
    if (loc === 'path') p.required = true
    p.schema = { type: 'string' }
    return p
  }
  if (typeof def === 'string') {
    const sh = parseShorthand(def, at)
    if (sh.description) p.description = sh.description
    if (sh.required || loc === 'path') p.required = true
    p.schema = sh.schema
    return p
  }
  if (!isObj(def)) throw new BlockError(`Parameter "${name}" is a type (integer, string(email)!) or an object`, at)
  const schema: Obj = {}
  for (const [k, v] of Object.entries(def)) {
    if (k === 'description') p.description = str(v, `${at}/description`)
    else if (k === 'required' || k === 'deprecated' || k === 'explode') {
      if (typeof v !== 'boolean') throw new BlockError(`\`${k}\` is true or false`, `${at}/${k}`)
      if (v) p[k] = true
      else if (k === 'explode') p[k] = false
    } else if (k === 'schema') Object.assign(schema, expandSchema(v, `${at}/schema`) as Obj)
    else if (PARAM_KEYS.has(k)) p[k] = v
    else schema[k] = v
  }
  if (loc === 'path') p.required = true
  // A shorthand `type` (string(email)!, integer[]) expands; its `!` makes the parameter required.
  if (typeof schema.type === 'string') {
    const sh = parseShorthand(schema.type, `${at}/type`)
    if (sh.required) p.required = true
    if (sh.description && p.description === undefined) p.description = sh.description
    p.schema = expandSchema({ ...sh.schema, ...omit(schema, ['type']) }, at)
  } else p.schema = Object.keys(schema).length ? expandSchema(schema, at) : p.example !== undefined ? inferSchema(p.example) : { type: 'string' }
  return order(p, ['name', 'in', 'description', 'required', 'deprecated', 'style', 'explode', 'schema', 'example'])
}

function toBody(body: unknown, at: string): Obj {
  if (!isObj(body)) throw new BlockError('`body` is an object: { type, example, schema }', at)
  for (const key of Object.keys(body)) if (!BODY_KEYS.has(key)) throw new BlockError(unknownKey(key, [...BODY_KEYS]), `${at}/${esc(key)}`)
  const out: Obj = {}
  if (body.description !== undefined) out.description = str(body.description, `${at}/description`)
  if (body.required !== undefined && typeof body.required !== 'boolean') throw new BlockError('`required` is true or false', `${at}/required`)
  out.required = body.required ?? true
  out.content = { [mediaOf(body.type, `${at}/type`)]: content(body, at) }
  return out
}

function toResponses(responses: unknown, at: string): Obj {
  if (responses === undefined || responses === null) return { '200': { description: 'OK' } }
  if (!isObj(responses)) throw new BlockError('`responses` maps statuses (200, 404, default) to responses', at)
  const out: Obj = {}
  for (const [status, def] of Object.entries(responses)) {
    const where = `${at}/${esc(status)}`
    if (!/^([1-5]\d\d|[1-5]XX|default)$/i.test(status)) throw new BlockError(`"${status}" is not a status: use 200, 4XX or default`, where)
    const key = status.toUpperCase() === 'DEFAULT' ? 'default' : status.toUpperCase()
    if (def === null || def === undefined) out[key] = { description: statusReason(key) }
    else if (typeof def === 'string') out[key] = { description: def }
    else if (isObj(def)) {
      for (const k of Object.keys(def)) if (!RESPONSE_KEYS.has(k)) throw new BlockError(unknownKey(k, [...RESPONSE_KEYS]), `${where}/${esc(k)}`)
      const r: Obj = { description: def.description !== undefined ? str(def.description, `${where}/description`) : statusReason(key) }
      if (def.headers !== undefined) {
        if (!isObj(def.headers)) throw new BlockError('`headers` maps names to types', `${where}/headers`)
        r.headers = Object.fromEntries(
          Object.entries(def.headers).map(([name, h]) => [name, omit(blockParameter(name, 'header', h, `${where}/headers/${esc(name)}`), ['name', 'in'])]),
        )
      }
      if (def.example !== undefined || def.schema !== undefined || def.type !== undefined) {
        r.content = { [mediaOf(def.type, `${where}/type`)]: content(def, where) }
      }
      out[key] = r
    } else throw new BlockError(`Response ${status} is a description or an object`, where)
  }
  return out
}

function content(src: Obj, at: string): Obj {
  const mt: Obj = {}
  if (src.schema !== undefined) mt.schema = expandSchema(src.schema, `${at}/schema`)
  else if (src.example !== undefined) mt.schema = inferSchema(src.example)
  if (src.example !== undefined) mt.example = src.example
  return mt
}

function mediaOf(type: unknown, at: string): string {
  if (type === undefined) return 'application/json'
  const t = str(type, at).trim()
  const full = mediaType(t)
  if (!full.includes('/')) throw new BlockError(`Unknown media type "${t}": use json, form, multipart, text, xml, binary or a type like application/pdf`, at)
  return full
}

/** The security schemes of a block, named by their kind and shared when equal. */
class Schemes {
  private readonly byName = new Map<string, Obj>()

  get size(): number {
    return this.byName.size
  }

  toObject(): Obj {
    return Object.fromEntries(this.byName)
  }

  /** A security requirement for `auth`, 'none', or undefined for nothing. */
  add(auth: unknown, at: string): Obj | 'none' | undefined {
    const parsed = toScheme(auth, at)
    if (parsed === 'none') return 'none'
    const { scheme, base, scopes } = parsed
    const json = JSON.stringify(scheme)
    let name = base
    for (let n = 2; this.byName.has(name) && JSON.stringify(this.byName.get(name)) !== json; n++) name = `${base}${n}`
    this.byName.set(name, scheme)
    return { [name]: scopes }
  }
}

function toScheme(auth: unknown, at: string): 'none' | { scheme: Obj; base: string; scopes: string[] } {
  const spec: Obj = typeof auth === 'string' ? { type: auth } : isObj(auth) ? auth : {}
  if (typeof spec.type !== 'string') throw new BlockError(`\`auth\` is ${AUTH_TYPES.join(', ')} or an object with \`type\``, at)
  const type = spec.type.toLowerCase()
  const withDescription = (s: Obj): Obj => (typeof spec.description === 'string' ? { ...s, description: spec.description } : s)
  switch (type) {
    case 'none':
      return 'none'
    case 'bearer':
    case 'jwt': {
      const format = spec.format ?? spec.bearerFormat ?? (type === 'jwt' ? 'JWT' : undefined)
      return { scheme: withDescription({ type: 'http', scheme: 'bearer', ...(format ? { bearerFormat: String(format) } : {}) }), base: 'bearerAuth', scopes: [] }
    }
    case 'basic':
      return { scheme: withDescription({ type: 'http', scheme: 'basic' }), base: 'basicAuth', scopes: [] }
    case 'apikey': {
      const where = spec.in ?? 'header'
      if (where !== 'header' && where !== 'query' && where !== 'cookie') throw new BlockError('`in` of an API key is header, query or cookie', `${at}/in`)
      const name = spec.name === undefined ? 'X-API-Key' : str(spec.name, `${at}/name`)
      return { scheme: withDescription({ type: 'apiKey', in: where, name }), base: 'apiKeyAuth', scopes: [] }
    }
    case 'oauth2': {
      const scopes = scopeMap(spec.scopes, `${at}/scopes`)
      let flows: Obj
      if (isObj(spec.flows)) flows = spec.flows
      else {
        const authorizationUrl = spec.authorizationUrl === undefined ? undefined : str(spec.authorizationUrl, `${at}/authorizationUrl`)
        const tokenUrl = spec.tokenUrl === undefined ? undefined : str(spec.tokenUrl, `${at}/tokenUrl`)
        const flow = spec.flow === undefined ? (authorizationUrl && tokenUrl ? 'authorizationCode' : authorizationUrl ? 'implicit' : 'clientCredentials') : str(spec.flow, `${at}/flow`)
        if (!(OAUTH_FLOWS as readonly string[]).includes(flow)) throw new BlockError(`Unknown OAuth2 flow "${flow}": use ${OAUTH_FLOWS.join(', ')}`, `${at}/flow`)
        const needsAuth = flow === 'authorizationCode' || flow === 'implicit'
        const needsToken = flow !== 'implicit'
        if (needsAuth && !authorizationUrl) throw new BlockError(`The ${flow} flow needs \`authorizationUrl\``, at)
        if (needsToken && !tokenUrl) throw new BlockError(`The ${flow} flow needs \`tokenUrl\``, at)
        const f: Obj = {}
        if (needsAuth) f.authorizationUrl = authorizationUrl
        if (needsToken) f.tokenUrl = tokenUrl
        if (typeof spec.refreshUrl === 'string') f.refreshUrl = spec.refreshUrl
        f.scopes = scopes
        flows = { [flow]: f }
      }
      return { scheme: withDescription({ type: 'oauth2', flows }), base: 'oauth2', scopes: Object.keys(scopes) }
    }
    case 'openidconnect':
    case 'oidc': {
      const url = spec.url ?? spec.openIdConnectUrl
      if (typeof url !== 'string' || !url) throw new BlockError('OpenID Connect needs `url`: the discovery document', at)
      return { scheme: withDescription({ type: 'openIdConnect', openIdConnectUrl: url }), base: 'openIdConnect', scopes: scopeList(spec.scopes) }
    }
    default:
      throw new BlockError(`Unknown auth type "${spec.type}": use ${AUTH_TYPES.join(', ')}`, typeof auth === 'string' ? at : `${at}/type`)
  }
}

function scopeMap(scopes: unknown, at: string): Record<string, string> {
  if (scopes === undefined || scopes === null) return {}
  if (typeof scopes === 'string') return Object.fromEntries(scopeList(scopes).map((s) => [s, '']))
  if (Array.isArray(scopes)) return Object.fromEntries(scopes.map((s) => [String(s), '']))
  if (isObj(scopes)) return Object.fromEntries(Object.entries(scopes).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]))
  throw new BlockError('`scopes` is a list of names or a map of name → description', at)
}

function scopeList(scopes: unknown): string[] {
  if (typeof scopes === 'string') return scopes.split(/[\s,]+/).filter(Boolean)
  if (Array.isArray(scopes)) return scopes.map(String)
  if (isObj(scopes)) return Object.keys(scopes)
  return []
}

function server(url: string): Obj {
  // `{region}` in the host is a server variable.
  const names = [...url.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!)
  return names.length ? { url, variables: Object.fromEntries(names.map((n) => [n, { default: n }])) } : { url }
}

function str(v: unknown, at: string): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  throw new BlockError('Expected text here', at)
}

function optStr(v: unknown, at: string): string {
  return v === undefined || v === null ? '' : str(v, at)
}

function unknownKey(key: string, allowed: string[]): string {
  const near = allowed.find((a) => a.toLowerCase() === key.toLowerCase() || distance(a.toLowerCase(), key.toLowerCase()) <= 2)
  return `Unknown key "${key}"${near ? ` — did you mean "${near}"?` : `: use ${allowed.join(', ')}`}`
}

/** Edit distance, for "did you mean". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]!
}

function order(o: Obj, keys: string[]): Obj {
  const out: Obj = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  for (const [k, v] of Object.entries(o)) if (!(k in out)) out[k] = v
  return out
}

function omit(o: Obj, keys: string[]): Obj {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const esc = (token: string): string => token.replace(/~/g, '~0').replace(/\//g, '~1')
