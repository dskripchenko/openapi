import type { OpenApiDocument } from '../core/types'
import { createResolver } from './resolver'

const doc = {
  openapi: '3.1.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/pets/{id}': { get: { summary: 'pet' } },
  },
  components: {
    schemas: {
      'a/b': { type: 'string' },
      'til~de': { type: 'number' },
      'with space': { type: 'boolean' },
      A: { $ref: '#/components/schemas/B' },
      B: { $ref: '#/components/schemas/C' },
      C: { type: 'integer' },
      Loop1: { $ref: '#/components/schemas/Loop2' },
      Loop2: { $ref: '#/components/schemas/Loop1' },
      Tree: { type: 'object', properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } } },
      Ping: { properties: { pong: { $ref: '#/components/schemas/Pong' } } },
      Pong: { properties: { ping: { $ref: '#/components/schemas/Ping' } } },
      UsesTree: { properties: { t: { $ref: '#/components/schemas/Tree' } } },
      Remote: { $ref: 'common.json#/Pet' },
    },
    parameters: { list: [{ name: 'zero' }] },
  },
} as unknown as OpenApiDocument

describe('createResolver', () => {
  const r = createResolver(doc)

  it('reads JSON pointers with ~0/~1 and percent escapes', () => {
    expect(r.get('#/components/schemas/a~1b')).toEqual({ type: 'string' })
    expect(r.get('#/components/schemas/til~0de')).toEqual({ type: 'number' })
    expect(r.get('#/components/schemas/with%20space')).toEqual({ type: 'boolean' })
    expect(r.get('#/paths/~1pets~1%7Bid%7D/get')).toEqual({ summary: 'pet' })
    expect(r.get('#/components/parameters/list/0/name')).toBe('zero')
    expect(r.get('#')).toBe(doc)
  })

  it('returns undefined for missing targets', () => {
    expect(r.get('#/components/schemas/Nope')).toBeUndefined()
    expect(r.get('#/components/parameters/list/7')).toBeUndefined()
    expect(r.get('#/components/parameters/list/x')).toBeUndefined()
    expect(r.get('#/info/title/deeper')).toBeUndefined()
  })

  it('derefs chains and passes plain values through', () => {
    expect(r.deref({ $ref: '#/components/schemas/A' })).toEqual({ type: 'integer' })
    const plain = { type: 'string' }
    expect(r.deref(plain)).toBe(plain)
    expect(r.deref(undefined)).toBeUndefined()
    expect(r.deref({ $ref: '#/missing' })).toBeUndefined()
  })

  it('is cycle-safe', () => {
    expect(r.deref({ $ref: '#/components/schemas/Loop1' })).toBeUndefined()
    expect(r.isCircular('#/components/schemas/Loop1')).toBe(true)
    expect(r.isCircular('#/components/schemas/Tree')).toBe(true)
    expect(r.isCircular('#/components/schemas/Ping')).toBe(true)
    expect(r.isCircular('#/components/schemas/A')).toBe(false)
    expect(r.isCircular('#/components/schemas/C')).toBe(false)
    // Reaches a cycle, but does not come back to itself.
    expect(r.isCircular('#/components/schemas/UsesTree')).toBe(false)
  })

  it('leaves external refs unresolved without a loader', () => {
    expect(r.get('common.json#/Pet')).toBeUndefined()
    expect(r.deref({ $ref: '#/components/schemas/Remote' })).toBeUndefined()
  })

  it('resolves external refs through the hook, relative refs inside them too', () => {
    const calls: string[] = []
    const ext = createResolver(doc, {
      external: (url) => {
        calls.push(url)
        if (url === 'common.json')
          return { Pet: { $ref: '#/Animal' }, Animal: { type: 'object', title: 'Animal' } }
        return undefined
      },
    })
    expect(ext.deref({ $ref: '#/components/schemas/Remote' })).toEqual({ type: 'object', title: 'Animal' })
    expect(ext.get('common.json#/Animal')).toEqual({ type: 'object', title: 'Animal' })
    expect(ext.get('other.json#/X')).toBeUndefined()
    // Loaded once.
    expect(calls.filter((c) => c === 'common.json')).toHaveLength(1)
  })

  it('swallows loader errors', () => {
    const ext = createResolver(doc, {
      external: () => {
        throw new Error('boom')
      },
    })
    expect(ext.get('x.json#/a')).toBeUndefined()
  })
})
