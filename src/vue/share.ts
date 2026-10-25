/**
 * Prefilled links on the reference's side: filling a draft from a link and
 * making a link from a draft. The format lives in `../links/prefill`.
 */
import type { ParameterIn, RequestBody, Server } from '../core/types'
import type { PrefillData } from '../links'
import type { OperationEntry } from '../model'
import { serverUrl } from '../request'
import type { ReferenceContext } from './context'
import { mediaTypes, sampleBody, type ExtraLocation, type OperationDraft } from './draft'

const LOCATIONS: ParameterIn[] = ['path', 'query', 'header', 'cookie']

const serversOf = (ctx: ReferenceContext, entry: OperationEntry): Server[] =>
  entry.operation.servers ?? entry.pathItem.servers ?? ctx.spec.value.document.servers ?? []

const defaultsOf = (server: Server | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(server?.variables ?? {}).map(([k, v]) => [k, v.default]))

/** Fills the draft, the chosen server and (when the link has them) the credentials. Never sends. */
export function applyPrefill(draft: OperationDraft, data: PrefillData, entry: OperationEntry, ctx: ReferenceContext): void {
  const servers = serversOf(ctx, entry)
  if (data.server !== undefined) {
    const index =
      typeof data.server === 'number'
        ? data.server < servers.length ? data.server : -2
        : servers.findIndex((s) => s.url === data.server || serverUrl(s, data.vars) === data.server)
    if (index >= 0) {
      ctx.server.index = index
      ctx.server.variables = defaultsOf(servers[index])
    } else if (typeof data.server === 'string') {
      ctx.server.index = -1
      ctx.server.custom = data.server
    }
  }
  if (data.vars) Object.assign(ctx.server.variables, data.vars)
  if (data.auth) Object.assign(ctx.credentials, data.auth)

  for (const loc of LOCATIONS) {
    for (const [name, value] of Object.entries(data[loc] ?? {})) {
      // Header names match whatever their case; the rest as declared.
      const p = entry.parameters.find(
        (x) => x.in === loc && (x.name === name || (loc === 'header' && x.name.toLowerCase() === name.toLowerCase())),
      )
      if (p) draft.values[loc][p.name] = value
    }
  }
  const body = ctx.spec.value.resolver.deref(entry.operation.requestBody) as RequestBody | undefined
  if (data.mediaType && data.mediaType !== draft.mediaType && mediaTypes(body).includes(data.mediaType)) {
    draft.mediaType = data.mediaType
    draft.bodyText = sampleBody(body?.content[data.mediaType], ctx, data.mediaType)
  }
  if (data.body !== undefined && draft.mediaType) draft.bodyText = data.body
  for (const [loc, key] of EXTRA_KEYS) {
    const pairs = data[key]
    if (pairs?.length) draft.extra[loc] = pairs.map(([k, v]): [string, string] => [k, v])
  }
}

/** The link keys of the undeclared name/value rows. */
const EXTRA_KEYS = [
  ['query', 'xQuery'],
  ['header', 'xHeader'],
  ['cookie', 'xCookie'],
] as const satisfies readonly (readonly [ExtraLocation, keyof PrefillData])[]

/**
 * The prefill data of a draft. Kept short: empty values are skipped, and so
 * are the first server with its default variables, the first media type, and
 * a body equal to the generated sample — the page makes those by itself.
 */
export function draftPrefill(draft: OperationDraft, entry: OperationEntry, ctx: ReferenceContext, withCredentials: boolean): PrefillData {
  const data: PrefillData = { v: 1 }
  const servers = serversOf(ctx, entry)
  const { index } = ctx.server
  if (index === -1) {
    if (ctx.server.custom) data.server = ctx.server.custom
  } else {
    if (index > 0) data.server = index
    const defaults = defaultsOf(servers[index] ?? servers[0])
    const vars = Object.fromEntries(Object.entries(ctx.server.variables).filter(([k, v]) => v !== '' && v !== defaults[k]))
    if (Object.keys(vars).length) data.vars = vars
  }
  for (const loc of LOCATIONS) {
    const values = Object.fromEntries(Object.entries(draft.values[loc]).filter(([, v]) => v !== ''))
    if (Object.keys(values).length) data[loc] = values
  }
  const body = ctx.spec.value.resolver.deref(entry.operation.requestBody) as RequestBody | undefined
  const types = mediaTypes(body)
  if (draft.mediaType && draft.mediaType !== types[0]) data.mediaType = draft.mediaType
  if (draft.mediaType && draft.bodyText !== '' && draft.bodyText !== sampleBody(body?.content[draft.mediaType], ctx, draft.mediaType))
    data.body = draft.bodyText
  for (const [loc, key] of EXTRA_KEYS) {
    const pairs = draft.extra[loc].filter(([k]) => k.trim() !== '').map(([k, v]): [string, string] => [k, v])
    if (pairs.length) data[key] = pairs
  }
  if (withCredentials) {
    const auth: NonNullable<PrefillData['auth']> = {}
    for (const [name, value] of Object.entries(ctx.credentials)) {
      if (typeof value === 'string') {
        if (value !== '') auth[name] = value
      } else if (value && (value.username || value.password)) auth[name] = { username: value.username ?? '', password: value.password ?? '' }
    }
    if (Object.keys(auth).length) data.auth = auth
  }
  return data
}

/** The page's address without its hash and without a prefill query parameter. */
export function pageAddress(): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.delete('oa-f')
  return url.toString().replace(/#$/, '')
}

/** Copies text to the clipboard: the async API where allowed, else a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      ta.remove()
    }
  }
}
