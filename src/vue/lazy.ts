import type { LoadedSpec } from '../model'

/**
 * Up to this many operations a reference renders every card at once. Above
 * it, a card builds its forms and samples only as it comes near the viewport,
 * and the cards far from it skip rendering (`content-visibility: auto`).
 */
export const EAGER_OPERATIONS = 40

/** A spec large enough to render its operations lazily. */
export function isLargeSpec(spec: Pick<LoadedSpec, 'operations'>): boolean {
  return spec.operations.length > EAGER_OPERATIONS
}
