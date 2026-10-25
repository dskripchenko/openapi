/**
 * Swagger 2.0 → OpenAPI 3.0 shape. The result still carries 3.0-style schemas
 * (boolean exclusive bounds, `x-nullable`, `type: file`); `upgradeDocument30`
 * finishes the job. Works on a clone the caller owns, so sub-objects of the
 * source are reused freely.
 */
import { HTTP_METHODS } from '../core/types'
import { asStringArray, copyExtensions, deepClone, isExtension, isObject, isRef, type Obj } from './util'

const PARAM_SCHEMA_KEYS = [
  'type',
  'format',
  'items',
  'default',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'maxItems',
  'minItems',
  'uniqueItems',
  'enum',
  'multipleOf',
] as const

const FORM_URLENCODED = 'application/x-www-form-urlencoded'
const MULTIPART = 'multipart/form-data'
const DEFAULT_MEDIA = 'application/json'

interface Ctx {
  src: Obj
  warnings: string[]
  consumes: string[]
  produces: string[]
  /** `#/parameters` of the source. */
  params: Obj
  /** Names of global parameters that are `in: body` (they become requestBodies). */
  bodyParams: Set<string>
}

export function convertSwagger2(src: Obj, warnings: string[]): Obj {
  const params = isObject(src.parameters) ? src.parameters : {}
  const ctx: Ctx = {
    src,
    warnings,
    consumes: nonEmpty(asStringArray(src.consumes)) ?? [DEFAULT_MEDIA],
    produces: nonEmpty(asStringArray(src.produces)) ?? [DEFAULT_MEDIA],
    params,
    bodyParams: new Set(Object.entries(params).filter(([, p]) => isObject(p) && p.in === 'body').map(([k]) => k)),
  }

  const out: Obj = { openapi: '3.0.3', info: isObject(src.info) ? src.info : { title: '', version: '' } }
  const servers = buildServers(src, asStringArray(src.schemes))
  if (servers) out.servers = servers
  for (const key of ['security', 'tags', 'externalDocs'] as const) if (src[key] !== undefined) out[key] = src[key]
  copyExtensions(src, out)

  const paths: Obj = {}
  if (isObject(src.paths)) {
    for (const [path, item] of Object.entries(src.paths)) {
      if (isExtension(path)) paths[path] = item
      else if (isObject(item)) paths[path] = convertPathItem(item, ctx, path)
    }
  }
  out.paths = paths

  const components = buildComponents(ctx)
  if (Object.keys(components).length > 0) out.components = components

  rewriteRefs(out, ctx)
  return out
}

function nonEmpty(list: string[] | undefined): string[] | undefined {
  return list && list.length > 0 ? list : undefined
}

/* ------------------------------ servers ------------------------------ */

function buildServers(src: Obj, schemes: string[] | undefined): Obj[] | undefined {
  const host = typeof src.host === 'string' && src.host !== '' ? src.host : undefined
  const basePath = typeof src.basePath === 'string' ? src.basePath : undefined
  if (host === undefined) return basePath !== undefined ? [{ url: basePath }] : undefined
  const list = nonEmpty(schemes) ?? ['https']
  return list.map((scheme) => ({ url: `${scheme}://${host}${basePath === '/' ? '' : (basePath ?? '')}` }))
}

/* ----------------------------- components ---------------------------- */

function buildComponents(ctx: Ctx): Obj {
  const { src } = ctx
  const c: Obj = {}
  if (isObject(src.definitions)) c.schemas = src.definitions

  const parameters: Obj = {}
  const requestBodies: Obj = {}
  for (const [name, p] of Object.entries(ctx.params)) {
    if (!isObject(p)) continue
    if (p.in === 'body') requestBodies[name] = bodyToRequestBody(p, ctx.consumes)
    else if (p.in === 'formData')
      ctx.warnings.push(`#/parameters/${name}: formData parameter is inlined into request bodies, not kept in components`)
    else parameters[name] = convertParameter(p, ctx, `#/parameters/${name}`)
  }
  if (Object.keys(parameters).length) c.parameters = parameters
  if (Object.keys(requestBodies).length) c.requestBodies = requestBodies

  if (isObject(src.responses)) {
    const responses: Obj = {}
    for (const [name, r] of Object.entries(src.responses))
      if (isObject(r)) responses[name] = isRef(r) ? r : convertResponse(r, ctx.produces)
    c.responses = responses
  }

  if (isObject(src.securityDefinitions)) {
    const schemes: Obj = {}
    for (const [name, d] of Object.entries(src.securityDefinitions)) {
      if (isObject(d)) schemes[name] = convertSecurityScheme(d, ctx, name)
    }
    c.securitySchemes = schemes
  }
  return c
}

function convertSecurityScheme(d: Obj, ctx: Ctx, name: string): Obj {
  const out: Obj = {}
  if (d.type === 'basic') {
    out.type = 'http'
    out.scheme = 'basic'
  } else if (d.type === 'apiKey') {
    out.type = 'apiKey'
    out.name = d.name
    out.in = d.in
  } else if (d.type === 'oauth2') {
    out.type = 'oauth2'
    const scopes = isObject(d.scopes) ? d.scopes : {}
    const flow: Obj = { scopes }
    let key: string
    switch (d.flow) {
      case 'implicit':
        key = 'implicit'
        flow.authorizationUrl = d.authorizationUrl
        break
      case 'password':
        key = 'password'
        flow.tokenUrl = d.tokenUrl
        break
      case 'application':
        key = 'clientCredentials'
        flow.tokenUrl = d.tokenUrl
        break
      case 'accessCode':
        key = 'authorizationCode'
        flow.authorizationUrl = d.authorizationUrl
        flow.tokenUrl = d.tokenUrl
        break
      default:
        ctx.warnings.push(`#/securityDefinitions/${name}: unknown oauth2 flow "${String(d.flow)}"`)
        key = 'implicit'
        flow.authorizationUrl = d.authorizationUrl
    }
    out.flows = { [key]: flow }
  } else {
    ctx.warnings.push(`#/securityDefinitions/${name}: unknown security type "${String(d.type)}"`)
    out.type = d.type
  }
  if (d.description !== undefined) out.description = d.description
  copyExtensions(d, out)
  return out
}

/* ------------------------------ parameters ---------------------------- */

/** Picks the JSON-schema keywords of a non-body parameter, header or items object. */
function paramSchema(p: Obj): Obj {
  const schema: Obj = {}
  for (const key of PARAM_SCHEMA_KEYS) {
    if (p[key] === undefined) continue
    schema[key] = key === 'items' && isObject(p.items) ? paramSchema(p.items) : p[key]
  }
  if (p['x-nullable'] !== undefined) schema['x-nullable'] = p['x-nullable']
  return schema
}

interface Style {
  style?: string
  explode?: boolean
}

function collectionStyle(p: Obj, ctx: Ctx, where: string): Style {
  if (p.type !== 'array') return {}
  const format = typeof p.collectionFormat === 'string' ? p.collectionFormat : 'csv'
  const inQuery = p.in === 'query' || p.in === 'formData'
  switch (format) {
    case 'csv':
      return inQuery ? { style: 'form', explode: false } : { style: 'simple', explode: false }
    case 'ssv':
      if (!inQuery) ctx.warnings.push(`${where}: collectionFormat "ssv" is only expressible for query parameters`)
      return { style: 'spaceDelimited', explode: false }
    case 'pipes':
      if (!inQuery) ctx.warnings.push(`${where}: collectionFormat "pipes" is only expressible for query parameters`)
      return { style: 'pipeDelimited', explode: false }
    case 'multi':
      return { style: 'form', explode: true }
    case 'tsv':
      ctx.warnings.push(`${where}: collectionFormat "tsv" has no OpenAPI 3 equivalent, treated as csv`)
      return inQuery ? { style: 'form', explode: false } : { style: 'simple', explode: false }
    default:
      ctx.warnings.push(`${where}: unknown collectionFormat "${format}"`)
      return {}
  }
}

/** A query/header/path parameter. */
function convertParameter(p: Obj, ctx: Ctx, where: string): Obj {
  const out: Obj = { name: p.name, in: p.in }
  if (p.description !== undefined) out.description = p.description
  if (p.required !== undefined) out.required = p.required
  if (p.allowEmptyValue !== undefined) out.allowEmptyValue = p.allowEmptyValue
  // The 3.0 defaults for path/header arrays are already simple + no explode.
  const style = collectionStyle(p, ctx, where)
  if (style.style !== undefined && !(style.style === 'simple' && (p.in === 'path' || p.in === 'header'))) {
    out.style = style.style
    out.explode = style.explode
  }
  out.schema = paramSchema(p)
  if (p['x-example'] !== undefined) out.example = p['x-example']
  copyExtensions(p, out)
  return out
}

function bodyToRequestBody(p: Obj, consumes: string[]): Obj {
  const out: Obj = { content: {} }
  if (p.description !== undefined) out.description = p.description
  if (p.required !== undefined) out.required = p.required
  const content: Obj = {}
  const examples = isObject(p['x-examples']) ? p['x-examples'] : {}
  consumes.forEach((mime, i) => {
    const media: Obj = {}
    if (p.schema !== undefined) media.schema = i === 0 ? p.schema : deepClone(p.schema)
    if (examples[mime] !== undefined) media.example = examples[mime]
    content[mime] = media
  })
  out.content = content
  copyExtensions(p, out)
  return out
}

function formDataToRequestBody(params: Obj[], consumes: string[], ctx: Ctx, where: string): Obj {
  const hasFile = params.some((p) => p.type === 'file')
  const declared = consumes.filter((m) => m === FORM_URLENCODED || m === MULTIPART)
  const mimes = hasFile ? [MULTIPART] : declared.length ? declared : [FORM_URLENCODED]
  if (hasFile && declared.length && !declared.includes(MULTIPART))
    ctx.warnings.push(`${where}: file parameters require multipart/form-data`)

  const properties: Obj = {}
  const required: string[] = []
  const encoding: Obj = {}
  for (const p of params) {
    const name = String(p.name)
    const schema = p.type === 'file' ? { type: 'string', format: 'binary' } : paramSchema(p)
    if (p.description !== undefined) (schema as Obj).description = p.description
    properties[name] = schema
    if (p.required === true) required.push(name)
    const style = collectionStyle(p, ctx, `${where}/${name}`)
    if (style.style !== undefined) encoding[name] = style
  }
  const schema: Obj = { type: 'object', properties }
  if (required.length) schema.required = required

  const content: Obj = {}
  mimes.forEach((mime, i) => {
    const media: Obj = { schema: i === 0 ? schema : deepClone(schema) }
    if (Object.keys(encoding).length) media.encoding = deepClone(encoding)
    content[mime] = media
  })
  const out: Obj = { content }
  if (required.length) out.required = true
  return out
}

/* ------------------------------- paths -------------------------------- */

/** Resolves a parameter ref against `#/parameters` (only local ones). */
function lookupParam(p: unknown, ctx: Ctx): Obj | undefined {
  if (!isRef(p)) return isObject(p) ? p : undefined
  const m = /^#\/parameters\/(.+)$/.exec(p.$ref)
  if (!m) return undefined
  const target = ctx.params[decodeToken(m[1] ?? '')]
  return isObject(target) ? target : undefined
}

function decodeToken(token: string): string {
  let t = token
  try {
    t = decodeURIComponent(t)
  } catch {
    /* keep raw */
  }
  return t.replace(/~1/g, '/').replace(/~0/g, '~')
}

function paramKey(p: Obj): string {
  return `${String(p.in)}:${String(p.name)}`
}

function convertPathItem(item: Obj, ctx: Ctx, path: string): Obj {
  const out: Obj = {}
  const where = `#/paths/${path}`
  // Path-level body/formData move into each operation's requestBody.
  const shared: unknown[] = []
  const pathLevel: unknown[] = []
  if (Array.isArray(item.parameters)) {
    for (const p of item.parameters) {
      const resolved = lookupParam(p, ctx)
      if (resolved && (resolved.in === 'body' || resolved.in === 'formData')) shared.push(p)
      else pathLevel.push(isRef(p) ? p : isObject(p) ? convertParameter(p, ctx, `${where}/parameters`) : p)
    }
  }
  for (const [key, value] of Object.entries(item)) {
    if (key === 'parameters') {
      if (pathLevel.length) out.parameters = pathLevel
    } else if ((HTTP_METHODS as readonly string[]).includes(key) && isObject(value)) {
      out[key] = convertOperation(value, shared, ctx, `${where}/${key}`)
    } else if (key === '$ref' || isExtension(key)) {
      out[key] = value
    }
  }
  return out
}

function convertOperation(op: Obj, shared: unknown[], ctx: Ctx, where: string): Obj {
  const out: Obj = {}
  for (const key of ['tags', 'summary', 'description', 'externalDocs', 'operationId'] as const)
    if (op[key] !== undefined) out[key] = op[key]

  const ownConsumes = nonEmpty(asStringArray(op.consumes))
  const consumes = ownConsumes ?? ctx.consumes
  const produces = nonEmpty(asStringArray(op.produces)) ?? ctx.produces

  // Merge path-level body/formData that the operation does not override.
  const own = Array.isArray(op.parameters) ? op.parameters : []
  const ownKeys = new Set(own.map((p) => lookupParam(p, ctx)).filter((p): p is Obj => !!p).map(paramKey))
  const all = [...shared.filter((p) => !ownKeys.has(paramKey(lookupParam(p, ctx) ?? {}))), ...own]

  const parameters: unknown[] = []
  const formData: Obj[] = []
  let requestBody: Obj | undefined
  for (const p of all) {
    const resolved = lookupParam(p, ctx)
    if (resolved?.in === 'body') {
      // A global body parameter stays a reference unless the operation changes the media types.
      requestBody =
        isRef(p) && !ownConsumes && p.$ref.startsWith('#/parameters/')
          ? { $ref: p.$ref }
          : bodyToRequestBody(resolved, consumes)
    } else if (resolved?.in === 'formData') {
      formData.push(resolved)
    } else if (isRef(p)) {
      parameters.push(p)
    } else if (isObject(p)) {
      parameters.push(convertParameter(p, ctx, `${where}/parameters`))
    }
  }
  if (formData.length) {
    if (requestBody) ctx.warnings.push(`${where}: both body and formData parameters; formData wins`)
    requestBody = formDataToRequestBody(formData, consumes, ctx, where)
  }
  if (parameters.length) out.parameters = parameters
  if (requestBody) out.requestBody = requestBody

  if (isObject(op.responses)) {
    const responses: Obj = {}
    for (const [code, r] of Object.entries(op.responses)) {
      if (isExtension(code)) responses[code] = r
      else if (isRef(r)) responses[code] = r
      else if (isObject(r)) responses[code] = convertResponse(r, produces)
    }
    out.responses = responses
  }

  if (op.deprecated !== undefined) out.deprecated = op.deprecated
  if (op.security !== undefined) out.security = op.security
  const schemes = nonEmpty(asStringArray(op.schemes))
  if (schemes) {
    const servers = buildServers(ctx.src, schemes)
    if (servers) out.servers = servers
  }
  copyExtensions(op, out)
  return out
}

/* ------------------------------ responses ----------------------------- */

function convertResponse(r: Obj, produces: string[]): Obj {
  const out: Obj = { description: typeof r.description === 'string' ? r.description : '' }
  if (isObject(r.headers)) {
    const headers: Obj = {}
    for (const [name, h] of Object.entries(r.headers)) {
      if (!isObject(h)) continue
      const header: Obj = {}
      if (h.description !== undefined) header.description = h.description
      header.schema = paramSchema(h)
      copyExtensions(h, header)
      headers[name] = header
    }
    out.headers = headers
  }

  const content: Obj = {}
  if (r.schema !== undefined) {
    produces.forEach((mime, i) => {
      content[mime] = { schema: i === 0 ? r.schema : deepClone(r.schema) }
    })
  }
  if (isObject(r.examples)) {
    for (const [mime, value] of Object.entries(r.examples)) {
      let media = content[mime]
      if (!isObject(media)) {
        media = r.schema !== undefined ? { schema: deepClone(r.schema) } : {}
        content[mime] = media
      }
      ;(media as Obj).example = value
    }
  }
  if (Object.keys(content).length) out.content = content
  copyExtensions(r, out)
  return out
}

/* -------------------------------- refs -------------------------------- */

/** Rewrites 2.0 ref targets to their 3.x locations, everywhere in the tree. */
function rewriteRefs(root: unknown, ctx: Ctx): void {
  const seen = new Set<unknown>()
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const obj = node as Obj
    if (typeof obj.$ref === 'string') obj.$ref = rewriteRef(obj.$ref, ctx)
    for (const value of Object.values(obj)) visit(value)
  }
  visit(root)
}

export function rewriteRef(ref: string, ctx: Pick<Ctx, 'bodyParams'>): string {
  const hash = ref.indexOf('#')
  if (hash < 0) return ref
  const base = ref.slice(0, hash)
  const fragment = ref.slice(hash)
  let m: RegExpExecArray | null
  if ((m = /^#\/definitions\/(.*)$/.exec(fragment))) return `${base}#/components/schemas/${m[1]}`
  if ((m = /^#\/responses\/(.*)$/.exec(fragment))) return `${base}#/components/responses/${m[1]}`
  if ((m = /^#\/parameters\/(.*)$/.exec(fragment))) {
    const name = decodeToken(m[1] ?? '')
    const section = base === '' && ctx.bodyParams.has(name) ? 'requestBodies' : 'parameters'
    return `${base}#/components/${section}/${m[1]}`
  }
  return ref
}
