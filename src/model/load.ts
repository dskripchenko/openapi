import type { OpenApiDocument, PositionMap } from '../core/types'
import { detectVersion, type SpecFamily } from './detect'
import { normalize } from './normalize'
import { groupByTag, listOperations, type OperationEntry, type OperationGroup, type TagGroupSet } from './operations'
import { createResolver, type Resolver, type ResolverOptions } from './resolver'

export interface LoadOptions extends ResolverOptions {
  /** Source positions of `raw` (from parseYaml / parseJson). */
  positions?: PositionMap
  /** The source format, kept for the editor. */
  format?: 'json' | 'yaml'
}

export interface LoadedSpec {
  /** The original document: the editor edits this, not the normalized copy. */
  source: { family: SpecFamily; version: string; raw: unknown; format?: 'json' | 'yaml' }
  /** Normalized to OpenAPI 3.1. */
  document: OpenApiDocument
  resolver: Resolver
  operations: OperationEntry[]
  /** Operations by tag. */
  groups: OperationGroup[]
  /** Groups of tags from `x-tagGroups`, when the document has them. */
  tagGroups?: TagGroupSet[]
  warnings: string[]
  /** Positions of the source document (pointers into `source.raw`). */
  positions?: PositionMap
}

/** The main entry: detect, normalize, resolve and index a parsed document. */
export function loadDocument(raw: unknown, opts: LoadOptions = {}): LoadedSpec {
  const { family, version } = detectVersion(raw)
  const { document, warnings } = normalize(raw)
  const resolver = createResolver(document, opts.external ? { external: opts.external } : {})
  const operations = listOperations(document, resolver)
  const { groups, tagGroups } = groupByTag(document, operations)
  const spec: LoadedSpec = {
    source: { family, version, raw },
    document,
    resolver,
    operations,
    groups,
    warnings,
  }
  if (opts.format) spec.source.format = opts.format
  if (tagGroups) spec.tagGroups = tagGroups
  if (opts.positions) spec.positions = opts.positions
  return spec
}
