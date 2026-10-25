/**
 * Short type labels for the UI: `string<uuid>`, `array<Pet>`, `Pet`,
 * `string | null`, `oneOf: Cat | Dog`, `string (enum)`.
 */
import type { Schema } from '../core/types'
import { type Resolver, inferType, isPlainObject, keywordType, refName } from './util'

export interface DescribeOptions {
  resolve?: Resolver
}

export function describe(schema: Schema, opts: DescribeOptions = {}): string {
  return label(schema, opts.resolve, 0)
}

function withNull(base: string, schema: Schema): string {
  return schema.nullable === true && !base.endsWith('| null') ? `${base} | null` : base
}

function label(schema: Schema, resolve: Resolver | undefined, depth: number): string {
  if (!isPlainObject(schema)) return 'any'
  if (depth > 6) return '…'
  if (typeof schema.$ref === 'string') return withNull(refName(schema.$ref), schema)

  if (schema.oneOf?.length) return withNull(`oneOf: ${schema.oneOf.map((s) => label(s, resolve, depth + 1)).join(' | ')}`, schema)
  if (schema.anyOf?.length) {
    // `anyOf: [X, {type: null}]` is the usual 3.1 spelling of a nullable X.
    const nonNull = schema.anyOf.filter((s) => !(isPlainObject(s) && s.type === 'null'))
    if (nonNull.length === 1 && nonNull.length < schema.anyOf.length) return `${label(nonNull[0]!, resolve, depth + 1)} | null`
    return withNull(`anyOf: ${schema.anyOf.map((s) => label(s, resolve, depth + 1)).join(' | ')}`, schema)
  }
  if (schema.allOf?.length) {
    const own = { ...schema, allOf: undefined }
    const hasOwnShape = keywordType(own) !== undefined || own.type !== undefined
    if (schema.allOf.length === 1 && !hasOwnShape) return withNull(label(schema.allOf[0]!, resolve, depth + 1), schema)
    const parts = schema.allOf.map((s) => label(s, resolve, depth + 1))
    if (hasOwnShape) parts.push(label(own, resolve, depth + 1))
    return withNull(parts.join(' & '), schema)
  }

  const types = Array.isArray(schema.type)
    ? schema.type
    : typeof schema.type === 'string'
      ? [schema.type]
      : [inferType(schema, resolve) ?? 'any']
  const labels = types.map((t) => single(t, schema, resolve, depth))
  let out = labels.join(' | ')
  if (Array.isArray(schema.enum)) out += ' (enum)'
  else if (schema.const !== undefined) out += ' (const)'
  return withNull(out, schema)
}

function single(type: string, schema: Schema, resolve: Resolver | undefined, depth: number): string {
  if (type === 'array') {
    if (schema.prefixItems?.length) return `[${schema.prefixItems.map((s) => label(s, resolve, depth + 1)).join(', ')}]`
    return isPlainObject(schema.items) ? `array<${label(schema.items, resolve, depth + 1)}>` : 'array'
  }
  if (type === 'null' || type === 'object' || type === 'boolean' || type === 'any') return type
  return typeof schema.format === 'string' && schema.format ? `${type}<${schema.format}>` : type
}
