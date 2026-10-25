import type { MaybeRef, OpenApiDocument } from '../core/types'
import { fragmentToPointer, isObject, isRef, walkPointer } from './util'

export interface ResolverOptions {
  /**
   * Loads an external document by its URL part ('common.yaml' of
   * 'common.yaml#/Pet'). Return undefined when it is not available.
   */
  external?: (url: string) => unknown | undefined
}

export interface Resolver {
  /** The value a ref points to, one step; undefined when it does not resolve. */
  get(ref: string): unknown | undefined
  /** Follows a chain of refs to a concrete value; undefined on a broken or circular chain. */
  deref<T>(value: MaybeRef<T> | undefined): T | undefined
  /** Whether the structure behind `ref` leads back to `ref` itself. */
  isCircular(ref: string): boolean
}

interface Located {
  value: unknown
  /** The document the value lives in: '' for the main one, else the external URL. */
  base: string
}

export function createResolver(doc: OpenApiDocument, opts: ResolverOptions = {}): Resolver {
  const externalCache = new Map<string, unknown>()
  const circular = new Map<string, boolean>()

  const loadExternal = (url: string): unknown => {
    if (externalCache.has(url)) return externalCache.get(url)
    let value: unknown
    try {
      value = opts.external?.(url)
    } catch {
      value = undefined
    }
    externalCache.set(url, value)
    return value
  }

  /** Resolves one ref relative to the document `base`. */
  const locate = (ref: string, base: string): Located | undefined => {
    const hash = ref.indexOf('#')
    const url = hash < 0 ? ref : ref.slice(0, hash)
    const fragment = hash < 0 ? '' : ref.slice(hash)
    const target = url === '' ? base : url
    const root = target === '' ? doc : loadExternal(target)
    if (root === undefined) return undefined
    const value = walkPointer(root, fragmentToPointer(fragment))
    return value === undefined ? undefined : { value, base: target }
  }

  /** Canonical key for cycle detection. */
  const keyOf = (ref: string, base: string): string => (ref.startsWith('#') ? base + ref : ref)

  const derefLocated = (value: unknown, base: string): Located | undefined => {
    let current: Located = { value, base }
    const seen = new Set<string>()
    while (isRef(current.value)) {
      const key = keyOf(current.value.$ref, current.base)
      if (seen.has(key)) return undefined
      seen.add(key)
      const next = locate(current.value.$ref, current.base)
      if (!next) return undefined
      current = next
    }
    return current
  }

  const isCircular = (ref: string): boolean => {
    const start = keyOf(ref, '')
    const cached = circular.get(start)
    if (cached !== undefined) return cached
    const visitedRefs = new Set<string>()
    const visitedNodes = new Set<unknown>()
    let found = false

    const visitRef = (r: string, base: string): void => {
      if (found) return
      const key = keyOf(r, base)
      if (key === start && visitedRefs.size > 0) {
        found = true
        return
      }
      if (visitedRefs.has(key)) return
      visitedRefs.add(key)
      const target = locate(r, base)
      if (target) visitNode(target.value, target.base)
    }
    const visitNode = (node: unknown, base: string): void => {
      if (found || typeof node !== 'object' || node === null || visitedNodes.has(node)) return
      visitedNodes.add(node)
      if (Array.isArray(node)) {
        for (const item of node) visitNode(item, base)
        return
      }
      if (isRef(node)) visitRef(node.$ref, base)
      for (const [k, v] of Object.entries(node)) if (k !== '$ref' && isObject(v)) visitNode(v, base)
        else if (Array.isArray(v)) visitNode(v, base)
    }
    visitRef(ref, '')
    circular.set(start, found)
    return found
  }

  return {
    get: (ref) => locate(ref, '')?.value,
    deref: <T>(value: MaybeRef<T> | undefined) => derefLocated(value, '')?.value as T | undefined,
    isCircular,
  }
}
