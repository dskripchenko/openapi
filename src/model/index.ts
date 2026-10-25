export { OpenApiError } from './errors'
export { detectVersion, type DetectedVersion, type SpecFamily } from './detect'
export { normalize, type NormalizeResult } from './normalize'
import { upgradeSchema30 as upgradeInPlace } from './upgrade30'

/** Upgrades an OpenAPI 3.0 schema to 3.1 (nullable, exclusive bounds, example); the input is left as it was. */
export function upgradeSchema30(schema: unknown): unknown {
  return upgradeInPlace(structuredClone(schema))
}
export { createResolver, type Resolver, type ResolverOptions } from './resolver'
export {
  listOperations,
  groupByTag,
  DEFAULT_TAG,
  type OperationEntry,
  type OperationGroup,
  type TagGroupSet,
  type GroupedOperations,
} from './operations'
export { loadDocument, type LoadedSpec, type LoadOptions } from './load'
