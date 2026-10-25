/**
 * JSON Schema (2020-12, as in a normalized OpenAPI 3.1 document) → a
 * TypeScript type expression.
 *
 * The types describe the wire shapes: a `readOnly` property is `readonly` (it
 * comes in responses), a `writeOnly` one carries a `@writeOnly` note, and
 * both keep the optionality the schema gives them. A `$ref` to
 * `#/components/schemas/X` prints as the component's type name, so cycles
 * are just named types referring to each other; any other ref is inlined.
 */
import type { OpenApiDocument, Schema } from '../core/types'
import { discriminatorKey, hasFlag, isPlainObject, keywordType, refName } from '../schema/util'
import { jsdoc, literal, propertyKey, quote, typeName } from './names'

export interface TsContext {
  /** The type name a `$ref` prints as; undefined inlines what it points to. */
  nameOf(ref: string): string | undefined
  /** What a `$ref` points to, one step. */
  resolve(ref: string): Schema | undefined
  /** The refs printed by name so far: the component types a snippet needs. */
  used: Set<string>
  /** Every type name of the components, taken before operation names are chosen. */
  taken: Set<string>
}

const COMPONENT_PREFIX = '#/components/schemas/'
/** Global types the output uses: a component may not take their names. */
const RESERVED = new Set(['Blob'])

/**
 * A context for printing: with a document, every component schema gets a
 * unique PascalCase name (document order decides who keeps the plain one on a
 * clash: `order_item` → `OrderItem`, then `OrderItem` → `OrderItem2`). Without
 * one, a ref prints as the PascalCase of its last segment and is never inlined.
 */
export function createTsContext(doc?: OpenApiDocument): TsContext {
  const used = new Set<string>()
  const taken = new Set<string>()
  if (!doc) {
    return {
      nameOf: (ref) => typeName(refName(ref)) || 'Unknown',
      resolve: () => undefined,
      used,
      taken,
    }
  }
  const schemas = isPlainObject(doc.components?.schemas) ? doc.components.schemas : {}
  const byKey = new Map<string, string>()
  for (const key of Object.keys(schemas)) {
    const base = typeName(key) || 'Schema'
    let name = base
    for (let n = 2; taken.has(name) || RESERVED.has(name); n++) name = `${base}${n}`
    taken.add(name)
    byKey.set(key, name)
  }
  /** The component key of `#/components/schemas/<key>`, pointer- and URI-unescaped. */
  const keyOf = (ref: string): string | undefined => {
    if (!ref.startsWith(COMPONENT_PREFIX)) return undefined
    const rest = ref.slice(COMPONENT_PREFIX.length)
    return rest.includes('/') ? undefined : refName(ref)
  }
  return {
    nameOf: (ref) => {
      const key = keyOf(ref)
      return key === undefined ? undefined : byKey.get(key)
    },
    resolve: (ref) => {
      const key = keyOf(ref)
      if (key !== undefined) return schemas[key]
      if (!ref.startsWith('#/')) return undefined
      let current: unknown = doc
      for (const raw of ref.slice(2).split('/')) {
        if (!isPlainObject(current) && !Array.isArray(current)) return undefined
        current = (current as Record<string, unknown>)[refName(`/${raw}`)]
      }
      return current as Schema | undefined
    },
    used,
    taken,
  }
}

/* ------------------------------ printing ------------------------------ */

/** Text-like media types: JSON, XML, text, forms. */
export const isTextualMedia = (mediaType: string): boolean => /json|xml|text\/|x-www-form-urlencoded|multipart\//i.test(mediaType)

/**
 * Raw bytes rather than text: `format: binary` (3.0), `contentEncoding:
 * binary`, or a non-textual `contentMediaType` without an encoding (3.1).
 */
function isBinaryString(s: Schema): boolean {
  if (s.format === 'binary' || s.contentEncoding === 'binary') return true
  return typeof s.contentMediaType === 'string' && s.contentEncoding === undefined && !isTextualMedia(s.contentMediaType)
}

/** Binding strength of a printed type: a union inside an array or an intersection needs parentheses. */
const UNION = 0
const INTERSECTION = 1
const ATOM = 2

interface Ts {
  text: string
  prec: number
  /** A single object literal: may be declared as an interface. */
  object?: boolean
}

const atom = (text: string): Ts => ({ text, prec: ATOM })
const UNKNOWN = atom('unknown')
const NEVER = atom('never')
const NULL = atom('null')

function union(list: Ts[]): Ts {
  const seen = new Map<string, Ts>()
  for (const t of list) {
    if (t.text === 'unknown') return UNKNOWN
    if (t.text !== 'never' && !seen.has(t.text)) seen.set(t.text, t)
  }
  const members = [...seen.values()]
  if (!members.length) return NEVER
  if (members.length === 1) return members[0]!
  // Intersections are wrapped too: `(A & B) | C` reads better than `A & B | C`.
  return { text: members.map((t) => (t.prec <= INTERSECTION ? `(${t.text})` : t.text)).join(' | '), prec: UNION }
}

function intersection(list: Ts[]): Ts {
  const seen = new Map<string, Ts>()
  for (const t of list) {
    if (t.text === 'never') return NEVER
    if (t.text !== 'unknown' && !seen.has(t.text)) seen.set(t.text, t)
  }
  const members = [...seen.values()]
  if (!members.length) return UNKNOWN
  if (members.length === 1) return members[0]!
  return { text: members.map((t) => (t.prec === UNION ? `(${t.text})` : t.text)).join(' & '), prec: INTERSECTION }
}

const indentOf = (level: number): string => '  '.repeat(level)

/** Keywords that annotate and never change the shape. */
const ANNOTATIONS = new Set([
  'title',
  'description',
  'default',
  'examples',
  'example',
  'deprecated',
  'readOnly',
  'writeOnly',
  'summary',
  'format',
  'xml',
  'externalDocs',
  '$comment',
  '$id',
  '$schema',
  '$anchor',
  '$defs',
  'definitions',
  'discriminator',
])
const isAnnotation = (key: string): boolean => ANNOTATIONS.has(key) || key.startsWith('x-')

/** Keys that make a bare `type` worth printing next to a composition. */
const STRUCTURE = ['properties', 'patternProperties', 'additionalProperties', 'items', 'prefixItems']

/** The JSDoc lines a schema's annotations give: description, format, default, examples, flags. */
export function docLines(schema: unknown, extra: { description?: string; deprecated?: boolean; example?: unknown } = {}): string[] {
  const s: Schema = isPlainObject(schema) ? schema : {}
  const lines: string[] = []
  const description = extra.description ?? (typeof s.description === 'string' ? s.description : undefined)
  if (description?.trim()) lines.push(description.trim())
  if (typeof s.format === 'string' && s.format && s.format !== 'binary') lines.push(`@format ${s.format}`)
  if (s.default !== undefined) lines.push(`@default ${JSON.stringify(s.default)}`)
  const examples = Array.isArray(s.examples) ? [...s.examples] : s.example !== undefined ? [s.example] : []
  if (extra.example !== undefined && !examples.length) examples.push(extra.example)
  for (const e of examples) if (e !== undefined) lines.push(`@example ${JSON.stringify(e)}`)
  if (s.writeOnly === true) lines.push('@writeOnly sent in requests, never returned')
  if (s.deprecated === true || extra.deprecated === true) lines.push('@deprecated')
  return lines
}

/** The members of an object literal (each already indented) → the literal. */
function objectLiteral(members: string[], level: number): Ts {
  return { text: `{\n${members.join('\n')}\n${indentOf(level)}}`, prec: ATOM, object: true }
}

class Printer {
  /** Refs being inlined, to stop on a cycle. */
  private stack: string[] = []

  constructor(private ctx: TsContext) {}

  print(schema: unknown, level: number): Ts {
    if (schema === true) return UNKNOWN
    if (schema === false) return NEVER
    if (!isPlainObject(schema)) return UNKNOWN
    const s = schema as Schema
    const t = this.shape(s, level)
    return s.nullable === true ? union([t, NULL]) : t
  }

  private shape(s: Schema, level: number): Ts {
    if (typeof s.$ref === 'string') {
      const target = this.ref(s.$ref, level)
      const rest = Object.fromEntries(Object.entries(s).filter(([k]) => k !== '$ref' && k !== 'nullable' && !isAnnotation(k)))
      return Object.keys(rest).length ? intersection([target, this.print(rest, level)]) : target
    }
    if (s.const !== undefined) return atom(literal(s.const) ?? 'unknown')
    if (Array.isArray(s.enum)) return union(s.enum.map((v) => atom(literal(v) ?? 'unknown')))

    const types = Array.isArray(s.type) ? s.type : typeof s.type === 'string' ? [s.type] : []
    const nullable = types.includes('null')
    const composed = !!(s.allOf?.length || s.oneOf?.length || s.anyOf?.length)
    if (!composed) {
      const named = types.length ? types : [keywordType(s) ?? 'any']
      return union(named.map((type) => this.typed(type, s, level)))
    }

    // Next to a composition a bare `type: object` adds nothing; properties and items do.
    const hasStructure = STRUCTURE.some((k) => s[k] !== undefined)
    const own = hasStructure
      ? union(types.filter((x) => x !== 'null').concat(types.length ? [] : [keywordType(s) ?? 'object']).map((type) => this.typed(type, s, level)))
      : undefined
    const parts: Ts[] = []
    if (s.allOf?.length) parts.push(this.allOf(s, level))
    else if (own) parts.push(own)
    const branches = s.oneOf?.length ? s.oneOf : s.anyOf
    if (branches?.length) parts.push(this.branches(branches, s, level))
    const t = intersection(parts)
    return nullable ? union([t, NULL]) : t
  }

  /** A `$ref`: the component's name, or the target inlined (a cycle while inlining gives `unknown`). */
  private ref(ref: string, level: number): Ts {
    const name = this.ctx.nameOf(ref)
    if (name) {
      this.ctx.used.add(ref)
      return atom(name)
    }
    if (this.stack.includes(ref)) return UNKNOWN
    const target = this.ctx.resolve(ref)
    if (target === undefined) return UNKNOWN
    this.stack.push(ref)
    try {
      return this.print(target, level)
    } finally {
      this.stack.pop()
    }
  }

  private typed(type: string, s: Schema, level: number): Ts {
    switch (type) {
      case 'string':
        return atom(isBinaryString(s) ? 'Blob' : 'string')
      case 'integer':
      case 'number':
        return atom('number')
      case 'boolean':
        return atom('boolean')
      case 'null':
        return NULL
      case 'array':
        return this.array(s, level)
      case 'object':
        return this.object(s, level)
      default:
        return UNKNOWN
    }
  }

  /**
   * `T[]`, or a tuple for `prefixItems`: elements past `minItems` are optional,
   * `items` next to them is the rest (`...T[]`); without `items` the tuple is closed.
   */
  private array(s: Schema, level: number): Ts {
    if (s.prefixItems?.length) {
      const min = typeof s.minItems === 'number' ? s.minItems : s.prefixItems.length
      const elements = s.prefixItems.map((item, i) => {
        const t = this.print(item, level)
        if (i < min) return t.text
        return t.prec < ATOM ? `(${t.text})?` : `${t.text}?`
      })
      // `items: false` closes the tuple (the Schema type does not spell boolean schemas).
      const items: unknown = s.items
      if (items !== undefined && items !== false) elements.push(`...${this.list(this.print(s.items, level))}`)
      return atom(`[${elements.join(', ')}]`)
    }
    return atom(this.list(s.items === undefined ? UNKNOWN : this.print(s.items, level)))
  }

  private list(item: Ts): string {
    return item.prec < ATOM ? `(${item.text})[]` : `${item.text}[]`
  }

  /**
   * An object literal: `?` for optional properties, `readonly` for readOnly
   * ones, JSDoc from annotations. `additionalProperties` and
   * `patternProperties` become an index signature; when it would clash with
   * the declared properties, it goes into an intersection instead.
   */
  private object(s: Schema, level: number): Ts {
    const inner = indentOf(level + 1)
    const required = new Set(Array.isArray(s.required) ? s.required : [])
    const members: string[] = []
    for (const [name, prop] of Object.entries(isPlainObject(s.properties) ? s.properties : {})) {
      const t = this.print(prop, level + 1)
      const readonly = hasFlag(prop, 'readOnly', (r) => this.ctx.resolve(r)) ? 'readonly ' : ''
      members.push(`${jsdoc(docLines(prop), inner)}${inner}${readonly}${propertyKey(name)}${required.has(name) ? '' : '?'}: ${t.text}`)
    }

    const indexTypes: Ts[] = []
    const patterns = isPlainObject(s.patternProperties) ? Object.entries(s.patternProperties) : []
    for (const [, p] of patterns) indexTypes.push(this.print(p, level + 1))
    const extra = s.additionalProperties
    if (extra === true || isPlainObject(extra)) indexTypes.push(this.print(extra, level + 1))
    const indexDoc = patterns.length ? jsdoc([`Keys matching ${patterns.map(([p]) => p).join(', ')}`], inner) : ''

    if (!indexTypes.length) {
      if (members.length) return objectLiteral(members, level)
      // No properties at all: any keys (or none, when additionalProperties is false).
      return objectLiteral([`${inner}[key: string]: ${extra === false ? 'never' : 'unknown'}`], level)
    }
    const index = union(indexTypes)
    if (!members.length || index.text === 'unknown') {
      members.push(`${indexDoc}${inner}[key: string]: ${index.text}`)
      return objectLiteral(members, level)
    }
    return intersection([objectLiteral(members, level), objectLiteral([`${indexDoc}${inner}[key: string]: ${index.text}`], level)])
  }

  /**
   * `allOf` → an intersection. Inline object parts without overlapping
   * properties (and the schema's own properties) merge into one literal.
   */
  private allOf(s: Schema, level: number): Ts {
    const own: Schema | undefined = STRUCTURE.some((k) => s[k] !== undefined)
      ? Object.fromEntries(Object.entries(s).filter(([k]) => !['allOf', 'oneOf', 'anyOf', 'discriminator'].includes(k)))
      : undefined
    const parts = [...s.allOf!, ...(own ? [own] : [])]
    const merged = mergeSimple(parts)
    if (merged) return this.object(merged, level)
    return intersection(parts.map((p) => this.print(p, level)))
  }

  /**
   * `oneOf`/`anyOf` → a union. With a discriminator, a `$ref` branch that does
   * not pin the tag property itself gets `& { tag: 'value' }` from the mapping
   * (or the schema name).
   */
  private branches(branches: Schema[], s: Schema, level: number): Ts {
    const disc = isPlainObject(s.discriminator) && typeof s.discriminator.propertyName === 'string' ? s.discriminator : undefined
    return union(
      branches.map((branch) => {
        const t = this.print(branch, level)
        if (!disc || !isPlainObject(branch) || typeof branch.$ref !== 'string') return t
        if (pinsProperty(this.ctx.resolve(branch.$ref), disc.propertyName, this.ctx, new Set([branch.$ref]))) return t
        const tag = `{ ${propertyKey(disc.propertyName)}: ${quote(discriminatorKey(disc, branch.$ref))} }`
        return intersection([t, atom(tag)])
      }),
    )
  }
}

/** Keys of an object schema that `allOf` parts may carry and still merge into one literal. */
const MERGEABLE = new Set(['type', 'properties', 'required', 'minProperties', 'maxProperties'])

/** Merges inline object schemas whose properties do not overlap; undefined when they cannot merge. */
function mergeSimple(parts: unknown[]): Schema | undefined {
  const properties: Record<string, Schema> = {}
  const required: string[] = []
  for (const part of parts) {
    if (!isPlainObject(part)) return undefined
    for (const key of Object.keys(part)) if (!MERGEABLE.has(key) && !isAnnotation(key)) return undefined
    if (part.type !== undefined && part.type !== 'object') return undefined
    for (const [name, prop] of Object.entries(isPlainObject(part.properties) ? part.properties : {})) {
      if (name in properties) return undefined
      properties[name] = prop as Schema
    }
    if (Array.isArray(part.required)) for (const r of part.required) if (typeof r === 'string' && !required.includes(r)) required.push(r)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

/** Whether a schema (through refs and `allOf`) fixes `prop` to one value with `const` or a one-item `enum`. */
function pinsProperty(schema: Schema | undefined, prop: string, ctx: TsContext, seen: Set<string>): boolean {
  if (!isPlainObject(schema)) return false
  if (typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return false
    seen.add(schema.$ref)
    return pinsProperty(ctx.resolve(schema.$ref), prop, ctx, seen)
  }
  const p = isPlainObject(schema.properties) ? schema.properties[prop] : undefined
  if (isPlainObject(p)) {
    const target = typeof p.$ref === 'string' ? ctx.resolve(p.$ref) : p
    if (isPlainObject(target) && (target.const !== undefined || (Array.isArray(target.enum) && target.enum.length === 1))) return true
  }
  return !!schema.allOf?.some((part) => pinsProperty(part, prop, ctx, seen))
}

/**
 * A schema as a TypeScript type expression. Nested object literals are
 * indented for a type that starts at column 0. `$ref`s print through
 * `ctx.nameOf` (and land in `ctx.used`).
 */
export function schemaToTs(schema: unknown, ctx: TsContext = createTsContext()): string {
  return new Printer(ctx).print(schema, 0).text
}

/** Internal: the printed type with its kind, for the declarations. */
export function printSchema(schema: unknown, ctx: TsContext, level = 0): Ts {
  return new Printer(ctx).print(schema, level)
}

/**
 * An exported declaration: `export interface Name { … }` for an object
 * literal, else `export type Name = …`; JSDoc from the schema's annotations
 * (or `doc` when given).
 */
export function declareType(name: string, schema: unknown, ctx: TsContext, doc?: string[]): string {
  const t = printSchema(schema, ctx)
  return declare(name, t, doc ?? docLines(schema))
}

/** Internal: a declaration of an already printed type. */
export function declare(name: string, t: Ts, doc: string[]): string {
  // `type A = A` (a ref to itself) would not compile.
  const body = t.text === name ? atom('unknown') : t
  const head = jsdoc(doc, '')
  return body.object ? `${head}export interface ${name} ${body.text}` : `${head}export type ${name} = ${body.text}`
}

export type { Ts as PrintedType }
