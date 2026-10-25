/**
 * TypeScript declarations for operations and whole documents: the request
 * parameters by location, the request body, the responses by status and
 * their headers, plus the component schemas they reach, so a snippet
 * compiles on its own.
 */
import type { Header, MediaType, Parameter, RequestBody, Response } from '../core/types'
import type { LoadedSpec, OperationEntry } from '../model'
import { isPlainObject } from '../schema/util'
import { jsdoc, propertyKey, typeName } from './names'
import { createTsContext, declare, declareType, docLines, isTextualMedia, printSchema, type PrintedType, type TsContext } from './schema'

export interface OperationTypeNames {
  /** The PascalCase stem every name starts with: the operationId, else method and path. */
  base: string
  pathParams?: string
  queryParams?: string
  headers?: string
  cookies?: string
  /** The request body: one type, or the union of `requestBodies` when media types differ. */
  requestBody?: string
  /** Per media type, present only when the media types carry different types. */
  requestBodies?: Record<string, string>
  /** The union of the 2xx bodies; `void` when none has a body. */
  response: string
  /** Per status code (`200`, `4XX`, `default`) with a body. */
  responses: Record<string, string>
  /** Per status code (and media type) when one status has different types per media type. */
  responseBodies: Record<string, Record<string, string>>
  /** Response headers per status code. */
  responseHeaders: Record<string, string>
  /** Every name above, in the order of the code. */
  all: string[]
}

export interface OperationTypes {
  names: OperationTypeNames
  /** The declarations, then the component types they reach (by name), ready to paste. */
  code: string
}

export interface OperationTypesOptions {
  /** False leaves out the component types the operation refers to. Default true. */
  components?: boolean
}

/** What follows a stem in the generated names. */
const SUFFIX = /^(PathParams|QueryParams|Headers|Cookies|RequestBody\w*|Response\w*)$/

/** Whether `name` is `stem` plus an operation suffix: a name the stem's types could take. */
const extends_ = (name: string, stem: string): boolean => name.startsWith(stem) && SUFFIX.test(name.slice(stem.length))

/** Two operation stems clash when equal or when one is the other plus a suffix. */
const stemsClash = (a: string, b: string): boolean => a === b || extends_(a, b) || extends_(b, a)

/** The fallback stem: method and path (`GetPetsPetId`), for a webhook `Webhook` + method + name. */
function fallbackStem(entry: OperationEntry): string {
  return typeName(entry.webhook !== undefined ? `webhook ${entry.method} ${entry.webhook}` : `${entry.method} ${entry.path}`)
}

/**
 * Name stems of every operation of the document, in document order: unique,
 * and never such that a component name is the stem plus an operation suffix
 * (a component `PetsResponse` moves the operation `pets` to `Pets2`).
 */
function operationStems(spec: LoadedSpec, ctx: TsContext, extra?: OperationEntry): Map<OperationEntry, string> {
  const stems = new Map<OperationEntry, string>()
  const assigned: string[] = []
  const entries = extra && !spec.operations.includes(extra) ? [...spec.operations, extra] : spec.operations
  for (const entry of entries) {
    const opId = entry.operation.operationId
    const base = (typeof opId === 'string' && typeName(opId)) || fallbackStem(entry) || 'Operation'
    let stem = base
    for (let n = 2; [...ctx.taken].some((t) => extends_(t, stem)) || assigned.some((t) => stemsClash(t, stem)); n++) stem = `${base}${n}`
    assigned.push(stem)
    stems.set(entry, stem)
  }
  return stems
}

const LOCATIONS = [
  ['path', 'PathParams', 'pathParams'],
  ['query', 'QueryParams', 'queryParams'],
  ['header', 'Headers', 'headers'],
  ['cookie', 'Cookies', 'cookies'],
] as const

/** A short suffix for a media type: `Json`, `Xml`, `FormData`, `Form`, `Text`, `Binary`, else its PascalCase subtype. */
function mediaSuffix(mediaType: string): string {
  const type = mediaType.split(';')[0]!.trim().toLowerCase()
  const known: Record<string, string> = {
    'application/json': 'Json',
    'application/xml': 'Xml',
    'text/xml': 'Xml',
    'multipart/form-data': 'FormData',
    'application/x-www-form-urlencoded': 'Form',
    'text/plain': 'Text',
    'application/octet-stream': 'Binary',
  }
  if (known[type]) return known[type]
  const [main = '', sub = ''] = type.split('/')
  return typeName(sub === '*' || sub === '' ? (main === '*' ? 'any' : main) : sub) || 'Body'
}

/** A media type's body type: its schema, else `Blob` for binary media and `unknown` for the rest. */
function mediaType(ctx: TsContext, type: string, media: MediaType | undefined): PrintedType {
  if (isPlainObject(media) && media.schema !== undefined) return printSchema(media.schema, ctx)
  return { text: isTextualMedia(type) ? 'unknown' : 'Blob', prec: 2 }
}

/** A parameter or header's type: from its schema, else from its first `content` entry. */
function valueType(ctx: TsContext, p: Parameter | Header, level: number): string {
  if (p.schema !== undefined) return printSchema(p.schema, ctx, level).text
  const [type, media] = Object.entries(isPlainObject(p.content) ? p.content : {})[0] ?? []
  return type ? (media?.schema !== undefined ? printSchema(media.schema, ctx, level).text : isTextualMedia(type) ? 'unknown' : 'Blob') : 'unknown'
}

/** An interface of named values (parameters or headers). */
function valuesInterface(name: string, values: { name: string; value: Parameter | Header; required: boolean }[], ctx: TsContext, doc: string[] = []): string {
  const members = values.map(({ name: key, value, required }) => {
    const lines = docLines(value.schema, {
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      ...(value.deprecated === true ? { deprecated: true } : {}),
      ...(value.example !== undefined ? { example: value.example } : {}),
    })
    return `${jsdoc(lines, '  ')}  ${propertyKey(key)}${required ? '' : '?'}: ${valueType(ctx, value, 1)}`
  })
  return declare(name, { text: `{\n${members.join('\n')}\n}`, prec: 2, object: true }, doc)
}

/**
 * The bodies of one request body or response, by media type: one declaration
 * `name` when every media type gives the same type, else `name` + suffix per
 * media type and `name` as their union.
 */
function bodyDeclarations(
  name: string,
  content: Record<string, MediaType>,
  ctx: TsContext,
  doc: string[],
): { decls: string[]; names: string[]; perMedia?: Record<string, string> } {
  const types = Object.keys(content)
  const printed = types.map((t) => mediaType(ctx, t, content[t]))
  const mediaLine = `Media type: ${types.join(', ')}.`
  if (new Set(printed.map((p) => p.text)).size <= 1) {
    return { decls: [declare(name, printed[0]!, [...doc, mediaLine])], names: [name] }
  }
  const perMedia: Record<string, string> = {}
  const used = new Set<string>()
  const decls: string[] = []
  types.forEach((type, i) => {
    const base = `${name}${mediaSuffix(type)}`
    let part = base
    for (let n = 2; used.has(part); n++) part = `${base}${n}`
    used.add(part)
    perMedia[type] = part
    decls.push(declare(part, printed[i]!, [`Media type: ${type}.`]))
  })
  const union = Object.values(perMedia).join(' | ')
  decls.unshift(declare(name, { text: union, prec: 0 }, doc))
  return { decls, names: [name, ...Object.values(perMedia)], perMedia }
}

/** The status part of a name: `200`, `4XX`, `Default`. */
const statusName = (code: string): string => (code === 'default' ? 'Default' : code.toUpperCase().replace(/[^0-9A-Z]/g, ''))

/** Declarations of one operation, against a shared context; the stem is chosen by the caller. */
function declareOperation(spec: LoadedSpec, entry: OperationEntry, stem: string, ctx: TsContext): { names: OperationTypeNames; decls: string[] } {
  const deref = <T>(v: unknown): T | undefined => spec.resolver.deref(v as never) as T | undefined
  const names: OperationTypeNames = { base: stem, response: `${stem}Response`, responses: {}, responseBodies: {}, responseHeaders: {}, all: [] }
  const decls: string[] = []

  for (const [loc, suffix, key] of LOCATIONS) {
    const params = entry.parameters.filter((p) => p.in === loc)
    if (!params.length) continue
    const name = `${stem}${suffix}`
    decls.push(valuesInterface(name, params.map((p) => ({ name: p.name, value: p, required: loc === 'path' || p.required === true })), ctx))
    names[key] = name
    names.all.push(name)
  }

  const body = deref<RequestBody>(entry.operation.requestBody)
  if (isPlainObject(body?.content) && Object.keys(body.content).length) {
    const doc: string[] = []
    if (typeof body.description === 'string' && body.description.trim()) doc.push(body.description.trim())
    if (body.required !== true) doc.push('Optional: the request may go without a body.')
    const out = bodyDeclarations(`${stem}RequestBody`, body.content, ctx, doc)
    decls.push(...out.decls)
    names.requestBody = `${stem}RequestBody`
    if (out.perMedia) names.requestBodies = out.perMedia
    names.all.push(...out.names)
  }

  const responseDecls: string[] = []
  const responseNames: string[] = []
  const success: string[] = []
  for (const [code, raw] of Object.entries(entry.operation.responses ?? {})) {
    if (code.startsWith('x-')) continue
    const response = deref<Response>(raw)
    if (!isPlainObject(response)) continue
    const name = `${stem}Response${statusName(code)}`
    const description = typeof response.description === 'string' ? response.description.trim() : ''
    if (isPlainObject(response.content) && Object.keys(response.content).length) {
      const out = bodyDeclarations(name, response.content, ctx, [description ? `${code}: ${description}` : `The ${code} response.`])
      responseDecls.push(...out.decls)
      names.responses[code] = name
      if (out.perMedia) names.responseBodies[code] = out.perMedia
      responseNames.push(...out.names)
      if (code.startsWith('2')) success.push(name)
    }
    const headers = Object.entries(isPlainObject(response.headers) ? response.headers : {})
      .filter(([h]) => h.toLowerCase() !== 'content-type')
      .map(([h, raw]) => ({ name: h, value: deref<Header>(raw) }))
      .filter((h): h is { name: string; value: Header } => isPlainObject(h.value))
    if (headers.length) {
      const headersName = `${name}Headers`
      responseDecls.push(valuesInterface(headersName, headers.map((h) => ({ ...h, required: h.value.required === true })), ctx, [`Headers of the ${code} response.`]))
      names.responseHeaders[code] = headersName
      responseNames.push(headersName)
    }
  }
  // The union of the 2xx bodies comes before the per-status types.
  decls.push(declare(names.response, { text: success.length ? success.join(' | ') : 'void', prec: success.length > 1 ? 0 : 2 }, [success.length ? 'The body of a successful (2xx) response.' : 'No successful (2xx) response has a body.']))
  names.all.push(names.response, ...responseNames)
  decls.push(...responseDecls)
  return { names, decls }
}

/** Declarations of the components reached through `ctx.used` (transitively), sorted by name. */
function componentDeclarations(ctx: TsContext, skip: Set<string> = new Set()): string[] {
  const done = new Set<string>(skip)
  const out: { name: string; code: string }[] = []
  for (let pending = [...ctx.used].filter((r) => !done.has(r)); pending.length; pending = [...ctx.used].filter((r) => !done.has(r))) {
    for (const ref of pending) {
      done.add(ref)
      const name = ctx.nameOf(ref)
      if (name) out.push({ name, code: declareType(name, ctx.resolve(ref), ctx) })
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((d) => d.code)
}

/**
 * The TypeScript types of one operation: `{Op}PathParams`, `{Op}QueryParams`,
 * `{Op}Headers`, `{Op}Cookies`, `{Op}RequestBody`, `{Op}Response` (2xx union),
 * `{Op}Response{code}` and `{Op}Response{code}Headers` — only those that
 * exist — then the component schemas they reach, alphabetically.
 */
export function operationTypes(spec: LoadedSpec, entry: OperationEntry, opts: OperationTypesOptions = {}): OperationTypes {
  const ctx = createTsContext(spec.document)
  // An entry from another load of the same document is matched by method and path.
  const own = spec.operations.find((o) => o === entry) ?? spec.operations.find((o) => o.method === entry.method && o.path === entry.path && o.webhook === entry.webhook)
  const stem = operationStems(spec, ctx, own ?? entry).get(own ?? entry)!
  const { names, decls } = declareOperation(spec, entry, stem, ctx)
  const components = opts.components === false ? [] : componentDeclarations(ctx)
  return { names, code: `${[...decls, ...components].join('\n\n')}\n` }
}

/**
 * The whole document as one module: a header, every component schema
 * (alphabetically), then every operation's types in document order. Names
 * match what `operationTypes` gives for the same operation.
 */
export function documentTypes(spec: LoadedSpec): string {
  const ctx = createTsContext(spec.document)
  const info = spec.document.info ?? { title: '', version: '' }
  const title = [info.title, info.version].filter((s) => typeof s === 'string' && s).join(' ')
  const head = jsdoc([...(title ? [title] : []), 'Generated by @dskripchenko/openapi from the OpenAPI document. Do not edit.'], '')

  const schemas = isPlainObject(spec.document.components?.schemas) ? spec.document.components.schemas : {}
  const refs = Object.keys(schemas).map((key) => `#/components/schemas/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`)
  for (const ref of refs) ctx.used.add(ref)
  const sections: string[] = []
  const components = componentDeclarations(ctx)
  if (components.length) sections.push(`// Schemas\n\n${components.join('\n\n')}`)

  const stems = operationStems(spec, ctx)
  const done = new Set(ctx.used)
  for (const entry of spec.operations) {
    const { decls } = declareOperation(spec, entry, stems.get(entry)!, ctx)
    const where = entry.webhook !== undefined ? `webhook ${entry.webhook} (${entry.method.toUpperCase()})` : `${entry.method.toUpperCase()} ${entry.path}`
    sections.push(`// ${entry.id}: ${where}\n\n${decls.join('\n\n')}`)
  }
  // Refs that are not components (inlined) never land here; this only catches stragglers.
  const rest = componentDeclarations(ctx, done)
  if (rest.length) sections.push(rest.join('\n\n'))
  return `${head}\n${sections.join('\n\n')}\n`
}
