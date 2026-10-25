/**
 * A JSON Schema guessed from an example value: what a block writes for a
 * body or a response that gives an example and no schema.
 */

const FORMATS: [RegExp, string][] = [
  [/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i, 'date-time'],
  [/^\d{4}-\d{2}-\d{2}$/, 'date'],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'uuid'],
  [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'email'],
  [/^https?:\/\/\S+$/i, 'uri'],
]

/**
 * The schema of `value`: types by JSON kind (integers apart from other
 * numbers), common string formats (date-time, date, uuid, email, uri),
 * object properties in order, and array items merged from every element —
 * objects by the union of their properties, mixed kinds as `anyOf`. An empty
 * array has no `items`; `undefined` gives `{}`.
 */
export function inferSchema(value: unknown): Record<string, unknown> {
  if (value === undefined) return {}
  if (value === null) return { type: 'null' }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' }
  if (typeof value === 'string') {
    const format = FORMATS.find(([re]) => re.test(value))?.[1]
    return format ? { type: 'string', format } : { type: 'string' }
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array' }
    return { type: 'array', items: value.map(inferSchema).reduce(merge) }
  }
  if (typeof value === 'object') {
    const properties: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) properties[k] = inferSchema(v)
    return { type: 'object', properties }
  }
  return {}
}

/** Two guesses as one: objects join their properties, equal types keep one, the rest become anyOf. */
function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  if (a.type === 'object' && b.type === 'object') {
    const pa = a.properties as Record<string, Record<string, unknown>>
    const pb = b.properties as Record<string, Record<string, unknown>>
    const properties: Record<string, unknown> = { ...pa }
    for (const [k, v] of Object.entries(pb)) properties[k] = k in pa ? merge(pa[k]!, v) : v
    return { type: 'object', properties }
  }
  if (a.type === 'array' && b.type === 'array') {
    if (!a.items) return b
    if (!b.items) return a
    return { type: 'array', items: merge(a.items as Record<string, unknown>, b.items as Record<string, unknown>) }
  }
  if (a.type === b.type && a.type !== undefined) return a.format === b.format ? a : { type: a.type }
  // An integer among numbers is a number.
  if ((a.type === 'integer' && b.type === 'number') || (a.type === 'number' && b.type === 'integer')) return { type: 'number' }
  const variants = [...((a.anyOf as Record<string, unknown>[] | undefined) ?? [a])]
  for (const v of (b.anyOf as Record<string, unknown>[] | undefined) ?? [b]) {
    const same = variants.findIndex((x) => x.type === v.type)
    if (same === -1) variants.push(v)
    else variants[same] = merge(variants[same]!, v)
  }
  return { anyOf: variants }
}
