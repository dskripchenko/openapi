/** Small helpers shared by the model and the validator. */

export type Obj = Record<string, unknown>

export function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An object that carries a string `$ref`. */
export function isRef(value: unknown): value is { $ref: string } & Obj {
  return isObject(value) && typeof value.$ref === 'string'
}

export function isExtension(key: string): boolean {
  return key.startsWith('x-')
}

/**
 * Deep clone of plain JSON-like data. Shared sub-objects (YAML aliases) stay
 * shared in the copy and cycles are preserved instead of looping forever.
 */
export function deepClone<T>(value: T, seen = new Map<unknown, unknown>()): T {
  if (typeof value !== 'object' || value === null) return value
  const known = seen.get(value)
  if (known !== undefined) return known as T
  if (Array.isArray(value)) {
    const out: unknown[] = []
    seen.set(value, out)
    for (const item of value) out.push(deepClone(item, seen))
    return out as T
  }
  const out: Obj = {}
  seen.set(value, out)
  for (const [key, item] of Object.entries(value as Obj)) out[key] = deepClone(item, seen)
  return out as T
}

/** Escapes one JSON Pointer reference token (RFC 6901). */
export function escapePointer(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function unescapePointer(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

/** Appends tokens to a JSON Pointer. */
export function joinPointer(base: string, ...tokens: (string | number)[]): string {
  return base + tokens.map((t) => '/' + escapePointer(String(t))).join('')
}

/**
 * Walks a JSON Pointer (without the leading '#') inside `root`.
 * Returns undefined when any step is missing.
 */
export function walkPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root
  if (!pointer.startsWith('/')) return undefined
  let current: unknown = root
  for (const raw of pointer.slice(1).split('/')) {
    const token = unescapePointer(raw)
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) return undefined
      current = current[Number(token)]
    } else if (isObject(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined
      current = current[token]
    } else {
      return undefined
    }
    if (current === undefined) return undefined
  }
  return current
}

/** Turns a URI fragment ('#/a%20b/c') into a JSON Pointer ('/a b/c'). */
export function fragmentToPointer(fragment: string): string {
  const body = fragment.startsWith('#') ? fragment.slice(1) : fragment
  try {
    return decodeURIComponent(body)
  } catch {
    return body
  }
}

/** Copies the `x-*` keys of `from` onto `to`. */
export function copyExtensions(from: Obj, to: Obj): void {
  for (const [key, value] of Object.entries(from)) if (isExtension(key)) to[key] = value
}

export function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined
}
