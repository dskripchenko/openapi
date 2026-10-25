/**
 * Deep links: our own anchors and the ones Scalar builds.
 *
 * Canonical anchors of the reference (`{spec}/` only when a page has several):
 *
 *     [{spec}/]operation/{operationId}
 *     [{spec}/]schema/{name}
 *     [{spec}/]tag/{name}
 *
 * Scalar's forms are understood as aliases, so links built for a Scalar page
 * (laravel-api's DocLink, its IDE plugin) keep working:
 *
 *     [{doc}/]tag/{tagSlug}/{METHOD}{path}    an operation
 *     [{doc}/]tag/{tagSlug}                   a tag
 *     [{doc}/]model/{name}                    a schema
 *
 * Resolution runs in two steps, because a spec may still have to be loaded
 * between them: `pickSpec` reads the document segment, `resolveSection` maps
 * the rest onto a loaded spec.
 */
import { HTTP_METHODS, type Server } from '../core/types'
import type { LoadedSpec, OperationEntry } from '../model'
import { serverUrl } from '../request/server'

/**
 * Scalar's slug rule (`@scalar/api-reference` 1.x), the same as DocLink::slug
 * in laravel-api: the first 255 characters, NFC, lowercase, only letters,
 * marks, digits, whitespace, `_` and `-` kept, runs of `[\s_-]` collapsed to
 * one `-`, trimmed of `-`. Idempotent.
 */
export function scalarSlug(text: string): string {
  return Array.from(text.trim())
    .slice(0, 255)
    .join('')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/[\s_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** DocLink::documentSlug: dots and slashes become hyphens first, so `v1.1` is `v1-1`, not `v11`. */
export function scalarDocumentSlug(version: string): string {
  return scalarSlug(version.replace(/[./\\]/g, '-'))
}

/** The parts of a hash (without `#`): the anchor and the prefill payload of `?f=`. */
export function splitLink(hash: string): { anchor: string; payload?: string } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const q = raw.indexOf('?')
  const anchor = safeDecode(q === -1 ? raw : raw.slice(0, q))
  if (q === -1) return { anchor }
  const payload = new URLSearchParams(raw.slice(q + 1)).get('f')
  return payload ? { anchor, payload } : { anchor }
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const SECTIONS = ['operation', 'schema', 'tag', 'model']

/** A spec a link can name: its id and, optionally, its display name. */
export interface LinkSpec {
  id: string
  name?: string
}

/**
 * Splits off the document segment of an anchor. `spec` is the id it names —
 * the spec whose id equals the segment, else whose slugified id or name does.
 * A segment that names no spec but stands before a section (`v1/tag/…` on a
 * single-spec page) is dropped, and `spec` stays unset: the open spec is meant.
 */
export function pickSpec(anchor: string, specs: LinkSpec[]): { spec?: string; rest: string } {
  const slash = anchor.indexOf('/')
  const first = slash === -1 ? anchor : anchor.slice(0, slash)
  const rest = slash === -1 ? '' : anchor.slice(slash + 1)
  const exact = specs.find((s) => s.id === first)
  if (exact) return { spec: exact.id, rest }
  if (SECTIONS.includes(first)) return { rest: anchor }
  const slugged = specs.find((s) =>
    [s.id, s.name].some((t) => t !== undefined && t !== '' && (scalarSlug(t) === first || scalarDocumentSlug(t) === first)),
  )
  if (slugged) return { spec: slugged.id, rest }
  const second = rest.split('/', 1)[0]!
  if (SECTIONS.includes(second)) return { rest }
  return { rest: anchor }
}

/**
 * Maps the part of an anchor after the document segment onto a canonical
 * section of `spec`: `operation/{id}`, `schema/{name}` or `tag/{name}`.
 * Null when it names nothing of the spec.
 */
export function resolveSection(rest: string, spec: LoadedSpec): string | null {
  if (rest.startsWith('operation/') || rest.startsWith('schema/')) return rest
  if (rest.startsWith('model/')) {
    const name = rest.slice('model/'.length)
    const names = Object.keys(spec.document.components?.schemas ?? {})
    const found = names.find((n) => n === name) ?? names.find((n) => scalarSlug(n) === scalarSlug(name))
    return found !== undefined ? `schema/${found}` : null
  }
  if (!rest.startsWith('tag/')) return null
  const tail = rest.slice('tag/'.length)
  // Our own tag anchor carries the name as it is, slashes and all.
  if (spec.groups.some((g) => g.name === tail)) return `tag/${tail}`

  const [tagSlug = '', method = '', ...segments] = tail.split('/')
  const group = spec.groups.find((g) => scalarSlug(g.name) === scalarSlug(tagSlug))
  const lower = method.toLowerCase()
  if ((HTTP_METHODS as readonly string[]).includes(lower) && segments.length) {
    const path = '/' + segments.join('/')
    const matches = spec.operations.filter((e) => !e.webhook && e.method === lower && pathMatches(path, e, spec))
    const inTag = matches.find((e) => e.tags.some((t) => scalarSlug(t) === scalarSlug(tagSlug)))
    const entry = inTag ?? matches[0]
    if (entry) return `operation/${entry.id}`
  }
  return group ? `tag/${group.name}` : null
}

const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** The path part of a server URL with its variables at their defaults: `/api/v2`, or '' for none. */
function basePath(server: Server): string {
  const url = serverUrl(server)
  const path = url.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, '').replace(/[?#].*$/, '')
  return path.replace(/\/+$/, '')
}

/**
 * A link's path names an operation when it is the operation's path, or that
 * path with a server's base path in front (or the other way round): a link
 * built from the full URI meets a spec that keeps the prefix in `servers`.
 */
function pathMatches(path: string, entry: OperationEntry, spec: LoadedSpec): boolean {
  const link = trimSlash(path)
  const own = trimSlash(entry.path)
  if (link === own) return true
  const servers = entry.operation.servers ?? entry.pathItem.servers ?? spec.document.servers ?? []
  for (const server of servers) {
    const base = basePath(server)
    if (!base) continue
    if (link === trimSlash(base + own) || trimSlash(base + link) === own) return true
  }
  return false
}
