/**
 * Full-text search over one loaded spec. The index is built once per spec:
 * an entry per operation, tag, schema and heading of the description, each
 * with weighted text fields. A query is split into words; every word must
 * match some field of an entry (AND), and the entry scores by where and how
 * the words matched — a whole field, the start of a word, or anywhere.
 */
import type { MediaType, Parameter, RequestBody, Response, Schema } from '../core/types'
import type { LoadedSpec, OperationEntry } from '../model'

export type SearchKind = 'operation' | 'tag' | 'schema' | 'heading'

interface Field {
  text: string
  /** `text` lowercased for matching, the same length. */
  lower: string
  weight: number
  /** Shown as the title of the result, so it needs no snippet. */
  title?: boolean
}

export interface SearchEntry {
  kind: SearchKind
  /** The local anchor: `operation/{id}`, `tag/{name}`, `schema/{name}`, or `heading/{text}`. */
  key: string
  title: string
  method?: string
  path?: string
  fields: Field[]
  /** All fields joined, lowercased: a quick check before scoring. */
  all: string
}

/** A piece of shown text; `mark` pieces matched the query. */
export interface SearchSegment {
  text: string
  mark: boolean
}

export interface SearchHit {
  entry: SearchEntry
  score: number
  title: SearchSegment[]
  /** Where the words matched outside the title, around the first match. */
  snippet?: SearchSegment[]
}

export interface SearchIndex {
  entries: SearchEntry[]
  /** The best hits, highest score first. */
  search(query: string, limit?: number): SearchHit[]
  /** The keys of every entry the query matches; null for an empty query. */
  matches(query: string): Set<string> | null
}

const W = { title: 10, path: 8, name: 9, id: 7, param: 5, tag: 4, property: 2.5, method: 3, description: 1.5, paramDescription: 1 }
/** Descriptions longer than this are cut: the start says what matters, and the index stays small. */
const MAX_TEXT = 4000
const SNIPPET = 90

/** Lowercases keeping offsets, so a match in `lower` marks the same span in the text. */
export function fold(text: string): string {
  const lower = text.toLowerCase()
  const folded = lower.length === text.length ? lower : Array.from(text, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c)).join('')
  return folded.replace(/ё/g, 'е')
}

/** Markdown as plain text: links keep their words, markup goes. */
function plain(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_>#|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
}

function field(text: string | undefined, weight: number, title = false): Field | undefined {
  if (!text) return undefined
  const f: Field = { text, lower: fold(text), weight }
  if (title) f.title = true
  return f
}

function entry(kind: SearchKind, key: string, title: string, fields: (Field | undefined)[], extra: Partial<SearchEntry> = {}): SearchEntry {
  const list = fields.filter((f): f is Field => !!f)
  return { kind, key, title, fields: list, all: list.map((f) => f.lower).join('\u0000'), ...extra }
}

/** Property names of a schema, two levels deep, following refs, compositions and array items. */
function propertyNames(schema: Schema | undefined, spec: LoadedSpec, depth = 0, seen = new Set<string>(), out = new Set<string>()): Set<string> {
  if (!schema || typeof schema !== 'object' || depth >= 2) return out
  let s = schema
  if (s.$ref) {
    if (seen.has(s.$ref)) return out
    seen = new Set(seen).add(s.$ref)
    s = (spec.resolver.get(s.$ref) as Schema | undefined) ?? {}
  }
  for (const part of [...(s.allOf ?? []), ...(s.oneOf ?? []), ...(s.anyOf ?? [])]) propertyNames(part, spec, depth, seen, out)
  if (s.items && typeof s.items === 'object') propertyNames(s.items, spec, depth, seen, out)
  for (const [name, p] of Object.entries(s.properties ?? {})) {
    out.add(name)
    propertyNames(p, spec, depth + 1, seen, out)
  }
  return out
}

function operationEntry(e: OperationEntry, spec: LoadedSpec, tagNames: Map<string, string>): SearchEntry {
  const op = e.operation
  const deref = <T>(v: unknown): T | undefined => spec.resolver.deref(v as never) as T | undefined
  const props = new Set<string>()
  const media: MediaType[] = []
  const body = deref<RequestBody>(op.requestBody)
  media.push(...Object.values(body?.content ?? {}))
  for (const r of Object.values(op.responses ?? {})) media.push(...Object.values(deref<Response>(r)?.content ?? {}))
  for (const m of media) propertyNames(m?.schema, spec, 0, new Set(), props)

  const params = e.parameters as Parameter[]
  const title = op.summary || e.path
  return entry(
    'operation',
    `operation/${e.id}`,
    title,
    [
      field(op.summary, W.title, true),
      field(e.path, W.path, true),
      field(e.id, W.id),
      field(op.operationId !== e.id ? op.operationId : undefined, W.id),
      field(e.method, W.method),
      field(e.tags.map((t) => tagNames.get(t) ?? t).join(' '), W.tag),
      field(params.map((p) => p.name).join(' '), W.param),
      field(params.map((p) => (p.description ? plain(p.description) : '')).filter(Boolean).join(' · '), W.paramDescription),
      field(op.description ? plain(op.description) : undefined, W.description),
      field([...props].join(' '), W.property),
    ],
    { method: e.method, path: e.path },
  )
}

/** Headings (`#`…`######`) of a markdown text. */
function headings(markdown: string): string[] {
  const out: string[] = []
  let fence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const m = !fence && /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) out.push(plain(m[1]!))
  }
  return out
}

/** Builds the index of a spec. */
export function buildSearchIndex(spec: LoadedSpec): SearchIndex {
  const entries: SearchEntry[] = []
  const tagNames = new Map(spec.groups.map((g) => [g.name, g.displayName]))

  for (const text of headings(spec.document.info.description ?? '')) {
    entries.push(entry('heading', `heading/${text}`, text, [field(text, W.title, true)]))
  }
  for (const g of spec.groups) {
    entries.push(
      entry('tag', `tag/${g.name}`, g.displayName, [
        field(g.displayName, W.name, true),
        field(g.displayName !== g.name ? g.name : undefined, W.name),
        field(g.description ? plain(g.description) : undefined, W.description),
      ]),
    )
  }
  for (const e of spec.operations) entries.push(operationEntry(e, spec, tagNames))
  for (const [name, raw] of Object.entries(spec.document.components?.schemas ?? {})) {
    const s = raw as Schema
    entries.push(
      entry('schema', `schema/${name}`, name, [
        field(name, W.name, true),
        field(typeof s.title === 'string' ? s.title : undefined, W.title * 0.6),
        field(typeof s.description === 'string' ? plain(s.description) : undefined, W.description),
        field([...propertyNames(s, spec)].join(' '), W.property),
      ]),
    )
  }

  const words = (query: string): string[] => [...new Set(fold(query).split(/\s+/).filter(Boolean))]

  /** How well one word matches one field: 0 none, then substring, word start, whole field. */
  const quality = (f: Field, word: string): number => {
    const at = f.lower.indexOf(word)
    if (at === -1) return 0
    if (f.lower.length === word.length) return 3
    if (at === 0 || !/[\p{L}\p{N}]/u.test(f.lower[at - 1]!)) return 2
    // A later occurrence may still start a word.
    return wordStart(word).test(f.lower) ? 2 : 1
  }
  const starts = new Map<string, RegExp>()
  const wordStart = (word: string): RegExp => {
    let re = starts.get(word)
    if (!re) {
      if (starts.size > 500) starts.clear()
      re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u')
      starts.set(word, re)
    }
    return re
  }

  function score(e: SearchEntry, list: string[]): number {
    let total = 0
    for (const word of list) {
      if (!e.all.includes(word)) return 0
      let best = 0
      for (const f of e.fields) best = Math.max(best, quality(f, word) * f.weight)
      if (best === 0) return 0
      total += best
    }
    return total
  }

  /** Splits `text` into pieces with every occurrence of the words marked. */
  function segments(text: string, lower: string, list: string[], from = 0, to = text.length): SearchSegment[] {
    const marks: [number, number][] = []
    for (const word of list) {
      for (let at = lower.indexOf(word, from); at !== -1 && at < to; at = lower.indexOf(word, at + word.length)) {
        marks.push([at, Math.min(to, at + word.length)])
      }
    }
    marks.sort((a, b) => a[0] - b[0])
    const out: SearchSegment[] = []
    let pos = from
    for (const [start, end] of marks) {
      if (end <= pos) continue
      const s = Math.max(start, pos)
      if (s > pos) out.push({ text: text.slice(pos, s), mark: false })
      out.push({ text: text.slice(s, end), mark: true })
      pos = end
    }
    if (pos < to) out.push({ text: text.slice(pos, to), mark: false })
    if (from > 0) out.unshift({ text: '…', mark: false })
    if (to < text.length) out.push({ text: '…', mark: false })
    return out
  }

  function hit(e: SearchEntry, s: number, list: string[]): SearchHit {
    const result: SearchHit = { entry: e, score: s, title: segments(e.title, fold(e.title), list) }
    // A snippet when some word is not in the title: from the field that matched it best.
    const titleLower = fold(e.title)
    const missing = list.find((w) => !titleLower.includes(w) && !(e.path && fold(e.path).includes(w)))
    if (missing) {
      let best: Field | undefined
      for (const f of e.fields) if (!f.title && f.lower.includes(missing) && (!best || f.weight > best.weight)) best = f
      if (best) {
        const at = best.lower.indexOf(missing)
        const from = Math.max(0, Math.min(at - 30, best.text.length - SNIPPET))
        result.snippet = segments(best.text, best.lower, list, from, Math.min(best.text.length, from + SNIPPET))
      }
    }
    return result
  }

  return {
    entries,
    search(query, limit = 50) {
      const list = words(query)
      if (!list.length) return []
      const scored: { e: SearchEntry; s: number; i: number }[] = []
      entries.forEach((e, i) => {
        const s = score(e, list)
        if (s > 0) scored.push({ e, s, i })
      })
      scored.sort((a, b) => b.s - a.s || a.i - b.i)
      return scored.slice(0, limit).map(({ e, s }) => hit(e, s, list))
    },
    matches(query) {
      const list = words(query)
      if (!list.length) return null
      const keys = new Set<string>()
      for (const e of entries) if (score(e, list) > 0) keys.add(e.key)
      return keys
    },
  }
}
