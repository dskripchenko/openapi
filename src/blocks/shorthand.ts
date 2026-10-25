/**
 * Type shorthand, as laravel-api writes it: `type(format)! Description`.
 *
 *   integer               { type: integer }
 *   string(email)!        { type: string, format: email }, required
 *   string[]              { type: array, items: { type: string } }
 *   integer! The order id { type: integer }, required, described
 *   file                  { type: string, format: binary } — an upload
 *
 * In a schema, a property may be a shorthand string, and a property name
 * ending in `!` is required whatever its definition.
 */
import { BlockError } from './errors'

const TYPES = new Set(['string', 'integer', 'number', 'boolean', 'object', 'array', 'null', 'file'])
const SHORTHAND = /^([A-Za-z]+)(?:\(([^()]+)\))?((?:\[\])*)(!?)(?:\s+([\s\S]*))?$/

export interface Shorthand {
  schema: Record<string, unknown>
  required: boolean
  description?: string
}

/** Reads one shorthand string; throws BlockError (at `pointer`) when it is not one. */
export function parseShorthand(text: string, pointer = ''): Shorthand {
  const m = SHORTHAND.exec(text.trim())
  const type = m?.[1]?.toLowerCase()
  if (!m || !type || !TYPES.has(type)) {
    throw new BlockError(
      `"${text}" is not a type: use string, integer, number, boolean, object, array or file, with an optional (format), [] and !`,
      pointer,
    )
  }
  let schema: Record<string, unknown> = type === 'file' ? { type: 'string', format: 'binary' } : { type }
  if (m[2]) schema.format = m[2].trim()
  for (let depth = (m[3] ?? '').length / 2; depth > 0; depth--) schema = { type: 'array', items: schema }
  const description = m[5]?.trim()
  return { schema, required: m[4] === '!', ...(description ? { description } : {}) }
}

/** True when `text` reads as a shorthand type. */
export function isShorthand(text: string): boolean {
  const m = SHORTHAND.exec(text.trim())
  return !!m && TYPES.has(m[1]!.toLowerCase())
}

/**
 * The shorthand for a schema the shorthand can say (a type, a format, arrays
 * of those); undefined for anything richer.
 */
export function formatShorthand(schema: unknown): string | undefined {
  let s = schema
  let arrays = ''
  while (isObj(s) && s.type === 'array' && keysWithin(s, ['type', 'items'])) {
    if (!isObj(s.items)) return undefined
    arrays += '[]'
    s = s.items
  }
  if (!isObj(s) || typeof s.type !== 'string' || !keysWithin(s, ['type', 'format'])) return undefined
  if (s.format !== undefined && typeof s.format !== 'string') return undefined
  if (s.type === 'string' && s.format === 'binary') return `file${arrays}`
  return `${s.type}${s.format ? `(${s.format})` : ''}${arrays}`
}

/**
 * A schema as written in a block, made a plain JSON Schema: shorthand strings
 * (the schema itself, properties, items, the members of allOf / anyOf / oneOf,
 * additionalProperties) expand, `name!` properties join `required`, and a
 * `type` written as shorthand merges in.
 */
export function expandSchema(value: unknown, pointer = ''): unknown {
  if (typeof value === 'string') return parseShorthand(value, pointer).schema
  if (!isObj(value)) return value
  let out: Record<string, unknown> = { ...value }
  if (typeof out.type === 'string' && (out.type === 'file' || !TYPES.has(out.type))) {
    if (!isShorthand(out.type)) throw new BlockError(`"${out.type}" is not a type`, `${pointer}/type`)
    // The shorthand gives type, format and items; keys written next to it win.
    const rest = Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'type'))
    out = { ...parseShorthand(out.type, `${pointer}/type`).schema, ...rest }
  }
  if (isObj(out.properties)) {
    const required = Array.isArray(out.required) ? [...(out.required as unknown[])] : []
    const props: Record<string, unknown> = {}
    for (const [rawName, def] of Object.entries(out.properties)) {
      const forced = rawName.endsWith('!')
      const name = forced ? rawName.slice(0, -1) : rawName
      const at = `${pointer}/properties/${escape(rawName)}`
      if (typeof def === 'string') {
        const sh = parseShorthand(def, at)
        props[name] = sh.description ? { ...sh.schema, description: sh.description } : sh.schema
        if (sh.required && !forced) required.push(name)
      } else props[name] = expandSchema(def, at)
      if (forced) required.push(name)
    }
    out.properties = props
    if (required.length) out.required = [...new Set(required)]
  }
  if (out.items !== undefined) out.items = expandSchema(out.items, `${pointer}/items`)
  if (out.additionalProperties !== undefined && typeof out.additionalProperties !== 'boolean') {
    out.additionalProperties = expandSchema(out.additionalProperties, `${pointer}/additionalProperties`)
  }
  for (const k of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(out[k])) out[k] = (out[k] as unknown[]).map((s, i) => expandSchema(s, `${pointer}/${k}/${i}`))
  }
  return out
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const keysWithin = (o: Record<string, unknown>, allowed: string[]): boolean => Object.keys(o).every((k) => allowed.includes(k))
const escape = (token: string): string => token.replace(/~/g, '~0').replace(/\//g, '~1')
