/**
 * The model behind the JSON body form: how a schema becomes nested fields.
 * Refs are followed and `allOf` merged; `oneOf`/`anyOf` become variants to
 * choose from; read-only properties are left out, as in a request.
 */
import type { MediaType, Schema } from '../core/types'
import { sample } from '../schema'
import {
  discriminatorKey,
  effective,
  hasFlag,
  inferType,
  isPlainObject,
  mergeSchemas,
  refName,
  type Resolver,
} from '../schema/util'

/** How a node is edited: fields, a list, name/value rows, one input, or JSON text. */
export type NodeKind = 'object' | 'array' | 'map' | 'scalar' | 'any'

export interface Variant {
  label: string
  /** The branch merged with the keywords next to `oneOf`/`anyOf`. */
  schema: Schema
}

export interface FormNode {
  /** The schema as resolved; for variants, the shared part. */
  schema: Schema
  kind: NodeKind
  /** Two or more `oneOf`/`anyOf` branches (a null branch only makes the node nullable). */
  variants?: Variant[]
  /** How the variants are told apart, when the spec says. */
  discriminator?: Schema['discriminator']
}

export interface FormProperty {
  name: string
  schema: Schema
  required: boolean
}

const isNullOnly = (s: Schema | undefined, resolve?: Resolver): boolean => {
  if (!isPlainObject(s)) return false
  const e = effective(s, resolve)
  return e.type === 'null' || (Array.isArray(e.type) && e.type.length === 1 && e.type[0] === 'null')
}

/** The keywords next to `oneOf`/`anyOf`, which every branch shares. */
function shared(s: Schema): Schema {
  const { oneOf: _o, anyOf: _a, discriminator: _d, ...rest } = s
  void _o
  void _a
  void _d
  return rest
}

function withShared(base: Schema, branch: Schema, resolve?: Resolver): Schema {
  const keys = Object.keys(base).filter((k) => !['title', 'description', 'nullable', 'type'].includes(k))
  return effective(keys.length ? mergeSchemas([base, branch], resolve) : branch, resolve)
}

function variantLabel(branch: Schema, index: number, s: Schema, resolve?: Resolver): string {
  if (typeof branch.$ref === 'string') return s.discriminator ? discriminatorKey(s.discriminator, branch.$ref) : refName(branch.$ref)
  const e = effective(branch, resolve)
  if (typeof e.title === 'string' && e.title) return e.title
  if (e.const !== undefined) return String(e.const)
  return inferType(e, resolve) ?? `#${index + 1}`
}

/** The kind of a resolved schema (no variants). */
export function kindOf(s: Schema, resolve?: Resolver): NodeKind {
  const type = inferType(s, resolve)
  if (type === 'object') return s.properties && Object.keys(s.properties).length ? 'object' : 'map'
  if (type === 'array') return 'array'
  if (type === 'string' || type === 'integer' || type === 'number' || type === 'boolean') return 'scalar'
  return 'any'
}

/** Resolves a schema into a form node: refs, allOf, and a choice of variants. */
export function formNode(schema: Schema, resolve?: Resolver): FormNode {
  const s = effective(schema, resolve)
  const branches = (s.oneOf ?? s.anyOf)?.filter((b) => !isNullOnly(b, resolve))
  if (branches?.length) {
    const base = shared(s)
    if (branches.length === 1) {
      const one = withShared(base, branches[0]!, resolve)
      return { schema: one, kind: kindOf(one, resolve) }
    }
    return {
      schema: base,
      kind: 'any',
      ...(s.discriminator ? { discriminator: s.discriminator } : {}),
      variants: branches.map((b, i) => ({ label: variantLabel(b, i, s, resolve), schema: withShared(base, b, resolve) })),
    }
  }
  return { schema: s, kind: kindOf(s, resolve) }
}

/** The properties a request may set, in order: read-only ones are left out. */
export function formProperties(s: Schema, resolve?: Resolver): FormProperty[] {
  const required = new Set(s.required ?? [])
  return Object.entries(s.properties ?? {})
    .filter(([, p]) => !hasFlag(p, 'readOnly', resolve))
    .map(([name, p]) => ({ name, schema: p, required: required.has(name) }))
}

/** The schema of a map's values: `additionalProperties`, else anything. */
export function mapValueSchema(s: Schema): Schema {
  return isPlainObject(s.additionalProperties) ? s.additionalProperties : {}
}

/** The schema of an array's items, else anything. */
export function itemSchema(s: Schema): Schema {
  return isPlainObject(s.items) ? s.items : {}
}

/** A fresh value for a new item, property or variant: the sample a request would get. */
export function initialValue(schema: Schema, resolve?: Resolver): unknown {
  return sample(schema, { resolve, mode: 'request' })
}

/**
 * The variant a value belongs to: by the discriminator when there is one,
 * else the branch whose type matches and that knows most of the value's
 * properties. -1 when nothing matches.
 */
export function matchVariant(value: unknown, node: FormNode, resolve?: Resolver): number {
  const variants = node.variants ?? []
  const discriminator = node.discriminator
  if (value === undefined || value === null) return -1
  if (discriminator && isPlainObject(value)) {
    const key = value[discriminator.propertyName]
    const at = variants.findIndex((v) => {
      if (v.label === key) return true
      const prop = v.schema.properties?.[discriminator.propertyName]
      const p = prop ? effective(prop, resolve) : undefined
      return p !== undefined && (p.const === key || (Array.isArray(p.enum) && p.enum.includes(key)))
    })
    if (at >= 0) return at
  }
  const actual = Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value === 'number' ? 'number' : typeof value
  let best = -1
  let bestScore = -1
  variants.forEach((v, i) => {
    const t = inferType(v.schema, resolve)
    const fits = t === actual || (actual === 'number' && t === 'integer' && Number.isInteger(value)) || t === undefined
    if (!fits) return
    let score = t === actual ? 1 : 0
    if (isPlainObject(value) && v.schema.properties) {
      const props = v.schema.properties
      const keys = Object.keys(value)
      const known = keys.filter((k) => k in props).length
      const missing = (v.schema.required ?? []).filter((r) => !(r in value)).length
      // Every property that matches a const decides it outright.
      const consts = keys.every((k) => {
        const p = props[k] ? effective(props[k], resolve) : undefined
        return p?.const === undefined || p.const === value[k]
      })
      score += known * 2 - missing - (keys.length - known) + (consts ? 0 : -100)
    }
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  })
  return best
}

/** True for a JSON media type: `application/json`, `…+json`. */
export function isJsonMediaType(mediaType: string): boolean {
  return /^[^;]*[/+]json\s*(;|$)/i.test(mediaType)
}

/** The schema of a JSON body that is edited as a form: an object, an array, or variants of them. */
export function bodyFormSchema(mediaType: string, media: MediaType | undefined, resolve?: Resolver): Schema | undefined {
  if (!media?.schema || !isJsonMediaType(mediaType)) return undefined
  const node = formNode(media.schema, resolve)
  if (node.variants) return node.variants.some((v) => ['object', 'map', 'array'].includes(kindOf(v.schema, resolve))) ? media.schema : undefined
  return node.kind === 'object' || node.kind === 'array' || node.kind === 'map' ? media.schema : undefined
}

/** Sets or removes (`undefined`) a key of an object value, returning a new object. */
export function withKey(value: unknown, key: string, next: unknown): Record<string, unknown> {
  const out = { ...(isPlainObject(value) ? value : {}) }
  if (next === undefined) delete out[key]
  else out[key] = next
  return out
}

/** Renames a key of an object value in place of order; a taken name is refused (same object back). */
export function renameKey(value: Record<string, unknown>, from: string, to: string): Record<string, unknown> {
  if (from === to || to in value) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k === from ? to : k] = v
  return out
}

/** A key not used yet: `key`, `key2`, `key3`… */
export function freeKey(value: Record<string, unknown>, base = 'key'): string {
  if (!(base in value)) return base
  let n = 2
  while (`${base}${n}` in value) n++
  return `${base}${n}`
}
