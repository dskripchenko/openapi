/**
 * Prefilled links: a link that opens an operation with its try-it form
 * filled. The form is only filled — nothing is ever sent by itself.
 *
 * Format, version 1 (stable; other tools build it, e.g. laravel-api in PHP):
 *
 *     {page}#{anchor}?f={payload}        the payload in the hash
 *     {page}?oa-f={payload}#{anchor}     or as a query parameter (the hash wins)
 *
 * {anchor} is an operation anchor — canonical `[{spec}/]operation/{id}` or any
 * Scalar alias (`{doc}/tag/{tag}/{METHOD}{path}`). {payload} is base64url
 * (RFC 4648 §5, no padding) of one of:
 *
 *     'z' + raw DEFLATE (RFC 1951) of the UTF-8 JSON
 *           browser: CompressionStream('deflate-raw'); PHP: gzdeflate($json)
 *     'j' + the UTF-8 JSON itself
 *
 * The prefix character comes before the base64url text, unencoded:
 * PHP `'z' . rtrim(strtr(base64_encode(gzdeflate($json)), '+/', '-_'), '=')`.
 *
 * The JSON:
 *
 *     {
 *       "v": 1,
 *       "server"?: 0 | "https://…",     index into the servers, or a URL
 *       "vars"?: { "region": "us" },    server variables
 *       "path"?: {…}, "query"?: {…}, "header"?: {…}, "cookie"?: {…},
 *                                       parameter values as typed (strings)
 *       "mediaType"?: "application/json",
 *       "body"?: "{\"a\":1}",           the body text as typed
 *       "auth"?: { "bearer": "token", "basic": { "username": "u", "password": "p" } },
 *       "xQuery"?: [["k", "v"]], "xHeader"?: [["X-Debug", "1"]], "xCookie"?: [["k", "v"]]
 *                                       name/value pairs the spec does not declare, in order
 *     }
 *
 * Every key but `v` is optional and unknown keys are ignored; a `v` above 1
 * is ignored with a warning. Credentials travel only when the author of the
 * link chose to include them. Files never travel.
 */

export const PREFILL_VERSION = 1

/** Parameter values of a prefilled link, by location. */
export type PrefillValues = Record<string, string>

export interface PrefillData {
  v: 1
  /** An index into the operation's servers, or a server URL. */
  server?: number | string
  /** Server variables. */
  vars?: Record<string, string>
  path?: PrefillValues
  query?: PrefillValues
  header?: PrefillValues
  cookie?: PrefillValues
  mediaType?: string
  /** The body text as typed. */
  body?: string
  /** Credentials by security scheme name. */
  auth?: Record<string, string | { username: string; password: string }>
  /** Undeclared query parameters, headers and cookies the user added, as name/value pairs. */
  xQuery?: [string, string][]
  xHeader?: [string, string][]
  xCookie?: [string, string][]
}

/** The most a payload may inflate to: a link is not a way to ship megabytes. */
const MAX_JSON = 1 << 20

const canCompress = (): boolean => {
  try {
    return typeof CompressionStream !== 'undefined' && !!new CompressionStream('deflate-raw')
  } catch {
    return false
  }
}

/** Encodes prefill data: `z` + deflated JSON where CompressionStream is there, else `j` + JSON. */
export async function encodePrefill(data: PrefillData, opts: { compress?: boolean } = {}): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data))
  if (opts.compress ?? canCompress()) return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))
  return 'j' + toBase64Url(bytes)
}

/** Decodes a payload; null when it is malformed, of an unknown kind, or of a later version. */
export async function decodePrefill(payload: string): Promise<PrefillData | null> {
  try {
    const kind = payload[0]
    let bytes = fromBase64Url(payload.slice(1))
    if (!bytes) return null
    if (kind === 'z') {
      if (typeof DecompressionStream === 'undefined') return null
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_JSON)
    } else if (kind !== 'j') return null
    if (bytes.length > MAX_JSON) return null
    return sanitize(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } catch {
    return null
  }
}

/** The hash of a prefilled link (without `#`). */
export function prefillHash(anchor: string, payload: string): string {
  return `${anchor}?f=${payload}`
}

/* ------------------------------- helpers ------------------------------- */

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const writer = transform.writable.getWriter()
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {})
  void writer.close().catch(() => {})
  const reader = transform.readable.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error('payload too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A map of strings; numbers and booleans are taken as their text, anything else is dropped. */
function strings(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === 'string') out[k] = x
    else if (typeof x === 'number' || typeof x === 'boolean') out[k] = String(x)
  }
  return out
}

/** A list of name/value pairs of strings; malformed pairs are dropped. */
function pairs(v: unknown): [string, string][] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: [string, string][] = []
  for (const pair of v) {
    if (Array.isArray(pair) && typeof pair[0] === 'string' && (typeof pair[1] === 'string' || typeof pair[1] === 'number' || typeof pair[1] === 'boolean'))
      out.push([pair[0], String(pair[1])])
  }
  return out
}

/** Keeps the known keys of the right types; null for anything that is not version 1. */
function sanitize(raw: unknown): PrefillData | null {
  if (!isRecord(raw) || typeof raw.v !== 'number') return null
  if (raw.v > PREFILL_VERSION) {
    console.warn(`[openapi] a prefilled link of version ${raw.v} is not supported (up to ${PREFILL_VERSION}); ignored`)
    return null
  }
  if (raw.v !== PREFILL_VERSION) return null
  const data: PrefillData = { v: 1 }
  if ((typeof raw.server === 'number' && Number.isInteger(raw.server) && raw.server >= 0) || typeof raw.server === 'string')
    data.server = raw.server
  const vars = strings(raw.vars)
  if (vars) data.vars = vars
  for (const loc of ['path', 'query', 'header', 'cookie'] as const) {
    const values = strings(raw[loc])
    if (values) data[loc] = values
  }
  if (typeof raw.mediaType === 'string') data.mediaType = raw.mediaType
  if (typeof raw.body === 'string') data.body = raw.body
  if (isRecord(raw.auth)) {
    const auth: NonNullable<PrefillData['auth']> = {}
    for (const [name, value] of Object.entries(raw.auth)) {
      if (typeof value === 'string') auth[name] = value
      else if (isRecord(value))
        auth[name] = { username: String(value.username ?? ''), password: String(value.password ?? '') }
    }
    data.auth = auth
  }
  for (const key of ['xQuery', 'xHeader', 'xCookie'] as const) {
    const list = pairs(raw[key])
    if (list?.length) data[key] = list
  }
  return data
}
