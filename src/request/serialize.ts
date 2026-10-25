/**
 * Parameter serialization by OpenAPI `style` / `explode`.
 *
 * Follows the style tables of OpenAPI 3.0.4 / 3.1.1 (which fixed the `label`
 * rows of the older tables to match RFC 6570):
 *
 * | style          | explode | string        | array                          | object                          |
 * |----------------|---------|---------------|--------------------------------|---------------------------------|
 * | matrix         | false   | ;color=blue   | ;color=blue,black,brown        | ;color=R,100,G,200,B,150        |
 * | matrix         | true    | ;color=blue   | ;color=blue;color=black;color=brown | ;R=100;G=200;B=150         |
 * | label          | false   | .blue         | .blue,black,brown              | .R,100,G,200,B,150              |
 * | label          | true    | .blue         | .blue.black.brown              | .R=100.G=200.B=150              |
 * | form           | false   | color=blue    | color=blue,black,brown         | color=R,100,G,200,B,150         |
 * | form           | true    | color=blue    | color=blue&color=black&color=brown | R=100&G=200&B=150           |
 * | simple         | false   | blue          | blue,black,brown               | R,100,G,200,B,150               |
 * | simple         | true    | blue          | blue,black,brown               | R=100,G=200,B=150               |
 * | spaceDelimited | false   | –             | blue%20black%20brown           | R%20100%20G%20200%20B%20150     |
 * | pipeDelimited  | false   | –             | blue|black|brown               | R|100|G|200|B|150               |
 * | deepObject     | true    | –             | –                              | color[R]=100&color[G]=200&color[B]=150 |
 *
 * Combinations the spec leaves undefined fall back to `form` (explode as
 * given). `deepObject` recurses into nested objects (`a[b][c]=1`) and indexes
 * nested arrays (`a[b][0]=1`), as qs and PHP read them.
 */

import type { Parameter, ParameterIn } from '../core/types'
import { encodeComponent, encodeCookie, isJsonMediaType } from './encode'

export type SerializedParam =
  /** `value` replaces `{name}` in the path template (already percent-encoded). */
  | { in: 'path'; name: string; value: string }
  /** Raw header value (headers are not percent-encoded). */
  | { in: 'header'; name: string; value: string }
  /** Encoded `name=value` pairs: joined by `&` (query) or `; ` (cookie). */
  | { in: 'query' | 'cookie'; name: string; pairs: [string, string][] }

export interface StyleOptions {
  style?: string
  explode?: boolean
  allowReserved?: boolean
  /** Skip percent-encoding (form bodies: URLSearchParams/FormData encode later). */
  raw?: boolean
}

type Normalized =
  | { kind: 'empty' }
  | { kind: 'primitive'; value: string }
  | { kind: 'array'; items: string[] }
  | { kind: 'object'; entries: [string, string][]; source: Record<string, unknown> }

/** Stringifies a leaf: primitives as-is, null as '', nested structures as JSON. */
export function stringifyLeaf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (isFileValue(value)) return value.filename
  return JSON.stringify(value)
}

export function isFileValue(
  value: unknown,
): value is { filename: string; contentType?: string; data?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { filename?: unknown }).filename === 'string'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isFileValue(value)
}

/** `undefined` means "omit the parameter". */
function normalize(value: unknown): Normalized | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== undefined).map(stringifyLeaf)
    return items.length ? { kind: 'array', items } : undefined
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]): [string, string] => [k, stringifyLeaf(v)])
    return entries.length ? { kind: 'object', entries, source: value } : undefined
  }
  const str = stringifyLeaf(value)
  return str === '' ? { kind: 'empty' } : { kind: 'primitive', value: str }
}

/** Default style for each location (OpenAPI 3.x). */
export function defaultStyle(location: ParameterIn): string {
  return location === 'query' || location === 'cookie' ? 'form' : 'simple'
}

/** Builds a single string for path/header styles (simple, label, matrix). */
function serializeSingle(
  name: string,
  value: Normalized,
  style: string,
  explode: boolean,
  enc: (s: string) => string,
): string {
  const n = enc(name)
  const flat = (entries: [string, string][]) => entries.flatMap(([k, v]) => [enc(k), enc(v)])
  const pairs = (entries: [string, string][], sep: string) =>
    entries.map(([k, v]) => enc(k) + '=' + enc(v)).join(sep)

  if (style === 'label') {
    switch (value.kind) {
      case 'empty':
        return '.'
      case 'primitive':
        return '.' + enc(value.value)
      case 'array':
        return '.' + value.items.map(enc).join(explode ? '.' : ',')
      case 'object':
        return '.' + (explode ? pairs(value.entries, '.') : flat(value.entries).join(','))
    }
  }
  if (style === 'matrix') {
    switch (value.kind) {
      case 'empty':
        return ';' + n
      case 'primitive':
        return ';' + n + '=' + enc(value.value)
      case 'array':
        return explode
          ? value.items.map((i) => ';' + n + '=' + enc(i)).join('')
          : ';' + n + '=' + value.items.map(enc).join(',')
      case 'object':
        return explode
          ? ';' + pairs(value.entries, ';')
          : ';' + n + '=' + flat(value.entries).join(',')
    }
  }
  // simple
  switch (value.kind) {
    case 'empty':
      return ''
    case 'primitive':
      return enc(value.value)
    case 'array':
      return value.items.map(enc).join(',')
    case 'object':
      return explode ? pairs(value.entries, ',') : flat(value.entries).join(',')
  }
}

function deepObjectPairs(
  prefix: string,
  value: unknown,
  enc: (s: string) => string,
  out: [string, string][],
): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    value.forEach((item, i) => deepObjectPairs(prefix + '[' + i + ']', item, enc, out))
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value))
      deepObjectPairs(prefix + '[' + enc(k) + ']', v, enc, out)
  } else {
    out.push([prefix, enc(stringifyLeaf(value))])
  }
}

/** Builds `name=value` pairs for query/cookie styles. */
function serializePairs(
  name: string,
  value: Normalized,
  style: string,
  explode: boolean,
  enc: (s: string) => string,
  raw: boolean,
): [string, string][] {
  const n = enc(name)
  const flat = (entries: [string, string][]) => entries.flatMap(([k, v]) => [enc(k), enc(v)])

  if (style === 'deepObject' && value.kind === 'object') {
    const out: [string, string][] = []
    for (const [k, v] of Object.entries(value.source))
      deepObjectPairs(n + '[' + enc(k) + ']', v, enc, out)
    return out
  }
  if ((style === 'spaceDelimited' || style === 'pipeDelimited') && !explode) {
    const sep = style === 'pipeDelimited' ? '|' : raw ? ' ' : '%20'
    if (value.kind === 'array') return [[n, value.items.map(enc).join(sep)]]
    if (value.kind === 'object') return [[n, flat(value.entries).join(sep)]]
  }
  // form (and the fallback for undefined combinations)
  switch (value.kind) {
    case 'empty':
      return [[n, '']]
    case 'primitive':
      return [[n, enc(value.value)]]
    case 'array':
      return explode
        ? value.items.map((i): [string, string] => [n, enc(i)])
        : [[n, value.items.map(enc).join(',')]]
    case 'object':
      return explode
        ? value.entries.map(([k, v]): [string, string] => [enc(k), enc(v)])
        : [[n, flat(value.entries).join(',')]]
  }
}

/**
 * Serializes a value for a location with explicit style options. Used by
 * {@link serializeParam} and by form bodies (`raw: true`, query rules).
 */
export function serializeValue(
  location: ParameterIn,
  name: string,
  value: unknown,
  options: StyleOptions = {},
): SerializedParam | undefined {
  const normalized = normalize(value)
  if (!normalized) return undefined
  const style = options.style ?? defaultStyle(location)
  const explode = options.explode ?? style === 'form'
  const raw = options.raw ?? false

  let enc: (s: string) => string
  if (raw || location === 'header') enc = (s) => s
  else if (location === 'cookie') enc = encodeCookie
  else if (location === 'query') enc = (s) => encodeComponent(s, options.allowReserved ?? false)
  else enc = (s) => encodeComponent(s)

  if (location === 'path' || location === 'header') {
    // Header only knows `simple`; path knows simple/label/matrix.
    const single = location === 'header' ? 'simple' : style
    return { in: location, name, value: serializeSingle(name, normalized, single, explode, enc) }
  }
  return { in: location, name, pairs: serializePairs(name, normalized, style, explode, enc, raw) }
}

/**
 * Serializes one parameter value by its `style`/`explode`/`allowReserved`.
 * Parameters described with `content` instead of `schema` are serialized as
 * the media type says (JSON for JSON types, strings as they are).
 * Returns `undefined` when the value should be omitted (undefined, null,
 * empty array or object).
 */
export function serializeParam(param: Parameter, value: unknown): SerializedParam | undefined {
  if (value === undefined || value === null) return undefined
  const mediaType = param.content ? Object.keys(param.content)[0] : undefined
  if (mediaType !== undefined) {
    const text =
      typeof value === 'string' && !isJsonMediaType(mediaType) ? value : JSON.stringify(value)
    switch (param.in) {
      case 'path':
        return { in: 'path', name: param.name, value: encodeComponent(text) }
      case 'header':
        return { in: 'header', name: param.name, value: text }
      case 'cookie':
        return {
          in: 'cookie',
          name: param.name,
          pairs: [[encodeCookie(param.name), encodeCookie(text)]],
        }
      case 'query':
        return {
          in: 'query',
          name: param.name,
          pairs: [
            [encodeComponent(param.name), encodeComponent(text, param.allowReserved ?? false)],
          ],
        }
    }
  }
  return serializeValue(param.in, param.name, value, {
    style: param.style,
    explode: param.explode,
    allowReserved: param.in === 'query' ? param.allowReserved : false,
  })
}
