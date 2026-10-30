/**
 * AsyncAPI 2.x and 3.0, read into one shape.
 *
 * The two versions describe the same things differently: 2.x hangs
 * `publish`/`subscribe` operations under channels keyed by their address,
 * 3.0 keeps channels and operations apart and says `send`/`receive` from the
 * application's point of view. Both become operations with an `action`
 * (2.x `subscribe` → `send`, `publish` → `receive`), channels with an
 * address, and messages with their headers, payload and examples. Traits
 * are applied; `$ref`s are followed.
 */
import type { OpenApiDocument, Schema } from '../core/types'
import { parseSpec } from '../load'
import { OpenApiError } from '../model/errors'
import { createResolver, type Resolver, type ResolverOptions } from '../model/resolver'
import { isObject, isRef, type Obj } from '../model/util'

export interface AsyncTag {
  name: string
  description?: string
}

export interface AsyncServer {
  id: string
  /** `protocol://host/path` as written, variables still in braces. */
  url: string
  protocol: string
  protocolVersion?: string
  title?: string
  summary?: string
  description?: string
  variables: { name: string; default?: string; enum?: string[]; description?: string }[]
  security: unknown[]
  tags: AsyncTag[]
  bindings?: Obj
}

export interface AsyncParameter {
  name: string
  description?: string
  schema?: Schema
  /** Where the value comes from in the message (`$message.payload#/user/id`). */
  location?: string
}

export interface AsyncMessageExample {
  name?: string
  summary?: string
  headers?: unknown
  payload?: unknown
}

export interface AsyncMessage {
  /** The component name, or a made-up one for an inline message. */
  key: string
  name?: string
  title?: string
  summary?: string
  description?: string
  contentType?: string
  /** A JSON Schema payload (AsyncAPI schemas are JSON Schema). */
  payload?: Schema
  /** A payload in another schema language (Avro, Protobuf, RAML…), as written, with its format. */
  foreignPayload?: { format: string; schema: unknown }
  headers?: Schema
  examples: AsyncMessageExample[]
  correlationId?: { location?: string; description?: string }
  tags: AsyncTag[]
  bindings?: Obj
  deprecated?: boolean
}

export interface AsyncChannel {
  id: string
  /** The address with its `{parameters}`; null in 3.0 for a dynamic channel. */
  address: string | null
  title?: string
  summary?: string
  description?: string
  parameters: AsyncParameter[]
  messages: AsyncMessage[]
  /** Server ids the channel is available on; all of them when empty. */
  servers: string[]
  tags: AsyncTag[]
  bindings?: Obj
}

export type AsyncAction = 'send' | 'receive'

export interface AsyncOperation {
  id: string
  action: AsyncAction
  /** The channel's id. */
  channel: string
  title?: string
  summary?: string
  description?: string
  tags: AsyncTag[]
  messages: AsyncMessage[]
  security: unknown[]
  bindings?: Obj
  deprecated?: boolean
  /** AsyncAPI 3.0 request/reply. */
  reply?: { address?: string; channel?: string; messages: AsyncMessage[] }
}

export interface AsyncApiSpec {
  /** `2.6.0`, `3.0.0`… */
  version: string
  info: Obj & { title: string; version: string; description?: string }
  defaultContentType?: string
  servers: AsyncServer[]
  channels: AsyncChannel[]
  operations: AsyncOperation[]
  /** Messages defined under `components.messages`. */
  messages: AsyncMessage[]
  /** Names of `components.schemas`. */
  schemas: string[]
  tags: AsyncTag[]
  /** The document as given. */
  raw: Obj
  resolver: Resolver
  warnings: string[]
}

export type SpecKind = 'openapi' | 'asyncapi'

/** Whether a parsed document is OpenAPI/Swagger or AsyncAPI; null for neither. */
export function detectSpecKind(raw: unknown): SpecKind | null {
  if (!isObject(raw)) return null
  if (raw.asyncapi !== undefined) return 'asyncapi'
  if (raw.openapi !== undefined || raw.swagger !== undefined) return 'openapi'
  return null
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const obj = (v: unknown): Obj | undefined => (isObject(v) ? v : undefined)
const lastSegment = (ref: string) => decodeURIComponent(ref.slice(ref.lastIndexOf('/') + 1)).replace(/~1/g, '/').replace(/~0/g, '~')

/** Whether a `schemaFormat` names JSON Schema (or AsyncAPI's superset of it). */
function isJsonSchemaFormat(format: string | undefined): boolean {
  if (!format) return true
  return /asyncapi|schema\+json|schema\+yaml|application\/json|application\/yaml/i.test(format)
}

/** Loads an AsyncAPI document from YAML/JSON text or a parsed object. */
export function loadAsyncApi(input: string | object, opts: ResolverOptions = {}): AsyncApiSpec {
  const raw = typeof input === 'string' ? parseSpec(input).value : input
  if (!isObject(raw) || raw.asyncapi === undefined) throw new OpenApiError('Not an AsyncAPI document: no "asyncapi" field found')
  const version = String(raw.asyncapi)
  const major = /^(\d+)\./.exec(version)?.[1]
  if (major !== '2' && major !== '3') throw new OpenApiError(`Unsupported AsyncAPI version "${version}"`)
  const resolver = createResolver(raw as unknown as OpenApiDocument, opts)
  const warnings: string[] = []
  const deref = <T = Obj>(v: unknown): T | undefined => resolver.deref<T>(v as T)
  const tagsOf = (v: unknown): AsyncTag[] =>
    (Array.isArray(v) ? v : [])
      .map((t) => deref<Obj>(t))
      .filter((t): t is Obj => !!t && typeof t.name === 'string')
      .map((t) => ({ name: t.name as string, description: str(t.description) }))

  /** Applies traits: their fields fill what the object does not set itself. */
  const withTraits = (value: Obj): Obj => {
    const traits = Array.isArray(value.traits) ? value.traits : []
    if (traits.length === 0) return value
    const out: Obj = {}
    for (const t of traits) {
      const trait = deref<Obj>(t)
      if (trait) Object.assign(out, trait)
    }
    Object.assign(out, value)
    delete out.traits
    return out
  }

  const schemaOf = (v: unknown): Schema | undefined => {
    if (v === undefined) return undefined
    // Keep refs: the schema component resolves them and shows their names.
    return (isRef(v) || isObject(v) ? v : undefined) as Schema | undefined
  }

  const messageCache = new Map<string, AsyncMessage>()
  const messageOf = (value: unknown, fallbackKey: string): AsyncMessage | undefined => {
    const refKey = isRef(value) ? value.$ref : undefined
    if (refKey && messageCache.has(refKey)) return messageCache.get(refKey)
    const m0 = deref<Obj>(value)
    if (!m0) {
      if (refKey) warnings.push(`The message "${refKey}" cannot be resolved`)
      return undefined
    }
    const m = withTraits(m0)
    let payload: Schema | undefined
    let foreignPayload: AsyncMessage['foreignPayload']
    // 3.0: a payload may be a multi-format schema `{ schemaFormat, schema }`.
    const p = deref<Obj>(m.payload)
    const multi = major === '3' && p && typeof p.schemaFormat === 'string' && 'schema' in p
    const format = multi ? (p!.schemaFormat as string) : str(m.schemaFormat)
    const body = multi ? p!.schema : m.payload
    if (isJsonSchemaFormat(format)) payload = schemaOf(body)
    else foreignPayload = { format: format!, schema: deref(body) ?? body }
    const headers = deref<Obj>(m.headers)
    const headerSchema = headers && typeof headers.schemaFormat === 'string' && 'schema' in headers ? schemaOf(headers.schema) : schemaOf(m.headers)
    const correlation = deref<Obj>(m.correlationId)
    const message: AsyncMessage = {
      key: refKey ? lastSegment(refKey) : (str(m.name) ?? str(m.messageId) ?? fallbackKey),
      name: str(m.name) ?? str(m.messageId),
      title: str(m.title),
      summary: str(m.summary),
      description: str(m.description),
      contentType: str(m.contentType) ?? str(raw.defaultContentType),
      payload,
      foreignPayload,
      headers: headerSchema,
      examples: (Array.isArray(m.examples) ? m.examples : []).map((e) => deref<Obj>(e)).filter((e): e is Obj => !!e).map((e) => ({ name: str(e.name), summary: str(e.summary), headers: e.headers, payload: e.payload })),
      correlationId: correlation ? { location: str(correlation.location), description: str(correlation.description) } : undefined,
      tags: tagsOf(m.tags),
      bindings: obj(deref(m.bindings)),
      deprecated: m.deprecated === true ? true : undefined,
    }
    if (refKey) messageCache.set(refKey, message)
    return message
  }

  /** 2.x: a message, a `oneOf` of messages, or a ref to either. */
  const messagesOf2 = (value: unknown, key: string): AsyncMessage[] => {
    const m = deref<Obj>(value)
    if (!m) return []
    if (Array.isArray(m.oneOf)) return m.oneOf.map((x, i) => messageOf(x, `${key}-${i + 1}`)).filter((x): x is AsyncMessage => !!x)
    const one = messageOf(value, key)
    return one ? [one] : []
  }

  const parametersOf = (v: unknown): AsyncParameter[] =>
    Object.entries(obj(deref(v)) ?? {}).map(([name, p0]) => {
      const p = deref<Obj>(p0) ?? {}
      let schema = schemaOf(p.schema)
      // 3.0 parameters carry the schema's fields themselves.
      if (!schema && (p.enum || p.default !== undefined || p.examples)) {
        schema = { type: 'string', enum: p.enum as unknown[] | undefined, default: p.default, examples: p.examples as unknown[] | undefined }
      }
      return { name, description: str(p.description), schema, location: str(p.location) }
    })

  // Servers.
  const servers: AsyncServer[] = Object.entries(obj(raw.servers) ?? {}).map(([id, s0]) => {
    const s = deref<Obj>(s0) ?? {}
    const protocol = str(s.protocol) ?? ''
    const url = major === '3' ? `${protocol ? `${protocol}://` : ''}${str(s.host) ?? ''}${str(s.pathname) ?? ''}` : (str(s.url) ?? '')
    return {
      id,
      url,
      protocol,
      protocolVersion: str(s.protocolVersion),
      title: str(s.title),
      summary: str(s.summary),
      description: str(s.description),
      variables: Object.entries(obj(s.variables) ?? {}).map(([name, v0]) => {
        const v = deref<Obj>(v0) ?? {}
        return { name, default: str(v.default), enum: Array.isArray(v.enum) ? v.enum.map(String) : undefined, description: str(v.description) }
      }),
      security: Array.isArray(s.security) ? s.security : [],
      tags: tagsOf(s.tags),
      bindings: obj(deref(s.bindings)),
    }
  })

  const channels: AsyncChannel[] = []
  const operations: AsyncOperation[] = []

  if (major === '2') {
    for (const [address, c0] of Object.entries(obj(raw.channels) ?? {})) {
      const c = deref<Obj>(c0) ?? {}
      const channel: AsyncChannel = {
        id: address,
        address,
        description: str(c.description),
        parameters: parametersOf(c.parameters),
        messages: [],
        servers: Array.isArray(c.servers) ? c.servers.map(String) : [],
        tags: [],
        bindings: obj(deref(c.bindings)),
      }
      for (const verb of ['subscribe', 'publish'] as const) {
        const o0 = deref<Obj>(c[verb])
        if (!o0) continue
        const o = withTraits(o0)
        const id = str(o.operationId) ?? `${address}.${verb}`
        const messages = messagesOf2(o.message, `${id}-message`)
        for (const m of messages) if (!channel.messages.includes(m)) channel.messages.push(m)
        operations.push({
          id,
          // 2.x speaks from the client's side: a channel the application
          // "subscribes" to is one the application sends on.
          action: verb === 'subscribe' ? 'send' : 'receive',
          channel: address,
          summary: str(o.summary),
          description: str(o.description),
          tags: tagsOf(o.tags),
          messages,
          security: Array.isArray(o.security) ? o.security : [],
          bindings: obj(deref(o.bindings)),
          deprecated: o.deprecated === true ? true : undefined,
        })
      }
      channels.push(channel)
    }
  } else {
    const channelIdOf = (ref: unknown): string | undefined => (isRef(ref) && ref.$ref.startsWith('#/channels/') ? lastSegment(ref.$ref) : undefined)
    for (const [id, c0] of Object.entries(obj(raw.channels) ?? {})) {
      const c = deref<Obj>(c0) ?? {}
      channels.push({
        id,
        address: c.address === null ? null : (str(c.address) ?? null),
        title: str(c.title),
        summary: str(c.summary),
        description: str(c.description),
        parameters: parametersOf(c.parameters),
        messages: Object.entries(obj(deref(c.messages)) ?? {})
          .map(([key, m]) => messageOf(m, key))
          .filter((m): m is AsyncMessage => !!m),
        servers: (Array.isArray(c.servers) ? c.servers : []).map((s) => (isRef(s) ? lastSegment(s.$ref) : '')).filter(Boolean),
        tags: tagsOf(c.tags),
        bindings: obj(deref(c.bindings)),
      })
    }
    for (const [id, o0] of Object.entries(obj(raw.operations) ?? {})) {
      const raw0 = deref<Obj>(o0)
      if (!raw0) continue
      const o = withTraits(raw0)
      const channelId = channelIdOf(o.channel)
      const channel = channels.find((c) => c.id === channelId)
      if (!channel) warnings.push(`The operation "${id}" refers to a channel that is not in the document`)
      const listed = Array.isArray(o.messages) ? o.messages.map((m, i) => messageOf(m, `${id}-message-${i + 1}`)).filter((m): m is AsyncMessage => !!m) : (channel?.messages ?? [])
      const reply0 = deref<Obj>(o.reply)
      let reply: AsyncOperation['reply']
      if (reply0) {
        const address = deref<Obj>(reply0.address)
        const replyChannel = channelIdOf(reply0.channel)
        reply = {
          address: str(address?.location),
          channel: replyChannel,
          messages: Array.isArray(reply0.messages)
            ? reply0.messages.map((m, i) => messageOf(m, `${id}-reply-${i + 1}`)).filter((m): m is AsyncMessage => !!m)
            : (channels.find((c) => c.id === replyChannel)?.messages ?? []),
        }
      }
      const action = o.action === 'receive' ? 'receive' : 'send'
      if (o.action !== 'send' && o.action !== 'receive') warnings.push(`The operation "${id}" has no valid action; "send" is assumed`)
      operations.push({
        id,
        action,
        channel: channelId ?? '',
        title: str(o.title),
        summary: str(o.summary),
        description: str(o.description),
        tags: tagsOf(o.tags),
        messages: listed,
        security: Array.isArray(o.security) ? o.security : [],
        bindings: obj(deref(o.bindings)),
        deprecated: o.deprecated === true ? true : undefined,
        reply,
      })
    }
  }

  const components = obj(raw.components) ?? {}
  const messages = Object.entries(obj(components.messages) ?? {})
    .map(([key]) => messageOf({ $ref: `#/components/messages/${key.replace(/~/g, '~0').replace(/\//g, '~1')}` }, key))
    .filter((m): m is AsyncMessage => !!m)
  const info = obj(raw.info) ?? {}
  return {
    version,
    info: { ...info, title: str(info.title) ?? 'AsyncAPI', version: str(info.version) ?? '' },
    defaultContentType: str(raw.defaultContentType),
    servers,
    channels,
    operations,
    messages,
    schemas: Object.keys(obj(components.schemas) ?? {}),
    tags: tagsOf(major === '3' ? info.tags : raw.tags),
    raw,
    resolver,
    warnings,
  }
}

/** Operations grouped by their first tag, or by channel when none has tags. */
export function groupAsyncOperations(spec: AsyncApiSpec): { name: string; operations: AsyncOperation[] }[] {
  const tagged = spec.operations.some((o) => o.tags.length > 0)
  const groups = new Map<string, AsyncOperation[]>()
  for (const o of spec.operations) {
    const key = tagged ? (o.tags[0]?.name ?? '') : (spec.channels.find((c) => c.id === o.channel)?.address ?? o.channel)
    groups.set(key, [...(groups.get(key) ?? []), o])
  }
  return [...groups].map(([name, operations]) => ({ name, operations }))
}
