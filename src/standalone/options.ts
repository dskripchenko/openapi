import type { SnippetTarget } from '../snippets'
import type { SpecSource } from '../vue/context'
import type { PageTheme } from '../vue/page'

/** One spec on the page. The field names follow Scalar's `sources`. */
export interface StandaloneSource {
  /** Where the spec is fetched from (JSON or YAML); read when first opened. */
  url?: string
  /** The spec itself: YAML/JSON text or a parsed object. Wins over `url`. */
  content?: string | object
  /** The switcher's label; the spec's own title by default. */
  title?: string
  /** The spec's id: deep links (`#{slug}/operation/…`) and the open spec. */
  slug?: string
}

export interface StandaloneOptions {
  sources?: StandaloneSource[]
  /** One spec without `sources`: Scalar's top-level shorthand. */
  url?: string
  content?: string | object
  /** 'en', 'ru' or 'auto' (the browser's language). 'auto' by default. */
  locale?: 'en' | 'ru' | 'auto'
  /** 'system' by default: follows `prefers-color-scheme`. */
  theme?: PageTheme
  /** Remembers the theme the visitor picks (localStorage). */
  persistTheme?: boolean
  /** Try-it requests go through this endpoint; see `proxySend` for the contract. */
  proxy?: string
  /** The base a relative server URL resolves against; the page origin by default. */
  baseUrl?: string
  snippetTargets?: SnippetTarget[]
  defaultSnippet?: SnippetTarget
  /** Turns "Try it" off. */
  tryIt?: boolean
  /** Sets `document.title` and the bar's title. */
  title?: string
}

/** Fetches a spec as text: the reference reads JSON and YAML alike. */
export function urlLoader(url: string, fetchFn: typeof fetch = (...a) => globalThis.fetch(...a)): () => Promise<string> {
  return async () => {
    const response = await fetchFn(url, { headers: { Accept: 'application/json, application/yaml, text/yaml, */*' }, credentials: 'same-origin' })
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`.trim())
    return response.text()
  }
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

/** The options' sources as the reference's `specs`, with unique ids. */
export function toSpecSources(options: StandaloneOptions, fetchFn?: typeof fetch): SpecSource[] {
  const list = options.sources?.length ? options.sources : options.url !== undefined || options.content !== undefined ? [{ url: options.url, content: options.content }] : []
  const taken = new Set<string>()
  return list.map((s, i) => {
    let id = s.slug || (s.title ? slugify(s.title) : '') || `api-${i + 1}`
    for (let n = 2; taken.has(id); n++) id = `${s.slug || slugify(s.title ?? '') || 'api'}-${n}`
    taken.add(id)
    const spec = s.content !== undefined ? s.content : s.url !== undefined ? urlLoader(s.url, fetchFn) : ''
    return s.title ? { id, name: s.title, spec } : { id, spec }
  })
}
