/**
 * What embedded operations share: one load per spec input, however many
 * embeds show it, and finding an operation by the ways a page names it.
 */
import { pickSpec, resolveSection } from '../links'
import { loadSpec } from '../load'
import type { LoadedSpec, OperationEntry, ResolverOptions } from '../model'
import type { SpecInput } from './context'
import type { SpecObtainer } from './useReferenceContext'

type Slot = LoadedSpec | Promise<LoadedSpec>

/** Texts by value, objects and loaders by identity; a separate set per external resolver. */
const byText = new Map<string, Slot>()
const byRef = new WeakMap<object, Slot>()
const withExternal = new WeakMap<object, { text: Map<string, Slot>; ref: WeakMap<object, Slot> }>()

function slots(external: ResolverOptions['external'] | undefined): { text: Map<string, Slot>; ref: WeakMap<object, Slot> } {
  if (!external) return { text: byText, ref: byRef }
  let set = withExternal.get(external)
  if (!set) withExternal.set(external, (set = { text: new Map(), ref: new WeakMap() }))
  return set
}

/**
 * Loads a spec once per input: embeds given the same text, object or loader
 * function share the load, and a failed one is tried again next time. Text
 * and objects load at once; a loader gives a promise that all of them await.
 */
export const sharedSpec: SpecObtainer = (input: SpecInput, external) => {
  const { text, ref } = slots(external)
  const hit = typeof input === 'string' ? text.get(input) : ref.get(input)
  if (hit) return hit
  const opts = external ? { external } : {}
  const store = (slot: Slot): void => void (typeof input === 'string' ? text.set(input, slot) : ref.set(input, slot))
  const forget = (): void => void (typeof input === 'string' ? text.delete(input) : ref.delete(input))
  if (typeof input !== 'function') {
    const spec = loadSpec(input, opts)
    store(spec)
    return spec
  }
  const pending = (input as () => Promise<string | object>)().then((value) => {
    const spec = loadSpec(value, opts)
    store(spec)
    return spec
  })
  // A failed fetch or a spec that does not parse is not kept: the next embed tries again.
  pending.catch(forget)
  store(pending)
  return pending
}

const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/**
 * The operation a page names: its operationId, `METHOD /path` (a server's
 * base path in front is fine), or an anchor — ours (`operation/{id}`, with or
 * without a spec segment and `#`) or Scalar's (`tag/{tag}/{METHOD}{path}`).
 */
export function findOperation(spec: LoadedSpec, name: string): OperationEntry | undefined {
  const wanted = name.trim().replace(/^#/, '')
  if (!wanted) return undefined
  const byId = spec.operations.find((e) => e.id === wanted)
  if (byId) return byId
  const call = /^([a-z]+)\s+(\/\S*)$/i.exec(wanted)
  if (call) {
    const method = call[1]!.toLowerCase()
    const path = trimSlash(call[2]!)
    const exact = spec.operations.find((e) => !e.webhook && e.method === method && trimSlash(e.path) === path)
    if (exact) return exact
    // Through Scalar's form: it also matches a path with a server's base path.
    return entryOf(spec, resolveSection(`tag/-/${call[1]!.toUpperCase()}${path}`, spec))
  }
  const { rest } = pickSpec(wanted, [])
  return entryOf(spec, resolveSection(rest, spec))
}

function entryOf(spec: LoadedSpec, section: string | null): OperationEntry | undefined {
  if (!section?.startsWith('operation/')) return undefined
  const id = section.slice('operation/'.length)
  return spec.operations.find((e) => e.id === id)
}
