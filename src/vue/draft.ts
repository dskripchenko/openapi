/**
 * The draft of one operation's request: the values the user typed into
 * try-it. The code samples print the same draft, so they always show the
 * request that "Send" would make.
 */
import { computed, reactive, toRefs } from 'vue'
import type { Example, HttpRequest, MaybeRef, MediaType, ParameterIn, RequestBody, Schema, SecurityScheme } from '../core/types'
import type { OperationEntry } from '../model'
import { buildRequest, serverUrl, joinUrl } from '../request'
import type { AppliedSecurity } from '../request/security'
import { sample } from '../schema'
import { stringifyJson } from '../json'
import type { ReferenceContext } from './context'

export interface OperationDraft {
  values: Record<ParameterIn, Record<string, string>>
  mediaType: string
  bodyText: string
  /** The body text could not be parsed as JSON (it is sent as typed). */
  readonly bodyInvalid: boolean
  /** The request "Send" makes and the samples print (a computed, unwrapped by reactive). */
  readonly request: HttpRequest
}

/** The media types of a request body, JSON first. */
export function mediaTypes(body: RequestBody | undefined): string[] {
  const types = Object.keys(body?.content ?? {})
  return types.sort((a, b) => Number(!/json/i.test(a)) - Number(!/json/i.test(b)))
}

/** The name of a media type's single `example` among the named ones. */
export const INLINE_EXAMPLE = '#example'
/** The name of the sample generated from the schema. */
export const GENERATED_EXAMPLE = '#generated'

/** One example of a media type or parameter, as a selector offers it. */
export interface NamedExample {
  /** The key in `examples`, INLINE_EXAMPLE or GENERATED_EXAMPLE. */
  name: string
  /** The example's summary, else its key. */
  label: string
  /** Markdown. */
  description?: string
  value?: unknown
  /** A link to an example kept outside the spec; it is not fetched. */
  externalValue?: string
}

/** What carries examples: a media type, a parameter or a header. */
export interface ExampleHolder {
  schema?: Schema
  example?: unknown
  examples?: Record<string, MaybeRef<Example>>
}

/**
 * The examples a spec gives: the single `example` first, then the `examples`
 * map in order (refs followed). With `generated`, a sample from the schema
 * leads the list when there is a schema.
 */
export function namedExamples(holder: ExampleHolder | undefined, ctx: ReferenceContext, generated = false): NamedExample[] {
  if (!holder) return []
  const out: NamedExample[] = []
  if (generated && holder.schema) out.push({ name: GENERATED_EXAMPLE, label: ctx.labels.value.generatedSample })
  if (holder.example !== undefined) out.push({ name: INLINE_EXAMPLE, label: ctx.labels.value.example, value: holder.example })
  for (const [name, raw] of Object.entries(holder.examples ?? {})) {
    const ex = ctx.spec.value.resolver.deref(raw) as Example | undefined
    if (typeof ex !== 'object' || ex === null) continue
    const item: NamedExample = { name, label: typeof ex.summary === 'string' && ex.summary.trim() ? ex.summary : name }
    if (typeof ex.description === 'string' && ex.description) item.description = ex.description
    if (ex.value !== undefined) item.value = ex.value
    else if (typeof ex.externalValue === 'string') item.externalValue = ex.externalValue
    out.push(item)
  }
  return out
}

/** The names of a media type's examples, the generated sample first when there is a schema. */
export function exampleNames(media: ExampleHolder | undefined, ctx: ReferenceContext): string[] {
  return namedExamples(media, ctx, true).map((e) => e.name)
}

/** The example shown by default: the first one with a value, else the generated sample. */
export function defaultExample(media: ExampleHolder | undefined, ctx: ReferenceContext): string {
  return namedExamples(media, ctx).find((e) => e.value !== undefined)?.name ?? GENERATED_EXAMPLE
}

/** A body value as text for its media type: strings as they are, else JSON. */
function bodyText(value: unknown, mediaType: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return /json/i.test(mediaType) || !/xml|text/i.test(mediaType) ? stringifyJson(value, 2) : String(value)
}

/**
 * The text of one example by name; GENERATED_EXAMPLE samples the schema. An
 * external or unknown example gives ''.
 */
export function exampleText(
  media: ExampleHolder | undefined,
  name: string,
  ctx: ReferenceContext,
  mediaType: string,
  mode: 'request' | 'response' = 'request',
): string {
  if (!media) return ''
  if (name === GENERATED_EXAMPLE) {
    if (!media.schema) return ''
    const resolve = (ref: string) => ctx.spec.value.resolver.get(ref) as never
    return bodyText(sample(media.schema, { resolve, mode }), mediaType)
  }
  return bodyText(namedExamples(media, ctx).find((e) => e.name === name)?.value, mediaType)
}

/** The sample body text for a media type: the first example or a generated one. */
export function sampleBody(media: MediaType | undefined, ctx: ReferenceContext, mediaType: string): string {
  return exampleText(media, defaultExample(media, ctx), ctx, mediaType)
}

/** Parses a typed parameter value: JSON for arrays/objects, else the string. */
function parseValue(text: string, schemaType: string | string[] | undefined): unknown {
  const type = Array.isArray(schemaType) ? schemaType.find((t) => t !== 'null') : schemaType
  if (text === '') return undefined
  if (type === 'array' || type === 'object') {
    try {
      return JSON.parse(text)
    } catch {
      return type === 'array' ? text.split(',').map((s) => s.trim()) : text
    }
  }
  if (type === 'integer' || type === 'number') {
    const n = Number(text)
    return Number.isNaN(n) ? text : n
  }
  if (type === 'boolean') return text === 'true' ? true : text === 'false' ? false : text
  return text
}

/** The base URL the chosen server points at. */
export function currentServer(ctx: ReferenceContext, entry?: OperationEntry): string {
  const servers = entry?.operation.servers ?? entry?.pathItem.servers ?? ctx.spec.value.document.servers ?? []
  const { server } = ctx
  const chosen = server.index === -1 ? undefined : (servers[server.index] ?? servers[0])
  // No servers at all means "/", as the spec says: requests go to the page's origin.
  let url = server.index === -1 ? server.custom : chosen ? serverUrl(chosen, server.variables) : '/'
  if (url && !/^[a-z][a-z\d+.-]*:/i.test(url) && ctx.baseUrl.value !== undefined) {
    url = joinUrl(ctx.baseUrl.value, url)
  }
  return url
}

/** The credentials that apply to the operation: the first requirement the user filled. */
export function appliedSecurity(ctx: ReferenceContext, entry: OperationEntry): AppliedSecurity[] {
  const requirements = entry.operation.security ?? ctx.spec.value.document.security ?? []
  const schemes = ctx.spec.value.document.components?.securitySchemes ?? {}
  for (const requirement of requirements) {
    const names = Object.keys(requirement)
    if (names.length === 0) return []
    const applied: AppliedSecurity[] = []
    for (const name of names) {
      const scheme = ctx.spec.value.resolver.deref(schemes[name]) as SecurityScheme | undefined
      const value = ctx.credentials[name]
      if (!scheme || value === undefined || value === '') continue
      if (typeof value === 'object' && !value.username && !value.password) continue
      applied.push({ scheme, value })
    }
    if (applied.length === names.length) return applied
  }
  return []
}

export function createDraft(entry: OperationEntry, ctx: ReferenceContext): OperationDraft {
  const body = ctx.spec.value.resolver.deref(entry.operation.requestBody) as RequestBody | undefined
  const types = mediaTypes(body)
  const values: Record<ParameterIn, Record<string, string>> = { path: {}, query: {}, header: {}, cookie: {} }
  const resolve = (ref: string) => ctx.spec.value.resolver.get(ref) as never
  for (const p of entry.parameters) {
    const example =
      p.example ?? (p.schema ? (p.schema.default ?? p.schema.example ?? p.schema.examples?.[0]) : undefined)
    let preset = example
    // Required parameters get a sample so the request is complete from the start.
    if (preset === undefined && p.required && p.schema) preset = sample(p.schema, { resolve, mode: 'request' })
    if (preset !== undefined) values[p.in][p.name] = typeof preset === 'string' ? preset : JSON.stringify(preset)
  }

  const state = reactive({
    values,
    mediaType: types[0] ?? '',
    bodyText: types[0] ? sampleBody(body?.content[types[0]], ctx, types[0]) : '',
  })
  const draft = state

  const isJson = (mt: string): boolean => /[/+]json\b/i.test(mt)
  const bodyInvalid = computed(() => {
    if (!isJson(draft.mediaType) || draft.bodyText.trim() === '') return false
    try {
      JSON.parse(draft.bodyText)
      return false
    } catch {
      return true
    }
  })

  const request = computed<HttpRequest>(() => {
    const parsed: Partial<Record<ParameterIn, Record<string, unknown>>> = {}
    for (const p of entry.parameters) {
      const text = draft.values[p.in][p.name]
      if (text === undefined) continue
      ;(parsed[p.in] ??= {})[p.name] = parseValue(text, p.schema?.type)
    }
    let bodyValue: unknown
    if (draft.mediaType && draft.bodyText !== '') {
      bodyValue = draft.bodyText
      if (isJson(draft.mediaType) || /form/i.test(draft.mediaType)) {
        try {
          bodyValue = JSON.parse(draft.bodyText)
        } catch {
          // Sent as typed; the form shows the warning.
        }
      }
    }
    return buildRequest({
      method: entry.method.toUpperCase(),
      path: entry.path,
      server: currentServer(ctx, entry),
      parameters: entry.parameters,
      values: parsed,
      body:
        bodyValue !== undefined
          ? { mediaType: draft.mediaType, value: bodyValue, encoding: body?.content[draft.mediaType]?.encoding }
          : undefined,
      security: appliedSecurity(ctx, entry),
    })
  })

  // A reactive object unwraps the computeds it holds: draft.request reads as the request.
  return reactive({ ...toRefs(state), bodyInvalid, request }) as unknown as OperationDraft
}
