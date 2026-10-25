/**
 * Try-it fields: which input a schema gets (a select for an enum, a switch for
 * a boolean, a number input, tags for an array…) and how the typed text maps
 * to the value and back. The draft keeps parameter values as text, so every
 * widget reads and writes text; `parseValue` turns it into the value sent.
 */
import type { Schema } from '../core/types'
import { bounds, declaredType, effective, inferType, isPlainObject, type Resolver } from '../schema/util'
import { parseValue } from './draft'

export type FieldKind = 'enum' | 'boolean' | 'integer' | 'number' | 'array' | 'json' | 'date' | 'datetime' | 'string'

export interface FieldOption {
  value: string
  label: string
}

export interface FieldSpec {
  kind: FieldKind
  /** The schema type the text is parsed as (`parseValue`). */
  type?: string
  /** Enum values as text (kind `enum`, or `array` of an enum). */
  options?: FieldOption[]
  /** Numeric bounds for `integer`/`number`; exclusive bounds are tightened for integers. */
  min?: number
  max?: number
  step?: number
  /** The item type of an `array`. */
  itemType?: string
  /** The value may be null (`type: [x, 'null']` or `nullable`). */
  nullable: boolean
  /** A hint for an empty input: the default or an example. */
  placeholder?: string
  /** The schema as resolved (refs followed, allOf merged). */
  schema: Schema
}

/** A value as the inputs show it: strings as they are, the rest as JSON. */
export function valueText(value: unknown): string {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** True when the schema lets the value be null. */
export function isNullable(schema: Schema | undefined): boolean {
  if (!schema) return false
  if (schema.nullable === true) return true
  if (Array.isArray(schema.type)) return schema.type.includes('null')
  return !!(schema.oneOf ?? schema.anyOf)?.some((s) => isPlainObject(s) && (s.type === 'null' || (Array.isArray(s.type) && s.type.length === 1 && s.type[0] === 'null')))
}

const SCALARS = new Set(['string', 'integer', 'number', 'boolean'])

/** The input for a schema; no schema (or an unknown one) is a JSON field. */
export function fieldSpec(raw: Schema | undefined, resolve?: Resolver): FieldSpec {
  const schema = raw ? effective(raw, resolve) : {}
  const type = raw ? inferType(schema, resolve) : undefined
  const spec: FieldSpec = { kind: 'json', nullable: isNullable(schema), schema }
  if (type && type !== 'null') spec.type = type
  const example = schema.default ?? schema.example ?? schema.examples?.[0]
  if (example !== undefined) spec.placeholder = valueText(example)

  const choices = schema.const !== undefined ? [schema.const] : Array.isArray(schema.enum) ? schema.enum : undefined
  if (choices?.length && (!type || SCALARS.has(type))) {
    spec.kind = 'enum'
    spec.options = choices.filter((v) => v !== null).map((v) => ({ value: valueText(v), label: valueText(v) }))
    return spec
  }
  if (type === 'boolean') spec.kind = 'boolean'
  else if (type === 'integer' || type === 'number') {
    spec.kind = type
    const b = bounds(schema)
    const nudge = type === 'integer' ? 1 : 0
    if (b.min !== undefined) spec.min = b.minExclusive ? b.min + nudge : b.min
    if (b.max !== undefined) spec.max = b.maxExclusive ? b.max - nudge : b.max
    spec.step = typeof schema.multipleOf === 'number' ? schema.multipleOf : type === 'integer' ? 1 : undefined
  } else if (type === 'array') {
    const items = schema.items && !Array.isArray(schema.items) ? effective(schema.items as Schema, resolve) : undefined
    const itemType = items ? inferType(items, resolve) : 'string'
    // Arrays of scalars are tags; arrays of objects or arrays are typed as JSON.
    if (!itemType || SCALARS.has(itemType)) {
      spec.kind = 'array'
      spec.itemType = itemType ?? 'string'
      const itemChoices = items?.const !== undefined ? [items.const] : items?.enum
      if (itemChoices?.length) spec.options = itemChoices.map((v) => ({ value: valueText(v), label: valueText(v) }))
    }
  } else if (type === 'string') {
    spec.kind = schema.format === 'date' ? 'date' : schema.format === 'date-time' ? 'datetime' : 'string'
  }
  return spec
}

/** The items of an array as typed: a JSON array, else comma-separated text. */
export function textToItems(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const value: unknown = JSON.parse(trimmed)
      if (Array.isArray(value)) return value.map(valueText)
    } catch {
      // Not JSON: commas below.
    }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Array items as the draft keeps them: a JSON array with each item typed; no items is ''. */
export function itemsToText(items: string[], itemType: string | undefined): string {
  if (!items.length) return ''
  return JSON.stringify(items.map((item) => parseValue(item, itemType) ?? item))
}

/** A date-time as `datetime-local` takes it (local time, seconds); '' when it does not parse. */
export function toLocalDateTime(text: string): string {
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** A `datetime-local` value as an RFC 3339 instant in UTC; '' stays ''. */
export function fromLocalDateTime(local: string): string {
  if (!local) return ''
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? local : date.toISOString().replace(/\.000Z$/, 'Z')
}

/** True when a date-time text can be shown in a `datetime-local` input. */
export function localDateTimeFits(text: string): boolean {
  return text === '' || toLocalDateTime(text) !== ''
}

/** Markdown as one line of plain text, for a hint under an input. */
export function plainText(markdown: string | undefined): string {
  if (!markdown) return ''
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A short type label: `integer`, `string · date`, `string[]`. */
export function typeLabel(spec: FieldSpec): string {
  const s = spec.schema
  if (spec.kind === 'array') return `${spec.itemType ?? 'string'}[]`
  const type = spec.type ?? declaredType(s) ?? (spec.kind === 'json' ? 'json' : '')
  const format = typeof s.format === 'string' ? s.format : ''
  return [type, format].filter(Boolean).join(' · ')
}
