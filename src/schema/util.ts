/**
 * Helpers shared by sample, validate, describe and the XML sampler:
 * reference names, type inference, numeric bounds (3.0 and 3.1 styles),
 * deep equality and a shallow schema merge for `allOf`.
 */
import type { Schema } from '../core/types'

/** Looks up a `$ref` (e.g. `#/components/schemas/Pet`); never fetches. */
export type Resolver = (ref: string) => Schema | undefined

export type Mode = 'request' | 'response'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The last segment of a reference, JSON-Pointer-unescaped: `#/components/schemas/Pet` → `Pet`. */
export function refName(ref: string): string {
  const segment = ref.slice(ref.lastIndexOf('/') + 1)
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // keep the raw segment
  }
  return decoded.replace(/~1/g, '/').replace(/~0/g, '~')
}

/** Appends a key to a JSON Pointer. */
export function pointer(base: string, key: string | number): string {
  return `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b)
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

/** A JSON-safe deep copy, so callers can mutate samples without touching the spec. */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = clone(v)
    return out as T
  }
  return value
}

export interface Bounds {
  min?: number
  minExclusive: boolean
  max?: number
  maxExclusive: boolean
}

/** Numeric bounds, accepting both 3.1 numeric and 3.0 boolean `exclusiveMinimum/Maximum`. */
export function bounds(schema: Schema): Bounds {
  const raw = schema as Record<string, unknown>
  const out: Bounds = { minExclusive: false, maxExclusive: false }
  if (typeof schema.minimum === 'number') out.min = schema.minimum
  if (typeof raw.exclusiveMinimum === 'number') {
    if (out.min === undefined || raw.exclusiveMinimum >= out.min) {
      out.min = raw.exclusiveMinimum
      out.minExclusive = true
    }
  } else if (raw.exclusiveMinimum === true && out.min !== undefined) {
    out.minExclusive = true
  }
  if (typeof schema.maximum === 'number') out.max = schema.maximum
  if (typeof raw.exclusiveMaximum === 'number') {
    if (out.max === undefined || raw.exclusiveMaximum <= out.max) {
      out.max = raw.exclusiveMaximum
      out.maxExclusive = true
    }
  } else if (raw.exclusiveMaximum === true && out.max !== undefined) {
    out.maxExclusive = true
  }
  return out
}

const OBJECT_KEYS = [
  'properties',
  'additionalProperties',
  'patternProperties',
  'required',
  'minProperties',
  'maxProperties',
  'propertyNames',
  'dependentRequired',
]
const ARRAY_KEYS = ['items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'contains']
const STRING_KEYS = ['minLength', 'maxLength', 'pattern', 'contentEncoding', 'contentMediaType']
const NUMBER_KEYS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']
const NUMBER_FORMATS: Record<string, string> = { int32: 'integer', int64: 'integer', float: 'number', double: 'number' }

function typeOfValue(value: unknown): string | undefined {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'object') return typeof value
  return undefined
}

/** The first non-null type named by `type`, or `'null'` when only null is named. */
export function declaredType(schema: Schema): string | undefined {
  const t = schema.type
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return t.find((x) => x !== 'null') ?? (t.length ? 'null' : undefined)
  return undefined
}

/** Infers a type from the keywords alone (no `type`, no composition). */
export function keywordType(schema: Schema): string | undefined {
  const has = (keys: string[]) => keys.some((k) => (schema as Record<string, unknown>)[k] !== undefined)
  if (has(OBJECT_KEYS)) return 'object'
  if (has(ARRAY_KEYS)) return 'array'
  if (typeof schema.format === 'string' && NUMBER_FORMATS[schema.format]) return NUMBER_FORMATS[schema.format]
  if (has(STRING_KEYS) || typeof schema.format === 'string') return 'string'
  if (has(NUMBER_KEYS)) return 'number'
  if (schema.const !== undefined) return typeOfValue(schema.const)
  if (Array.isArray(schema.enum) && schema.enum.length) return typeOfValue(schema.enum[0])
  return undefined
}

/** Best-effort type of a schema, following refs and composition (cycle-safe). */
export function inferType(schema: Schema | undefined, resolve?: Resolver, seen: Set<string> = new Set()): string | undefined {
  if (!isPlainObject(schema)) return undefined
  const declared = declaredType(schema)
  if (declared) return declared
  if (typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return undefined
    seen.add(schema.$ref)
    const t = inferType(resolve?.(schema.$ref), resolve, seen)
    if (t) return t
  }
  const kw = keywordType(schema)
  if (kw) return kw
  if (schema.allOf?.length) {
    const types = schema.allOf.map((s) => inferType(s, resolve, seen))
    if (types.includes('object')) return 'object'
    const t = types.find((x) => x !== undefined)
    if (t) return t
  }
  const branches = schema.oneOf ?? schema.anyOf
  if (branches?.length) {
    const types = branches.map((s) => inferType(s, resolve, seen))
    const t = types.find((x) => x !== undefined && x !== 'null') ?? types.find((x) => x !== undefined)
    if (t) return t
  }
  if (schema.nullable === true) return 'null'
  return undefined
}

/** Follows a `$ref` chain; sibling keywords override the target (3.1 semantics). */
export function deref(schema: Schema, resolve?: Resolver, seen: Set<string> = new Set()): Schema {
  let current = schema
  while (isPlainObject(current) && typeof current.$ref === 'string') {
    const ref = current.$ref
    if (seen.has(ref)) return {}
    seen.add(ref)
    const target = resolve?.(ref)
    if (!isPlainObject(target)) return {}
    const { $ref: _ignored, ...rest } = current
    void _ignored
    current = { ...target, ...rest }
  }
  return current
}

/** Merges schemas (for `allOf`): properties and required combine, bounds take the stricter value. */
export function mergeSchemas(list: Schema[], resolve?: Resolver, seen: Set<string> = new Set()): Schema {
  const out: Record<string, unknown> = {}
  const props: Record<string, Schema> = {}
  const required = new Set<string>()
  let hasProps = false
  const maxKeys = ['minimum', 'minLength', 'minItems', 'minProperties']
  const minKeys = ['maximum', 'maxLength', 'maxItems', 'maxProperties']

  const visit = (input: Schema) => {
    const s = deref(input, resolve, new Set(seen))
    if (!isPlainObject(s)) return
    const { allOf, ...rest } = s
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue
      if (key === 'properties' && isPlainObject(value)) {
        hasProps = true
        for (const [name, ps] of Object.entries(value as Record<string, Schema>)) {
          const prev = props[name]
          props[name] = prev ? { allOf: [prev, ps] } : ps
        }
      } else if (key === 'required' && Array.isArray(value)) {
        for (const r of value) required.add(String(r))
      } else if (maxKeys.includes(key) && typeof value === 'number' && typeof out[key] === 'number') {
        out[key] = Math.max(out[key] as number, value)
      } else if (minKeys.includes(key) && typeof value === 'number' && typeof out[key] === 'number') {
        out[key] = Math.min(out[key] as number, value)
      } else if (!(key in out)) {
        out[key] = value
      }
    }
    if (Array.isArray(allOf)) for (const branch of allOf) visit(branch)
  }
  for (const s of list) visit(s)
  if (hasProps) out.properties = props
  if (required.size) out.required = [...required]
  return out as Schema
}

/** A schema with refs followed and `allOf` merged: what the XML sampler and describe inspect. */
export function effective(schema: Schema, resolve?: Resolver): Schema {
  const s = deref(schema, resolve)
  return s.allOf?.length ? mergeSchemas([s], resolve) : s
}

/** True when the schema (through refs and allOf) carries `readOnly`/`writeOnly`. */
export function hasFlag(schema: Schema, flag: 'readOnly' | 'writeOnly', resolve?: Resolver, seen: Set<string> = new Set()): boolean {
  if (!isPlainObject(schema)) return false
  if (schema[flag] === true) return true
  if (typeof schema.$ref === 'string' && !seen.has(schema.$ref)) {
    seen.add(schema.$ref)
    const target = resolve?.(schema.$ref)
    if (target && hasFlag(target, flag, resolve, seen)) return true
  }
  return !!schema.allOf?.some((s) => hasFlag(s, flag, resolve, seen))
}

/** True when a property should be hidden/forbidden in this direction. */
export function skippedInMode(schema: Schema, mode: Mode | undefined, resolve?: Resolver): boolean {
  if (mode === 'request') return hasFlag(schema, 'readOnly', resolve)
  if (mode === 'response') return hasFlag(schema, 'writeOnly', resolve)
  return false
}

/** The discriminator value naming a branch: its mapping key, else the schema name. */
export function discriminatorKey(discriminator: { mapping?: Record<string, string> }, ref: string): string {
  const name = refName(ref)
  for (const [key, target] of Object.entries(discriminator.mapping ?? {})) {
    if (target === ref || target === name || refName(target) === name) return key
  }
  return name
}

const regexCache = new Map<string, RegExp | null>()

/** Compiles a schema `pattern` with the unicode flag; invalid patterns give `null`. */
export function compilePattern(pattern: string): RegExp | null {
  let re = regexCache.get(pattern)
  if (re !== undefined) return re
  try {
    re = new RegExp(pattern, 'u')
  } catch {
    try {
      re = new RegExp(pattern)
    } catch {
      re = null
    }
  }
  regexCache.set(pattern, re)
  return re
}

export function codePointLength(s: string): number {
  return Array.from(s).length
}
