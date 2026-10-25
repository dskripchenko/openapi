import {
  HTTP_METHODS,
  type HttpMethod,
  type OpenApiDocument,
  type Operation,
  type Parameter,
  type PathItem,
  type Tag,
} from '../core/types'
import type { Resolver } from './resolver'
import { isObject } from './util'

export interface OperationEntry {
  /** operationId, or a `${method}-${path}` slug; unique within the document. */
  id: string
  method: HttpMethod
  /** The path template; for a webhook, its name. */
  path: string
  operation: Operation
  pathItem: PathItem
  /** ['default'] when the operation has none. */
  tags: string[]
  /** Path-level and operation-level parameters merged (operation wins), dereferenced. */
  parameters: Parameter[]
  deprecated: boolean
  /** Set for operations of `webhooks`. */
  webhook?: string
}

export const DEFAULT_TAG = 'default'

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function mergeParameters(resolver: Resolver, ...lists: (unknown[] | undefined)[]): Parameter[] {
  const merged = new Map<string, Parameter>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const p = resolver.deref<Parameter>(raw as Parameter)
      if (!isObject(p) || typeof p.name !== 'string') continue
      const key = `${String(p.in)}:${p.name}`
      // Map.set keeps the position of an overridden key.
      merged.set(key, p)
    }
  }
  return [...merged.values()]
}

/** Lists every operation of `paths` and `webhooks`, in document order. */
export function listOperations(doc: OpenApiDocument, resolver: Resolver): OperationEntry[] {
  const entries: OperationEntry[] = []
  const used = new Set<string>()
  const unique = (base: string): string => {
    let id = base || 'operation'
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return id
  }

  // operationIds are reserved first so slugs never steal them.
  const pending: { entry: Omit<OperationEntry, 'id'>; fallback: string }[] = []
  const collect = (items: Record<string, unknown> | undefined, isWebhook: boolean): void => {
    if (!isObject(items)) return
    for (const [name, rawItem] of Object.entries(items)) {
      if (name.startsWith('x-')) continue
      const item = resolver.deref<PathItem>(rawItem as PathItem)
      if (!isObject(item)) continue
      for (const key of Object.keys(item)) {
        if (!(HTTP_METHODS as readonly string[]).includes(key)) continue
        const method = key as HttpMethod
        const operation = item[method]
        if (!isObject(operation)) continue
        const tags = Array.isArray(operation.tags)
          ? operation.tags.filter((t): t is string => typeof t === 'string')
          : []
        const entry: Omit<OperationEntry, 'id'> = {
          method,
          path: name,
          operation,
          pathItem: item,
          tags: tags.length ? tags : [DEFAULT_TAG],
          parameters: mergeParameters(resolver, item.parameters, operation.parameters),
          deprecated: operation.deprecated === true,
        }
        if (isWebhook) entry.webhook = name
        pending.push({ entry, fallback: slug(isWebhook ? `webhook-${method}-${name}` : `${method}-${name}`) })
      }
    }
  }
  collect(doc.paths, false)
  collect(doc.webhooks, true)

  const ids: (string | undefined)[] = pending.map(({ entry }) => {
    const opId = entry.operation.operationId
    if (typeof opId === 'string' && opId !== '' && !used.has(opId)) {
      used.add(opId)
      return opId
    }
    return undefined
  })
  pending.forEach(({ entry, fallback }, i) => entries.push({ id: ids[i] ?? unique(fallback), ...entry }))
  return entries
}

/* ------------------------------- groups ------------------------------- */

export interface OperationGroup {
  /** The tag name. */
  name: string
  /** `x-displayName` of the tag, else its name. */
  displayName: string
  description?: string
  tag?: Tag
  operations: OperationEntry[]
}

export interface TagGroupSet {
  /** The `x-tagGroups` entry name. */
  name: string
  groups: OperationGroup[]
}

export interface GroupedOperations {
  /** One group per tag that has operations: declared tags first, then first-seen. */
  groups: OperationGroup[]
  /** Present when the document has `x-tagGroups`; tags left out go to a trailing "Other". */
  tagGroups?: TagGroupSet[]
}

/** Groups operations by tag. An operation with several tags appears in each. */
export function groupByTag(doc: OpenApiDocument, ops: OperationEntry[]): GroupedOperations {
  const declared = new Map<string, Tag>()
  for (const tag of Array.isArray(doc.tags) ? doc.tags : [])
    if (isObject(tag) && typeof tag.name === 'string' && !declared.has(tag.name)) declared.set(tag.name, tag)

  const byName = new Map<string, OperationEntry[]>()
  for (const name of declared.keys()) byName.set(name, [])
  for (const op of ops) {
    for (const tag of op.tags) {
      let list = byName.get(tag)
      if (!list) byName.set(tag, (list = []))
      list.push(op)
    }
  }

  const groups: OperationGroup[] = []
  for (const [name, operations] of byName) {
    if (!operations.length) continue
    const tag = declared.get(name)
    const group: OperationGroup = {
      name,
      displayName: typeof tag?.['x-displayName'] === 'string' ? tag['x-displayName'] : name,
      operations,
    }
    if (tag) group.tag = tag
    if (typeof tag?.description === 'string') group.description = tag.description
    groups.push(group)
  }

  const result: GroupedOperations = { groups }
  const rawSets = doc['x-tagGroups']
  if (Array.isArray(rawSets)) {
    const index = new Map(groups.map((g) => [g.name, g]))
    const placed = new Set<string>()
    const sets: TagGroupSet[] = []
    for (const raw of rawSets) {
      if (!isObject(raw) || typeof raw.name !== 'string') continue
      const members: OperationGroup[] = []
      for (const name of Array.isArray(raw.tags) ? raw.tags : []) {
        const group = typeof name === 'string' ? index.get(name) : undefined
        if (group) {
          members.push(group)
          placed.add(group.name)
        }
      }
      sets.push({ name: raw.name, groups: members })
    }
    const rest = groups.filter((g) => !placed.has(g.name))
    if (rest.length) sets.push({ name: 'Other', groups: rest })
    result.tagGroups = sets
  }
  return result
}
