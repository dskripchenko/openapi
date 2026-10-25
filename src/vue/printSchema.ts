/**
 * A schema laid flat for paper: every property on its own row, nested ones
 * indented, nothing folded. `allOf` is merged, each `oneOf`/`anyOf` branch
 * gets a heading row, and a `$ref` met again on its own branch is a row that
 * points up ("→ Name") instead of opening again.
 */
import type { Schema } from '../core/types'
import { describe } from '../schema'

export interface PrintRow {
  depth: number
  /** The property name; '' for the root, `[]` items, `[key]` maps, or a branch heading. */
  name: string
  type: string
  required: boolean
  description?: string
  enum?: unknown[]
  default?: unknown
  constraints: string[]
  flags: string[]
  /** The name of the schema this row points back to. */
  cycle?: string
  /** A `oneOf`/`anyOf` branch heading: the keyword. */
  branch?: 'oneOf' | 'anyOf'
}

export interface FlattenOptions {
  resolve: (ref: string) => Schema | undefined
  mode?: 'request' | 'response'
  /** Rows deeper than this are left out (a guard for odd, very deep specs). */
  maxDepth?: number
  /** At most this many rows. */
  maxRows?: number
}

const refName = (ref: string): string => ref.split('/').pop() ?? ref

/** A schema with its $ref chain followed (siblings kept) and its allOf merged. */
export function resolveSchema(schema: Schema, resolve: FlattenOptions['resolve']): Schema {
  let s = schema
  const visited = new Set<string>()
  while (s.$ref && !visited.has(s.$ref)) {
    visited.add(s.$ref)
    const target = resolve(s.$ref)
    if (!target) break
    const siblings: Schema = { ...s }
    delete siblings.$ref
    s = { ...target, ...siblings }
  }
  if (s.allOf?.length) {
    const merged: Schema = { ...s, allOf: undefined, properties: { ...(s.properties ?? {}) }, required: [...(s.required ?? [])] }
    for (const part of s.allOf) {
      const p = resolveSchema(part, resolve)
      Object.assign(merged.properties!, p.properties ?? {})
      merged.required!.push(...(p.required ?? []))
      for (const key of ['type', 'description', 'title', 'items', 'enum'] as const) {
        if (merged[key] === undefined && p[key] !== undefined) (merged as Record<string, unknown>)[key] = p[key]
      }
    }
    if (!Object.keys(merged.properties!).length) delete merged.properties
    s = merged
  }
  return s
}

/** The constraints of a schema in words: `≥ 1`, `max length 64`, `pattern …`. */
export function constraintsOf(s: Schema): string[] {
  const out: string[] = []
  const add = (label: string, v: unknown): void => {
    if (v !== undefined && typeof v !== 'boolean') out.push(`${label} ${typeof v === 'string' ? v : JSON.stringify(v)}`)
  }
  add('≥', s.minimum)
  add('>', s.exclusiveMinimum)
  add('≤', s.maximum)
  add('<', s.exclusiveMaximum)
  add('multiple of', s.multipleOf)
  add('min length', s.minLength)
  add('max length', s.maxLength)
  add('min items', s.minItems)
  add('max items', s.maxItems)
  if (s.uniqueItems) out.push('unique')
  add('pattern', s.pattern)
  if (s.format && !describe(s).includes(s.format)) out.push(`format ${s.format}`)
  return out
}

/** All rows of a schema, the root first (with name ''). */
export function flattenSchema(schema: Schema, opts: FlattenOptions): PrintRow[] {
  const rows: PrintRow[] = []
  const mode = opts.mode ?? 'response'
  const maxDepth = opts.maxDepth ?? 16
  const maxRows = opts.maxRows ?? 3000
  const resolve = opts.resolve

  function row(s: Schema, name: string, depth: number, required: boolean, seen: string[]): void {
    if (rows.length >= maxRows || depth > maxDepth) return
    const cycle = s.$ref && seen.includes(s.$ref) ? refName(s.$ref) : undefined
    const r = resolveSchema(s, resolve)
    const flags: string[] = []
    if (r.readOnly) flags.push('read-only')
    if (r.writeOnly) flags.push('write-only')
    if (r.deprecated) flags.push('deprecated')
    const out: PrintRow = { depth, name, type: describe(s, { resolve: resolve }), required, constraints: constraintsOf(r), flags }
    if (typeof r.description === 'string' && r.description) out.description = r.description
    if (Array.isArray(r.enum)) out.enum = r.enum
    if (r.default !== undefined) out.default = r.default
    if (cycle) out.cycle = cycle
    rows.push(out)
    if (!cycle) children(r, depth + 1, s.$ref ? [...seen, s.$ref] : seen)
  }

  function children(r: Schema, depth: number, seen: string[]): void {
    for (const [name, p] of Object.entries(r.properties ?? {})) {
      const target = resolveSchema(p, resolve)
      if (mode === 'request' ? target.readOnly : target.writeOnly) continue
      row(p, name, depth, r.required?.includes(name) ?? false, seen)
    }
    if (r.additionalProperties && typeof r.additionalProperties === 'object') row(r.additionalProperties, '[key]', depth, false, seen)
    // Array items: an object's properties open in place; anything else is one `[]` row.
    if (r.items) {
      const items = r.items
      const it = resolveSchema(items, resolve)
      const nested = it.properties || it.oneOf || it.anyOf || it.items || (it.additionalProperties && typeof it.additionalProperties === 'object')
      if (nested) {
        if (items.$ref && seen.includes(items.$ref)) row(items, '[]', depth, false, seen)
        else children(it, depth, items.$ref ? [...seen, items.$ref] : seen)
      }
    }
    const variants = r.oneOf ?? r.anyOf
    if (variants) {
      const branch = r.oneOf ? 'oneOf' : 'anyOf'
      variants.forEach((v, i) => {
        if (rows.length >= maxRows) return
        const label = v.title ?? (v.$ref ? refName(v.$ref) : '') ?? ''
        rows.push({ depth, name: `${branch} ${i + 1}${label ? `: ${label}` : ''}`, type: describe(v, { resolve: resolve }), required: false, constraints: [], flags: [], branch })
        if (v.$ref && seen.includes(v.$ref)) {
          rows[rows.length - 1]!.cycle = refName(v.$ref)
          return
        }
        children(resolveSchema(v, resolve), depth + 1, v.$ref ? [...seen, v.$ref] : seen)
      })
    }
  }

  row(schema, '', 0, false, [])
  return rows
}
