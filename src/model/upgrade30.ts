/**
 * OpenAPI 3.0 → 3.1: rewrites every schema in the document to JSON Schema
 * 2020-12 (nullable, boolean exclusive bounds, `example`, `type: file`).
 * Works in place: the caller hands over its own clone.
 */
import { HTTP_METHODS } from '../core/types'
import { isObject, isRef, type Obj } from './util'

const SCHEMA_MAPS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'] as const
const SCHEMA_SINGLES = [
  'items',
  'additionalProperties',
  'not',
  'contains',
  'if',
  'then',
  'else',
  'propertyNames',
  'additionalItems',
  'unevaluatedItems',
  'unevaluatedProperties',
] as const
const SCHEMA_LISTS = ['allOf', 'oneOf', 'anyOf', 'prefixItems', 'items'] as const

/** Upgrades one schema (and everything nested in it); returns the replacement. */
export function upgradeSchema30(schema: unknown, memo: Map<Obj, Obj> = docMemo ?? new Map()): unknown {
  if (!isObject(schema)) return schema
  return upgradeNode(schema, memo)
}

/** Shared during one document walk so aliased schemas get the same replacement. */
let docMemo: Map<Obj, Obj> | undefined

function upgradeNode(s: Obj, seen: Map<Obj, Obj>): Obj {
  // Shared or cyclic nodes are upgraded once.
  const known = seen.get(s)
  if (known) return known
  seen.set(s, s)
  const result = transform(s, seen)
  seen.set(s, result)
  return result
}

function transform(s: Obj, seen: Map<Obj, Obj>): Obj {
  for (const key of SCHEMA_MAPS) {
    const map = s[key]
    if (isObject(map)) for (const [name, sub] of Object.entries(map)) if (isObject(sub)) map[name] = upgradeNode(sub, seen)
  }
  for (const key of SCHEMA_SINGLES) {
    const sub = s[key]
    if (isObject(sub)) s[key] = upgradeNode(sub, seen)
  }
  for (const key of SCHEMA_LISTS) {
    const list = s[key]
    if (Array.isArray(list)) list.forEach((sub, i) => isObject(sub) && (list[i] = upgradeNode(sub, seen)))
  }

  // type: file (Swagger 2.0 leftovers) → binary string.
  if (s.type === 'file') {
    s.type = 'string'
    s.format ??= 'binary'
  } else if (Array.isArray(s.type) && s.type.includes('file')) {
    s.type = s.type.map((t) => (t === 'file' ? 'string' : t))
    s.format ??= 'binary'
  }

  // Boolean exclusive bounds → numeric form.
  for (const [flag, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof s[flag] === 'boolean') {
      if (s[flag] === true && typeof s[bound] === 'number') {
        s[flag] = s[bound]
        delete s[bound]
      } else {
        delete s[flag]
      }
    }
  }

  // example → also examples: [example].
  if ('example' in s && s.examples === undefined) s.examples = [s.example]

  // nullable (and Swagger's x-nullable) → 'null' in the type.
  const nullable = s.nullable === true || s['x-nullable'] === true
  delete s.nullable
  delete s['x-nullable']
  if (nullable) return makeNullable(s)
  return s
}

function makeNullable(s: Obj): Obj {
  if (typeof s.type === 'string') {
    if (s.type !== 'null') s.type = [s.type, 'null']
    addNullToEnum(s)
    return s
  }
  if (Array.isArray(s.type)) {
    if (!s.type.includes('null')) s.type = [...s.type, 'null']
    addNullToEnum(s)
    return s
  }
  // No type: a $ref or a composition.
  if (typeof s.$ref === 'string' || Array.isArray(s.allOf)) {
    const { description, title, default: dflt, readOnly, writeOnly, deprecated, ...rest } = s
    const out: Obj = { anyOf: [rest, { type: 'null' }] }
    if (description !== undefined) out.description = description
    if (title !== undefined) out.title = title
    if (dflt !== undefined) out.default = dflt
    if (readOnly !== undefined) out.readOnly = readOnly
    if (writeOnly !== undefined) out.writeOnly = writeOnly
    if (deprecated !== undefined) out.deprecated = deprecated
    return out
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    const list = s[key]
    if (Array.isArray(list)) {
      if (!list.some((b) => isObject(b) && b.type === 'null')) list.push({ type: 'null' })
      return s
    }
  }
  addNullToEnum(s)
  // A schema without a type already accepts null.
  return s
}

function addNullToEnum(s: Obj): void {
  if (Array.isArray(s.enum) && !s.enum.includes(null)) s.enum.push(null)
}

/* --------------------------- document walk --------------------------- */

/** Upgrades all schemas of an OpenAPI 3.0 document in place. */
export function upgradeDocument30(doc: Obj): void {
  docMemo = new Map()
  try {
    walkDocument(doc)
  } finally {
    docMemo = undefined
  }
}

function walkDocument(doc: Obj): void {
  if (isObject(doc.paths)) for (const item of Object.values(doc.paths)) pathItem(item)
  if (isObject(doc.webhooks)) for (const item of Object.values(doc.webhooks)) pathItem(item)
  const c = doc.components
  if (!isObject(c)) return
  if (isObject(c.schemas)) for (const [k, s] of Object.entries(c.schemas)) c.schemas[k] = upgradeSchema30(s)
  eachValue(c.parameters, parameter)
  eachValue(c.headers, parameter)
  eachValue(c.requestBodies, requestBody)
  eachValue(c.responses, response)
  eachValue(c.callbacks, callback)
  eachValue(c.pathItems, pathItem)
}

function eachValue(map: unknown, fn: (value: unknown) => void): void {
  if (isObject(map)) for (const value of Object.values(map)) fn(value)
}

function pathItem(item: unknown): void {
  if (!isObject(item)) return
  if (Array.isArray(item.parameters)) item.parameters.forEach(parameter)
  for (const method of HTTP_METHODS) if (isObject(item[method])) operation(item[method])
}

function operation(op: Obj): void {
  if (Array.isArray(op.parameters)) op.parameters.forEach(parameter)
  requestBody(op.requestBody)
  eachValue(op.responses, response)
  eachValue(op.callbacks, callback)
}

function callback(cb: unknown): void {
  if (!isObject(cb) || isRef(cb)) return
  for (const item of Object.values(cb)) pathItem(item)
}

/** Parameters and headers share the shape. */
function parameter(p: unknown): void {
  if (!isObject(p) || isRef(p)) return
  if (isObject(p.schema)) p.schema = upgradeSchema30(p.schema)
  content(p.content)
}

function requestBody(body: unknown): void {
  if (!isObject(body) || isRef(body)) return
  content(body.content)
}

function response(r: unknown): void {
  if (!isObject(r) || isRef(r)) return
  eachValue(r.headers, parameter)
  content(r.content)
}

function content(map: unknown): void {
  if (!isObject(map)) return
  for (const media of Object.values(map)) {
    if (!isObject(media)) continue
    if (isObject(media.schema)) media.schema = upgradeSchema30(media.schema)
    if (isObject(media.encoding))
      for (const enc of Object.values(media.encoding)) if (isObject(enc)) eachValue(enc.headers, parameter)
  }
}
