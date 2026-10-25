/**
 * The draft of one operation's request: the values the user typed into
 * try-it. The code samples print the same draft, so they always show the
 * request that "Send" would make.
 */
import { computed, reactive, toRefs } from 'vue'
import type { HttpRequest, MediaType, ParameterIn, RequestBody, SecurityScheme } from '../core/types'
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

/** The sample body text for a media type: the example or a generated one. */
export function sampleBody(media: MediaType | undefined, ctx: ReferenceContext, mediaType: string): string {
  if (!media) return ''
  const resolve = (ref: string) => ctx.spec.value.resolver.get(ref) as never
  let value: unknown = media.example
  if (value === undefined && media.examples) {
    const first = Object.values(media.examples)[0]
    value = first ? (ctx.spec.value.resolver.deref(first) as { value?: unknown } | undefined)?.value : undefined
  }
  if (value === undefined && media.schema) value = sample(media.schema, { resolve, mode: 'request' })
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return /json/i.test(mediaType) || !/xml|text/i.test(mediaType) ? stringifyJson(value, 2) : String(value)
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
