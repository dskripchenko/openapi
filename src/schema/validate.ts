/**
 * A compact JSON Schema validator (2020-12 as used by OpenAPI 3.1, tolerant
 * of 3.0 `nullable` and boolean exclusive bounds). Returns every issue with a
 * JSON Pointer into the value; an empty list means valid.
 */
import type { Schema } from '../core/types'
import {
  type Mode,
  type Resolver,
  bounds,
  codePointLength,
  compilePattern,
  deepEqual,
  discriminatorKey,
  hasFlag,
  isPlainObject,
  pointer,
  refName,
} from './util'

export interface ValidationIssue {
  /** JSON Pointer into the validated value; `''` is the value itself. */
  path: string
  message: string
  /** The schema keyword that failed, e.g. `type`, `required`. */
  keyword: string
}

export interface ValidateOptions {
  resolve?: Resolver
  /** `request` forbids readOnly properties, `response` forbids writeOnly ones. */
  mode?: Mode
}

interface Ctx {
  resolve?: Resolver
  mode?: Mode
  /** `ref|path` pairs being validated, to stop ref-only loops. */
  active: Set<string>
}

export function validate(value: unknown, schema: Schema, opts: ValidateOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  check(value, schema, { resolve: opts.resolve, mode: opts.mode, active: new Set() }, '', issues)
  return issues
}

function isValid(value: unknown, schema: Schema, ctx: Ctx, path: string): boolean {
  const issues: ValidationIssue[] = []
  check(value, schema, ctx, path, issues)
  return issues.length === 0
}

function quote(values: unknown[]): string {
  const shown = values.slice(0, 10).map((v) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v)))
  return shown.join(', ') + (values.length > 10 ? ', …' : '')
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'null':
      return value === null
    case 'boolean':
      return typeof value === 'boolean'
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    default:
      return true
  }
}

function check(value: unknown, schema: Schema, ctx: Ctx, path: string, issues: ValidationIssue[]): void {
  if ((schema as unknown) === false) {
    issues.push({ path, message: 'must not be present', keyword: 'false' })
    return
  }
  if (!isPlainObject(schema)) return
  const add = (keyword: string, message: string, at = path) => issues.push({ path: at, message, keyword })

  // 3.0: `nullable: true` admits null regardless of the other keywords.
  if (value === null && schema.nullable === true) return

  if (typeof schema.$ref === 'string') {
    const key = `${schema.$ref}|${path}`
    const target = ctx.resolve?.(schema.$ref)
    if (isPlainObject(target) && !ctx.active.has(key)) {
      ctx.active.add(key)
      try {
        check(value, target, ctx, path, issues)
      } finally {
        ctx.active.delete(key)
      }
    }
  }

  // type
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? [...schema.type] : [schema.type]
    if (schema.nullable === true && !types.includes('null')) types.push('null')
    if (!types.some((t) => typeMatches(value, t))) {
      add('type', `must be ${types.join(' or ')}`)
      return
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(e, value))) {
    add('enum', `must be one of: ${quote(schema.enum)}`)
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) {
    add('const', `must be equal to ${quote([schema.const])}`)
  }

  if (typeof value === 'number') checkNumber(value, schema, add)
  else if (typeof value === 'string') checkString(value, schema, add)
  else if (Array.isArray(value)) checkArray(value, schema, ctx, path, issues, add)
  else if (isPlainObject(value)) checkObject(value, schema, ctx, path, issues, add)

  checkComposition(value, schema, ctx, path, issues, add)
}

type Add = (keyword: string, message: string, at?: string) => void

function checkNumber(value: number, schema: Schema, add: Add): void {
  const m = schema.multipleOf
  if (typeof m === 'number' && m > 0) {
    const q = value / m
    if (Math.abs(q - Math.round(q)) > 1e-9 * Math.max(1, Math.abs(q))) add('multipleOf', `must be a multiple of ${m}`)
  }
  const b = bounds(schema)
  if (b.min !== undefined) {
    if (b.minExclusive ? value <= b.min : value < b.min) {
      add(b.minExclusive ? 'exclusiveMinimum' : 'minimum', `must be ${b.minExclusive ? '>' : '>='} ${b.min}`)
    }
  }
  if (b.max !== undefined) {
    if (b.maxExclusive ? value >= b.max : value > b.max) {
      add(b.maxExclusive ? 'exclusiveMaximum' : 'maximum', `must be ${b.maxExclusive ? '<' : '<='} ${b.max}`)
    }
  }
}

function checkString(value: string, schema: Schema, add: Add): void {
  const len = codePointLength(value)
  if (typeof schema.minLength === 'number' && len < schema.minLength) {
    add('minLength', `must be at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'}`)
  }
  if (typeof schema.maxLength === 'number' && len > schema.maxLength) {
    add('maxLength', `must be at most ${schema.maxLength} character${schema.maxLength === 1 ? '' : 's'}`)
  }
  if (typeof schema.pattern === 'string') {
    const re = compilePattern(schema.pattern)
    if (re && !re.test(value)) add('pattern', `must match pattern "${schema.pattern}"`)
  }
  if (typeof schema.format === 'string') {
    const test = FORMATS[schema.format]
    if (test && !test(value)) add('format', `must be a valid ${schema.format}`)
  }
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= days[m - 1]!
}

function validTime(s: string, offsetRequired: boolean): boolean {
  const m = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))?$/.exec(s)
  if (!m) return false
  if (offsetRequired && !m[5]) return false
  if (Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3]) > 60) return false
  return m[6] === undefined || (Number(m[6]) <= 23 && Number(m[7]) <= 59)
}

function validDateString(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return !!m && validDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

function validHostname(s: string): boolean {
  const host = s.endsWith('.') ? s.slice(0, -1) : s
  if (!host || host.length > 253) return false
  return host.split('.').every((label) => /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))
}

function validIpv4(s: string): boolean {
  const parts = s.split('.')
  return parts.length === 4 && parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
}

function validIpv6(s: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) return false
  const tail = s.lastIndexOf(':')
  let body = s
  let groupsForV4 = 0
  if (s.slice(tail + 1).includes('.')) {
    if (!validIpv4(s.slice(tail + 1))) return false
    body = s.slice(0, tail + 1) + '0'
    groupsForV4 = 1
  }
  const halves = body.split('::')
  if (halves.length > 2) return false
  const groups = (h: string) => (h === '' ? [] : h.split(':'))
  const left = groups(halves[0]!)
  const right = halves.length === 2 ? groups(halves[1]!) : []
  const all = [...left, ...right]
  if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false
  const count = all.length + groupsForV4
  return halves.length === 2 ? count <= 8 : count === 8
}

const FORMATS: Record<string, (s: string) => boolean> = {
  'date-time': (s) => {
    const m = /^(\d{4}-\d{2}-\d{2})[Tt ](.+)$/.exec(s)
    return !!m && validDateString(m[1]!) && validTime(m[2]!, true)
  },
  date: validDateString,
  time: (s) => validTime(s, false),
  email: (s) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*$/.test(s),
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  ipv4: validIpv4,
  ipv6: validIpv6,
  uri: (s) => /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]*$/.test(s),
  hostname: validHostname,
}

function checkArray(value: unknown[], schema: Schema, ctx: Ctx, path: string, issues: ValidationIssue[], add: Add): void {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    add('minItems', `must have at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`)
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    add('maxItems', `must have at most ${schema.maxItems} item${schema.maxItems === 1 ? '' : 's'}`)
  }
  const prefix = schema.prefixItems ?? []
  value.forEach((item, i) => {
    const s = i < prefix.length ? prefix[i] : schema.items
    if (s !== undefined) check(item, s, ctx, pointer(path, i), issues)
  })
  if (schema.uniqueItems === true) {
    outer: for (let i = 0; i < value.length; i++) {
      for (let j = i + 1; j < value.length; j++) {
        if (deepEqual(value[i], value[j])) {
          add('uniqueItems', `must not have duplicate items (items ${i} and ${j} are identical)`)
          break outer
        }
      }
    }
  }
  const contains = schema.contains
  if (contains !== undefined && !value.some((item, i) => isValid(item, contains, ctx, pointer(path, i)))) {
    add('contains', 'must contain at least one matching item')
  }
}

function checkObject(
  value: Record<string, unknown>,
  schema: Schema,
  ctx: Ctx,
  path: string,
  issues: ValidationIssue[],
  add: Add,
): void {
  const keys = Object.keys(value)
  const props = schema.properties ?? {}
  if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
    add('minProperties', `must have at least ${schema.minProperties} propert${schema.minProperties === 1 ? 'y' : 'ies'}`)
  }
  if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) {
    add('maxProperties', `must have at most ${schema.maxProperties} propert${schema.maxProperties === 1 ? 'y' : 'ies'}`)
  }
  for (const name of schema.required ?? []) {
    if (Object.prototype.hasOwnProperty.call(value, name)) continue
    // OpenAPI: required readOnly properties apply to responses only, writeOnly to requests only.
    const ps = props[name]
    if (ps && ctx.mode === 'request' && hasFlag(ps, 'readOnly', ctx.resolve)) continue
    if (ps && ctx.mode === 'response' && hasFlag(ps, 'writeOnly', ctx.resolve)) continue
    add('required', `must have required property '${name}'`)
  }
  for (const [name, deps] of Object.entries(schema.dependentRequired ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) continue
    for (const dep of deps) {
      if (!Object.prototype.hasOwnProperty.call(value, dep)) {
        add('dependentRequired', `must have property '${dep}' when property '${name}' is present`)
      }
    }
  }
  const patterns = Object.entries(schema.patternProperties ?? {})
    .map(([p, s]) => [compilePattern(p), s] as const)
    .filter((pair): pair is readonly [RegExp, Schema] => pair[0] !== null)
  for (const key of keys) {
    const at = pointer(path, key)
    const child = value[key]
    if (schema.propertyNames && !isValid(key, schema.propertyNames, ctx, at)) {
      add('propertyNames', `property name '${key}' is invalid`, at)
    }
    let matched = false
    const ps = Object.prototype.hasOwnProperty.call(props, key) ? props[key] : undefined
    if (ps !== undefined) {
      matched = true
      if (ctx.mode === 'request' && hasFlag(ps, 'readOnly', ctx.resolve)) {
        add('readOnly', 'is read-only and must not be sent in a request', at)
      } else if (ctx.mode === 'response' && hasFlag(ps, 'writeOnly', ctx.resolve)) {
        add('writeOnly', 'is write-only and must not appear in a response', at)
      }
      check(child, ps, ctx, at, issues)
    }
    for (const [re, s] of patterns) {
      if (re.test(key)) {
        matched = true
        check(child, s, ctx, at, issues)
      }
    }
    if (matched) continue
    const ap = schema.additionalProperties
    if (ap === false) add('additionalProperties', `must not have additional property '${key}'`, at)
    else if (isPlainObject(ap)) check(child, ap as Schema, ctx, at, issues)
  }
}

function checkComposition(value: unknown, schema: Schema, ctx: Ctx, path: string, issues: ValidationIssue[], add: Add): void {
  for (const s of schema.allOf ?? []) check(value, s, ctx, path, issues)

  if (schema.anyOf?.length && !schema.anyOf.some((s) => isValid(value, s, ctx, path))) {
    if (!dispatchDiscriminator(value, schema, schema.anyOf, ctx, path, issues, add)) {
      add('anyOf', 'must match a schema in anyOf')
    }
  }

  if (schema.oneOf?.length) {
    const handled = dispatchDiscriminator(value, schema, schema.oneOf, ctx, path, issues, add)
    if (!handled) {
      const count = schema.oneOf.filter((s) => isValid(value, s, ctx, path)).length
      if (count === 0) add('oneOf', 'must match exactly one schema in oneOf')
      else if (count > 1) add('oneOf', `must match exactly one schema in oneOf (matches ${count})`)
    }
  } else if (!schema.anyOf?.length && schema.discriminator?.mapping && isPlainObject(value)) {
    // A base schema with a mapping (`Pet` used as `allOf` parent): validate the mapped schema too.
    const tag = value[schema.discriminator.propertyName]
    const target = typeof tag === 'string' ? schema.discriminator.mapping[tag] : undefined
    if (target) check(value, { $ref: target.includes('/') ? target : `#/components/schemas/${target}` }, ctx, path, issues)
  }

  if (schema.not !== undefined && isValid(value, schema.not, ctx, path)) {
    add('not', 'must not match the "not" schema')
  }

  if (schema.if !== undefined) {
    if (isValid(value, schema.if, ctx, path)) {
      if (schema.then !== undefined) check(value, schema.then, ctx, path, issues)
    } else if (schema.else !== undefined) {
      check(value, schema.else, ctx, path, issues)
    }
  }
}

/**
 * Picks the oneOf/anyOf branch named by the discriminator and reports its
 * issues directly. Returns false when the discriminator cannot decide (no
 * discriminator, value not an object, branches without refs).
 */
function dispatchDiscriminator(
  value: unknown,
  schema: Schema,
  branches: Schema[],
  ctx: Ctx,
  path: string,
  issues: ValidationIssue[],
  add: Add,
): boolean {
  const d = schema.discriminator
  if (!d?.propertyName || !isPlainObject(value)) return false
  const refs = branches.map((b) => b.$ref).filter((r): r is string => typeof r === 'string')
  if (refs.length !== branches.length) return false
  const prop = d.propertyName
  if (!Object.prototype.hasOwnProperty.call(value, prop)) {
    add('discriminator', `must have required property '${prop}'`)
    return true
  }
  const tag = value[prop]
  const mapped = typeof tag === 'string' ? d.mapping?.[tag] : undefined
  const index =
    typeof tag !== 'string'
      ? -1
      : refs.findIndex((r) => (mapped !== undefined ? r === mapped || refName(r) === refName(mapped) : discriminatorKey(d, r) === tag))
  if (index < 0) {
    add('discriminator', `must be one of: ${quote(refs.map((r) => discriminatorKey(d, r)))}`, pointer(path, prop))
    return true
  }
  check(value, branches[index]!, ctx, path, issues)
  return true
}

