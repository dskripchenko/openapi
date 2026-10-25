/**
 * Structural validation of a raw (not normalized) Swagger 2.0 / OpenAPI 3.0 /
 * OpenAPI 3.1 document. It checks the shape a renderer relies on, not every
 * rule of the specification, and never throws.
 */
import type { PositionMap } from '../core/types'
import { HTTP_METHODS } from '../core/types'
import { detectVersion, type SpecFamily } from '../model/detect'
import { OpenApiError } from '../model/errors'
import { fragmentToPointer, isExtension, isObject, isRef, joinPointer, walkPointer, type Obj } from '../model/util'

export interface DocumentIssue {
  /** JSON Pointer into the raw document ('' is the root). */
  pointer: string
  message: string
  severity: 'error' | 'warning'
  line?: number
  column?: number
}

export interface ValidateOptions {
  positions?: PositionMap
}

const TOP_LEVEL: Record<SpecFamily, string[]> = {
  swagger2: [
    'swagger',
    'info',
    'host',
    'basePath',
    'schemes',
    'consumes',
    'produces',
    'paths',
    'definitions',
    'parameters',
    'responses',
    'securityDefinitions',
    'security',
    'tags',
    'externalDocs',
  ],
  openapi30: ['openapi', 'info', 'servers', 'paths', 'components', 'security', 'tags', 'externalDocs'],
  openapi31: [
    'openapi',
    'info',
    'jsonSchemaDialect',
    'servers',
    'paths',
    'webhooks',
    'components',
    'security',
    'tags',
    'externalDocs',
  ],
}

const PARAM_IN: Record<SpecFamily, string[]> = {
  swagger2: ['query', 'header', 'path', 'formData', 'body'],
  openapi30: ['query', 'header', 'path', 'cookie'],
  openapi31: ['query', 'header', 'path', 'cookie'],
}

const PATH_ITEM_FIELDS = ['$ref', 'summary', 'description', 'servers', 'parameters']
const STATUS_CODE = /^([1-5]\d\d|[1-5]XX|default)$/

type Kind = 'object' | 'array' | 'string'

class Checker {
  readonly issues: DocumentIssue[] = []
  readonly operationIds = new Map<string, string>()
  declaredTags = new Set<string>()
  securitySchemes = new Set<string>()

  constructor(
    readonly raw: Obj,
    readonly family: SpecFamily,
    readonly positions: PositionMap | undefined,
  ) {}

  add(pointer: string, message: string, severity: 'error' | 'warning' = 'error'): void {
    const issue: DocumentIssue = { pointer, message, severity }
    const pos = this.position(pointer)
    if (pos) {
      issue.line = pos.line
      issue.column = pos.column
    }
    this.issues.push(issue)
  }

  /** Position of the pointer, or of its nearest ancestor that has one. */
  position(pointer: string): { line: number; column: number } | undefined {
    if (!this.positions) return undefined
    let p = pointer
    for (;;) {
      const pos = this.positions.get(p)
      if (pos) return pos
      if (p === '') return undefined
      p = p.slice(0, p.lastIndexOf('/'))
    }
  }

  /** Checks the type of a field; false when present with a wrong type. */
  type(value: unknown, kind: Kind, pointer: string, what: string): boolean {
    if (value === undefined) return true
    const ok = kind === 'object' ? isObject(value) : kind === 'array' ? Array.isArray(value) : typeof value === 'string'
    if (!ok) this.add(pointer, `${what} must be ${kind === 'array' ? 'an array' : `a${kind === 'object' ? 'n' : ''} ${kind}`}`)
    return ok
  }

  required(obj: Obj, key: string, kind: Kind, base: string, what: string): void {
    if (obj[key] === undefined) this.add(base, `${what} is required`)
    else this.type(obj[key], kind, joinPointer(base, key), what)
  }

  /** Follows a local ref inside the raw document (one level of chains is fine). */
  resolve(value: unknown): unknown {
    let current = value
    for (let i = 0; i < 20 && isRef(current); i++) {
      if (!current.$ref.startsWith('#')) return undefined
      current = walkPointer(this.raw, fragmentToPointer(current.$ref))
    }
    return isRef(current) ? undefined : current
  }
}

export function validateDocument(raw: unknown, opts: ValidateOptions = {}): DocumentIssue[] {
  let family: SpecFamily
  try {
    family = detectVersion(raw).family
  } catch (e) {
    const issue: DocumentIssue = {
      pointer: '',
      message: e instanceof OpenApiError ? e.message : 'Not an OpenAPI document',
      severity: 'error',
    }
    const pos = opts.positions?.get('')
    if (pos) Object.assign(issue, pos)
    return [issue]
  }
  const doc = raw as Obj
  const c = new Checker(doc, family, opts.positions)

  // Top-level fields.
  for (const key of Object.keys(doc)) {
    if (!isExtension(key) && !TOP_LEVEL[family].includes(key))
      c.add(joinPointer('', key), `Unknown top-level field "${key}"`, 'warning')
  }

  // info
  if (doc.info === undefined) c.add('', 'info is required')
  else if (c.type(doc.info, 'object', '/info', 'info')) {
    const info = doc.info as Obj
    c.required(info, 'title', 'string', '/info', 'info.title')
    c.required(info, 'version', 'string', '/info', 'info.version')
  }

  // Simple typed fields.
  c.type(doc.externalDocs, 'object', '/externalDocs', 'externalDocs')
  c.type(doc.security, 'array', '/security', 'security')
  if (family === 'swagger2') {
    for (const key of ['schemes', 'consumes', 'produces'] as const) c.type(doc[key], 'array', `/${key}`, key)
    for (const key of ['definitions', 'parameters', 'responses', 'securityDefinitions'] as const)
      c.type(doc[key], 'object', `/${key}`, key)
    c.type(doc.host, 'string', '/host', 'host')
    c.type(doc.basePath, 'string', '/basePath', 'basePath')
  } else {
    if (c.type(doc.components, 'object', '/components', 'components')) {
      const comps = (doc.components ?? {}) as Obj
      for (const [key, value] of Object.entries(comps))
        if (!isExtension(key)) c.type(value, 'object', joinPointer('/components', key), `components.${key}`)
    }
    checkServers(c, doc.servers, '/servers')
  }

  // Declared tags and security schemes.
  if (c.type(doc.tags, 'array', '/tags', 'tags') && Array.isArray(doc.tags)) {
    doc.tags.forEach((tag, i) => {
      const ptr = joinPointer('/tags', i)
      if (!c.type(tag, 'object', ptr, 'tag') || !isObject(tag)) return
      if (typeof tag.name !== 'string') c.add(ptr, 'tag.name is required')
      else if (c.declaredTags.has(tag.name)) c.add(joinPointer(ptr, 'name'), `Duplicate tag "${tag.name}"`, 'warning')
      else c.declaredTags.add(tag.name)
    })
  }
  const schemesMap =
    family === 'swagger2' ? doc.securityDefinitions : isObject(doc.components) ? doc.components.securitySchemes : undefined
  const schemesBase = family === 'swagger2' ? '/securityDefinitions' : '/components/securitySchemes'
  if (isObject(schemesMap)) {
    for (const [name, scheme] of Object.entries(schemesMap)) {
      c.securitySchemes.add(name)
      checkSecurityScheme(c, scheme, joinPointer(schemesBase, name))
    }
  }
  checkSecurity(c, doc.security, '/security')

  // paths / webhooks
  if (doc.paths === undefined) {
    if (family !== 'openapi31') c.add('', 'paths is required')
    else if (doc.components === undefined && doc.webhooks === undefined)
      c.add('', 'One of paths, components or webhooks is required')
  } else if (c.type(doc.paths, 'object', '/paths', 'paths')) {
    for (const [path, item] of Object.entries(doc.paths as Obj)) {
      if (isExtension(path)) continue
      const ptr = joinPointer('/paths', path)
      if (!path.startsWith('/')) c.add(ptr, `Path "${path}" must start with "/"`)
      checkPathItem(c, item, ptr, path)
    }
  }
  if (family === 'openapi31' && c.type(doc.webhooks, 'object', '/webhooks', 'webhooks') && isObject(doc.webhooks)) {
    for (const [name, item] of Object.entries(doc.webhooks)) checkPathItem(c, item, joinPointer('/webhooks', name), null)
  }
  if (family !== 'swagger2' && isObject(doc.components) && isObject(doc.components.pathItems)) {
    for (const [name, item] of Object.entries(doc.components.pathItems))
      checkPathItem(c, item, joinPointer('/components/pathItems', name), null)
  }

  checkRefs(c)
  return c.issues
}

/* ------------------------------- servers ------------------------------ */

function checkServers(c: Checker, servers: unknown, base: string): void {
  if (!c.type(servers, 'array', base, 'servers') || !Array.isArray(servers)) return
  servers.forEach((server, i) => {
    const ptr = joinPointer(base, i)
    if (!c.type(server, 'object', ptr, 'server') || !isObject(server)) return
    if (typeof server.url !== 'string') {
      c.add(ptr, 'server.url is required')
      return
    }
    const variables = isObject(server.variables) ? server.variables : {}
    c.type(server.variables, 'object', joinPointer(ptr, 'variables'), 'server.variables')
    for (const m of server.url.matchAll(/\{([^}]+)\}/g)) {
      const name = m[1] ?? ''
      if (!(name in variables)) c.add(joinPointer(ptr, 'url'), `Server variable "${name}" is not defined`)
    }
    for (const [name, v] of Object.entries(variables)) {
      const vp = joinPointer(ptr, 'variables', name)
      if (!isObject(v)) c.add(vp, 'server variable must be an object')
      else if (typeof v.default !== 'string') c.add(vp, `Server variable "${name}" needs a string default`)
    }
  })
}

/* ------------------------------ security ------------------------------ */

function checkSecurityScheme(c: Checker, scheme: unknown, ptr: string): void {
  if (isRef(scheme)) return
  if (!c.type(scheme, 'object', ptr, 'security scheme') || !isObject(scheme)) return
  const types =
    c.family === 'swagger2'
      ? ['basic', 'apiKey', 'oauth2']
      : ['apiKey', 'http', 'oauth2', 'openIdConnect', ...(c.family === 'openapi31' ? ['mutualTLS'] : [])]
  if (typeof scheme.type !== 'string') c.add(ptr, 'security scheme type is required')
  else if (!types.includes(scheme.type)) c.add(joinPointer(ptr, 'type'), `Unknown security scheme type "${scheme.type}"`)
  if (scheme.type === 'apiKey') {
    if (typeof scheme.name !== 'string') c.add(ptr, 'apiKey security scheme needs name')
    if (typeof scheme.in !== 'string') c.add(ptr, 'apiKey security scheme needs in')
  }
  if (scheme.type === 'http' && typeof scheme.scheme !== 'string') c.add(ptr, 'http security scheme needs scheme')
  if (scheme.type === 'oauth2' && c.family !== 'swagger2' && !isObject(scheme.flows))
    c.add(ptr, 'oauth2 security scheme needs flows')
  if (scheme.type === 'openIdConnect' && typeof scheme.openIdConnectUrl !== 'string')
    c.add(ptr, 'openIdConnect security scheme needs openIdConnectUrl')
}

function checkSecurity(c: Checker, security: unknown, base: string): void {
  if (!Array.isArray(security)) return
  security.forEach((req, i) => {
    const ptr = joinPointer(base, i)
    if (!c.type(req, 'object', ptr, 'security requirement') || !isObject(req)) return
    for (const [name, scopes] of Object.entries(req)) {
      if (!c.securitySchemes.has(name)) c.add(joinPointer(ptr, name), `Security scheme "${name}" is not defined`)
      c.type(scopes, 'array', joinPointer(ptr, name), 'security scopes')
    }
  })
}

/* -------------------------------- paths ------------------------------- */

/** `template` is the path for `paths` entries, null where templates don't apply. */
function checkPathItem(c: Checker, item: unknown, ptr: string, template: string | null): void {
  if (!c.type(item, 'object', ptr, 'path item') || !isObject(item)) return
  const methods = HTTP_METHODS as readonly string[]
  for (const key of Object.keys(item)) {
    if (isExtension(key) || methods.includes(key)) continue
    if (PATH_ITEM_FIELDS.includes(key) && !(key === 'servers' && c.family === 'swagger2')) continue
    const lower = key.toLowerCase()
    c.add(
      joinPointer(ptr, key),
      methods.includes(lower) ? `HTTP method "${key}" must be lower case` : `Unknown field or HTTP method "${key}"`,
      'warning',
    )
  }
  if (c.family !== 'swagger2') checkServers(c, item.servers, joinPointer(ptr, 'servers'))

  const shared = checkParameters(c, item.parameters, joinPointer(ptr, 'parameters'))
  for (const method of methods) {
    const op = item[method]
    if (op === undefined) continue
    const opPtr = joinPointer(ptr, method)
    if (!c.type(op, 'object', opPtr, 'operation') || !isObject(op)) continue
    const own = checkOperation(c, op, opPtr)
    if (template !== null) checkTemplate(c, template, opPtr, shared, own)
  }
}

interface ParamInfo {
  name: string
  in: string
  pointer: string
}

function checkParameters(c: Checker, params: unknown, base: string): ParamInfo[] {
  const out: ParamInfo[] = []
  if (!c.type(params, 'array', base, 'parameters') || !Array.isArray(params)) return out
  const seen = new Set<string>()
  params.forEach((raw, i) => {
    const ptr = joinPointer(base, i)
    const p = c.resolve(raw)
    if (p === undefined) return // a broken ref is reported by checkRefs
    if (!c.type(p, 'object', ptr, 'parameter') || !isObject(p)) return
    // Shape problems of a referenced parameter belong to its definition.
    const own = !isRef(raw)
    if (typeof p.name !== 'string') {
      if (own) c.add(ptr, 'parameter.name is required')
      return
    }
    if (typeof p.in !== 'string') {
      if (own) c.add(ptr, 'parameter.in is required')
      return
    }
    if (own && !PARAM_IN[c.family].includes(p.in)) c.add(joinPointer(ptr, 'in'), `Invalid parameter location "${p.in}"`)
    if (own && p.in === 'path' && p.required !== true)
      c.add(ptr, `Path parameter "${p.name}" must have required: true`)
    const key = `${p.in}:${p.name}`
    if (seen.has(key)) c.add(ptr, `Duplicate parameter "${p.name}" in ${p.in}`)
    seen.add(key)
    out.push({ name: p.name, in: p.in, pointer: ptr })
  })
  return out
}

function checkOperation(c: Checker, op: Obj, ptr: string): ParamInfo[] {
  if (op.operationId !== undefined && c.type(op.operationId, 'string', joinPointer(ptr, 'operationId'), 'operationId')) {
    const id = op.operationId as string
    const first = c.operationIds.get(id)
    if (first !== undefined) c.add(joinPointer(ptr, 'operationId'), `Duplicate operationId "${id}" (first at ${first})`)
    else c.operationIds.set(id, ptr)
  }

  if (c.type(op.tags, 'array', joinPointer(ptr, 'tags'), 'tags') && Array.isArray(op.tags)) {
    op.tags.forEach((tag, i) => {
      const tp = joinPointer(ptr, 'tags', i)
      if (typeof tag !== 'string') c.add(tp, 'tag must be a string')
      else if (!c.declaredTags.has(tag)) {
        // Allowed by the spec, so one warning per tag, at its first use — not one per operation.
        c.add(tp, `Tag "${tag}" is not declared in the top-level tags`, 'warning')
        c.declaredTags.add(tag)
      }
    })
  }

  const params = checkParameters(c, op.parameters, joinPointer(ptr, 'parameters'))

  if (op.responses === undefined) {
    if (c.family !== 'openapi31') c.add(ptr, 'responses is required')
  } else if (c.type(op.responses, 'object', joinPointer(ptr, 'responses'), 'responses')) {
    const responses = op.responses as Obj
    if (Object.keys(responses).filter((k) => !isExtension(k)).length === 0 && c.family !== 'openapi31')
      c.add(joinPointer(ptr, 'responses'), 'responses must contain at least one response')
    for (const [code, r] of Object.entries(responses)) {
      if (isExtension(code)) continue
      const rp = joinPointer(ptr, 'responses', code)
      if (!STATUS_CODE.test(code)) c.add(rp, `Invalid status code "${code}"`)
      checkResponse(c, r, rp)
    }
  }

  checkSecurity(c, op.security, joinPointer(ptr, 'security'))
  if (c.family !== 'swagger2') {
    checkServers(c, op.servers, joinPointer(ptr, 'servers'))
    if (isObject(op.callbacks)) {
      for (const [name, cb] of Object.entries(op.callbacks)) {
        if (isRef(cb) || !isObject(cb)) continue
        for (const [expr, item] of Object.entries(cb))
          if (!isExtension(expr)) checkPathItem(c, item, joinPointer(ptr, 'callbacks', name, expr), null)
      }
    }
  }
  return params
}

function checkResponse(c: Checker, raw: unknown, ptr: string): void {
  if (isRef(raw)) return
  if (!c.type(raw, 'object', ptr, 'response') || !isObject(raw)) return
  if (raw.description === undefined) c.add(ptr, 'response.description is required')
  else c.type(raw.description, 'string', joinPointer(ptr, 'description'), 'response.description')
  c.type(raw.headers, 'object', joinPointer(ptr, 'headers'), 'headers')
  if (c.family !== 'swagger2') c.type(raw.content, 'object', joinPointer(ptr, 'content'), 'content')
}

function checkTemplate(c: Checker, template: string, opPtr: string, shared: ParamInfo[], own: ParamInfo[]): void {
  const names = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '')
  // Operation-level parameters override path-level ones by name+in.
  const merged = new Map<string, ParamInfo>()
  for (const p of [...shared, ...own]) merged.set(`${p.in}:${p.name}`, p)
  const pathParams = [...merged.values()].filter((p) => p.in === 'path')
  for (const name of names) {
    if (!pathParams.some((p) => p.name === name))
      c.add(opPtr, `Path parameter "${name}" of "${template}" is not defined`)
  }
  for (const p of pathParams) {
    if (!names.includes(p.name)) c.add(p.pointer, `Path parameter "${p.name}" does not appear in "${template}"`)
  }
}

/* -------------------------------- refs -------------------------------- */

/** Keys that hold data (samples, defaults) rather than document structure. */
const DATA_KEYS = new Set(['example', 'x-example', 'x-examples', 'default', 'enum', 'const'])
/** Maps whose keys are user names, so a key like "example" there is not a data key. */
const NAME_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'schemas'])

/** Every local `$ref` must point at something. */
function checkRefs(c: Checker): void {
  const seen = new Set<unknown>()
  const checkRef = (obj: Obj, ptr: string): void => {
    if (typeof obj.$ref === 'string') {
      if (obj.$ref.startsWith('#') && walkPointer(c.raw, fragmentToPointer(obj.$ref)) === undefined)
        c.add(joinPointer(ptr, '$ref'), `Reference "${obj.$ref}" does not resolve`)
    }
  }
  const visit = (node: unknown, ptr: string, parentKey: string): void => {
    if (typeof node !== 'object' || node === null || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, joinPointer(ptr, i), ''))
      return
    }
    const obj = node as Obj
    checkRef(obj, ptr)
    const names = NAME_MAPS.has(parentKey)
    for (const [key, value] of Object.entries(obj)) {
      const vp = joinPointer(ptr, key)
      if (!names && DATA_KEYS.has(key)) continue
      if (!names && key === 'examples') {
        // Schema examples are an array of samples; an OpenAPI examples map holds Example objects or refs.
        if (isObject(value)) for (const [name, ex] of Object.entries(value)) if (isObject(ex)) checkRef(ex, joinPointer(vp, name))
        continue
      }
      visit(value, vp, names ? '' : key)
    }
  }
  visit(c.raw, '', '')
}
