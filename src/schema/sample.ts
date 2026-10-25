/**
 * Deterministic example values for a schema, for documentation and try-it
 * bodies. Sources in order: `example`, `examples[0]`, `default`, `const`,
 * `enum[0]`, then generation by type. No randomness and no clock: the same
 * schema always yields the same sample.
 */
import type { Schema } from '../core/types'
import { samplePattern } from './pattern'
import {
  type Mode,
  type Resolver,
  bounds,
  clone,
  compilePattern,
  codePointLength,
  declaredType,
  deepEqual,
  deref,
  discriminatorKey,
  inferType,
  isPlainObject,
  keywordType,
  mergeSchemas,
  refName,
  skippedInMode,
} from './util'
import { validate } from './validate'

export interface SampleOptions {
  resolve?: Resolver
  /** `request` drops readOnly properties, `response` drops writeOnly ones. */
  mode?: Mode
  /** Object/array nesting limit; deeper levels become `{}` / `[]`. Default 8. */
  maxDepth?: number
  /** Use `example`/`examples` when present. Default true. */
  preferExamples?: boolean
}

/** Fixed values per string format. */
export const FORMAT_SAMPLES: Record<string, string> = {
  'date-time': '2024-01-01T12:00:00Z',
  date: '2024-01-01',
  time: '12:00:00Z',
  duration: 'P1D',
  email: 'user@example.com',
  'idn-email': 'user@example.com',
  hostname: 'example.com',
  'idn-hostname': 'example.com',
  ipv4: '192.168.0.1',
  ipv6: '2001:db8::1',
  uri: 'https://example.com',
  'uri-reference': '/path',
  'uri-template': 'https://example.com/{id}',
  iri: 'https://example.com',
  'iri-reference': '/path',
  url: 'https://example.com',
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  byte: 'c3RyaW5n',
  binary: 'string',
  password: 'password',
  regex: '^[a-z]+$',
  'json-pointer': '/path/to/value',
  'relative-json-pointer': '0/path',
}

/** A value cut off by a cycle or the depth limit; arrays and optional properties drop it. */
class Cut {
  constructor(readonly value: unknown) {}
}

interface Ctx {
  resolve?: Resolver
  mode?: Mode
  maxDepth: number
  preferExamples: boolean
  /** Refs on the current path, for cycle detection. */
  stack: string[]
}

export function sample(schema: Schema, opts: SampleOptions = {}): unknown {
  const ctx: Ctx = {
    resolve: opts.resolve,
    mode: opts.mode,
    maxDepth: opts.maxDepth ?? 8,
    preferExamples: opts.preferExamples ?? true,
    stack: [],
  }
  return unwrap(gen(schema, ctx, 0))
}

function unwrap(value: unknown): unknown {
  return value instanceof Cut ? value.value : value
}

function cutFor(schema: Schema | undefined, ctx: Ctx): Cut {
  const t = inferType(schema, ctx.resolve)
  return new Cut(t === 'object' ? {} : t === 'array' ? [] : undefined)
}

/** Keywords that only document and never shape a value. */
const DOC_KEYS = new Set(['title', 'description', 'deprecated', 'externalDocs', 'xml', 'readOnly', 'writeOnly', '$comment'])

function hasShape(schema: Schema): boolean {
  return Object.keys(schema).some((k) => !DOC_KEYS.has(k) && !k.startsWith('x-') && schema[k] !== undefined)
}

function literal(schema: Schema, ctx: Ctx): { value: unknown } | undefined {
  if (ctx.preferExamples) {
    if (schema.example !== undefined) return { value: schema.example }
    if (Array.isArray(schema.examples) && schema.examples.length) return { value: schema.examples[0] }
  }
  if (schema.default !== undefined) return { value: schema.default }
  if (schema.const !== undefined) return { value: schema.const }
  if (Array.isArray(schema.enum) && schema.enum.length) return { value: schema.enum[0] }
  return undefined
}

function gen(schema: Schema, ctx: Ctx, depth: number, name?: string): unknown {
  if (!isPlainObject(schema)) return undefined
  const lit = literal(schema, ctx)
  if (lit) return clone(lit.value)

  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref
    const target = ctx.resolve?.(ref)
    if (ctx.stack.includes(ref)) return cutFor(target, ctx)
    if (!isPlainObject(target)) return {}
    const { $ref: _ref, ...rest } = schema
    void _ref
    ctx.stack.push(ref)
    try {
      return gen(hasShape(rest) ? { ...target, ...rest } : target, ctx, depth, ref)
    } finally {
      ctx.stack.pop()
    }
  }

  if (schema.allOf?.length) return genAllOf(schema, ctx, depth, name)

  const branches = schema.oneOf ?? schema.anyOf
  if (branches?.length) return genChoice(schema, branches, ctx, depth, name)

  const type = declaredType(schema) ?? keywordType(schema) ?? (schema.nullable === true ? 'null' : undefined)
  switch (type) {
    case 'null':
      return null
    case 'boolean':
      return true
    case 'integer':
      return genNumber(schema, true)
    case 'number':
      return genNumber(schema, false)
    case 'string':
      return genString(schema)
    case 'array':
      return genArray(schema, ctx, depth)
    case 'object':
      return genObject(schema, ctx, depth)
    default:
      return {}
  }
}

function genAllOf(schema: Schema, ctx: Ctx, depth: number, name?: string): unknown {
  const { allOf, ...rest } = schema
  const parts: Schema[] = hasShape(rest) ? [rest, ...(allOf ?? [])] : [...(allOf ?? [])]
  if (inferType(schema, ctx.resolve) !== 'object') {
    // Scalars and arrays: merge the schemas, then sample once.
    return gen(mergeSchemas(parts, ctx.resolve, new Set(ctx.stack)), ctx, depth, name)
  }
  const out: Record<string, unknown> = {}
  let cut = true
  for (const part of parts) {
    const v = gen(part, ctx, depth)
    if (!(v instanceof Cut)) cut = false
    const value = unwrap(v)
    if (isPlainObject(value)) deepMerge(out, value)
  }
  // A base schema with a discriminator (`Cat: allOf [Pet, …]`): name the concrete schema.
  if (name) {
    for (const part of parts) {
      const d = deref(part, ctx.resolve).discriminator
      if (d?.propertyName) out[d.propertyName] = discriminatorKey(d, name)
    }
  }
  return cut && parts.length ? new Cut(out) : out
}

function genChoice(schema: Schema, branches: Schema[], ctx: Ctx, depth: number, name?: string): unknown {
  const { oneOf: _o, anyOf: _a, discriminator, ...rest } = schema
  void _o
  void _a
  // Prefer a branch that is not plain `null`.
  const branch = branches.find((b) => inferType(b, ctx.resolve) !== 'null') ?? branches[0]!
  const v = hasShape(rest) ? gen({ allOf: [rest, branch] }, ctx, depth, name) : gen(branch, ctx, depth)
  const value = unwrap(v)
  if (discriminator?.propertyName && isPlainObject(value) && typeof branch.$ref === 'string') {
    value[discriminator.propertyName] = discriminatorKey(discriminator, branch.$ref)
  }
  return v
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(source)) {
    const prev = target[k]
    if (isPlainObject(prev) && isPlainObject(v)) deepMerge(prev, v)
    else target[k] = v
  }
}

function genNumber(schema: Schema, integer: boolean): number {
  const b = bounds(schema)
  const m = typeof schema.multipleOf === 'number' && schema.multipleOf > 0 ? schema.multipleOf : undefined
  const inRange = (x: number) =>
    (b.min === undefined || (b.minExclusive ? x > b.min : x >= b.min)) &&
    (b.max === undefined || (b.maxExclusive ? x < b.max : x <= b.max))
  const step = m ?? 1

  let v = 0
  if (!inRange(0)) {
    if (b.min !== undefined) {
      v = b.minExclusive ? b.min + step : b.min
      if (!inRange(v) && b.max !== undefined) v = (b.min + b.max) / 2
    } else if (b.max !== undefined) {
      v = b.maxExclusive ? b.max - step : b.max
    }
  }
  const round = (x: number) => parseFloat(x.toFixed(10))
  if (m !== undefined) {
    const k = Math.ceil(round(v / m))
    const options = [k, k + 1, k - 1].map((n) => round(n * m))
    v = options.find((x) => inRange(x) && (!integer || Number.isInteger(x))) ?? options[0]!
  }
  if (integer && !Number.isInteger(v)) v = inRange(Math.ceil(v)) ? Math.ceil(v) : Math.floor(v)
  return v
}

function fitLength(s: string, min?: number, max?: number): string {
  let out = s
  if (min !== undefined && codePointLength(out) < min) {
    while (codePointLength(out) < min) out += s || 'x'
    out = Array.from(out).slice(0, min).join('')
  }
  if (max !== undefined && codePointLength(out) > max) out = Array.from(out).slice(0, max).join('')
  return out
}

function genString(schema: Schema): string {
  let value = typeof schema.format === 'string' ? FORMAT_SAMPLES[schema.format] : undefined
  if (value === undefined && schema.contentEncoding === 'base64') value = FORMAT_SAMPLES.byte
  if (typeof schema.pattern === 'string') {
    const re = compilePattern(schema.pattern)
    if (value === undefined || (re && !re.test(value))) {
      const generated = samplePattern(schema.pattern, schema.minLength ?? 0, schema.maxLength ?? Infinity)
      if (generated !== undefined) return generated
    }
  }
  if (value !== undefined) return value
  return fitLength('string', schema.minLength, schema.maxLength)
}

/** A different value of the same kind, used to keep `uniqueItems` arrays unique. */
function variant(item: unknown, items: Schema | undefined, i: number, ctx: Ctx): unknown {
  const s = items ? deref(items, ctx.resolve) : undefined
  if (s && Array.isArray(s.enum) && s.enum.length > i) return clone(s.enum[i])
  if (typeof item === 'number') return item + i * (s?.multipleOf ?? 1)
  if (typeof item === 'string' && !s?.format && !s?.pattern) {
    const max = s?.maxLength
    const base = max !== undefined && codePointLength(item) >= max ? Array.from(item).slice(0, Math.max(0, max - String(i).length)).join('') : item
    return base + i
  }
  return undefined
}

function genArray(schema: Schema, ctx: Ctx, depth: number): unknown {
  if (depth >= ctx.maxDepth) return new Cut([])
  const out: unknown[] = []
  const prefix = schema.prefixItems ?? []
  for (const p of prefix) {
    const v = gen(p, ctx, depth + 1)
    if (v instanceof Cut && v.value === undefined) return new Cut([])
    out.push(unwrap(v))
  }
  const items = schema.items
  const maxItems = schema.maxItems ?? Infinity
  let count = Math.max(schema.minItems ?? 0, prefix.length ? prefix.length : items ? 1 : 0)
  count = Math.min(count, maxItems)
  if (out.length > count) out.length = count
  if (out.length < count) {
    const v = gen(items ?? {}, ctx, depth + 1)
    if (v instanceof Cut) return new Cut([])
    out.push(v)
    for (let i = 1; out.length < count; i++) {
      if (schema.uniqueItems) {
        const next = variant(v, items, i, ctx)
        if (next === undefined || out.some((x) => deepEqual(x, next))) break
        out.push(next)
      } else {
        out.push(clone(v))
      }
    }
  }
  if (schema.contains && out.length < maxItems) {
    const contains = schema.contains
    const opts = { resolve: ctx.resolve, mode: ctx.mode }
    if (!out.some((x) => validate(x, contains, opts).length === 0)) {
      const v = gen(contains, ctx, depth + 1)
      if (!(v instanceof Cut)) out.push(v)
    }
  }
  return out
}

function genObject(schema: Schema, ctx: Ctx, depth: number): unknown {
  if (depth >= ctx.maxDepth) return new Cut({})
  const out: Record<string, unknown> = {}
  const required = new Set(schema.required ?? [])
  const props = schema.properties ?? {}
  for (const [key, ps] of Object.entries(props)) {
    if (skippedInMode(ps, ctx.mode, ctx.resolve)) continue
    const v = gen(ps, ctx, depth + 1)
    if (v instanceof Cut) {
      // Empty arrays are still valid; a cut-off object is kept only when required.
      if (Array.isArray(v.value) || (v.value !== undefined && required.has(key))) out[key] = v.value
      continue
    }
    if (v !== undefined) out[key] = v
  }
  const ap = schema.additionalProperties
  const hasProps = Object.keys(props).length > 0
  if (!hasProps && isPlainObject(ap)) {
    const v = unwrap(gen(ap, ctx, depth + 1))
    if (v !== undefined) out.additionalProp1 = v
  }
  // Fill up to minProperties when extra keys are allowed.
  const min = schema.minProperties ?? 0
  for (let i = Object.keys(out).length + 1; Object.keys(out).length < min && ap !== false; i++) {
    const v = unwrap(gen(isPlainObject(ap) ? ap : {}, ctx, depth + 1))
    out[`additionalProp${i}`] = v === undefined ? null : v
  }
  return out
}

/** The element name for a root schema: `xml.name`, else the ref name, else `root`. */
export function rootName(schema: Schema): string {
  const name = schema.xml?.name
  if (typeof name === 'string' && name) return name
  return typeof schema.$ref === 'string' ? refName(schema.$ref) : 'root'
}
