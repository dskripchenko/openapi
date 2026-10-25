import { fixtureJson } from '../../tests/fixtures/specs'
import type { OpenApiDocument } from '../core/types'
import { loadDocument } from './load'
import { groupByTag, listOperations } from './operations'
import { createResolver } from './resolver'

const base = { openapi: '3.1.0', info: { title: 'T', version: '1' } }
const ok = { responses: { 200: { description: 'ok' } } }

function ops(doc: object) {
  const d = doc as OpenApiDocument
  return listOperations(d, createResolver(d))
}

describe('listOperations', () => {
  it('merges path-level and op-level parameters, op wins by name+in', () => {
    const list = ops({
      ...base,
      paths: {
        '/a/{id}': {
          parameters: [
            { $ref: '#/components/parameters/Id' },
            { name: 'q', in: 'query', description: 'path-level' },
            { name: 'q', in: 'header' },
          ],
          get: { ...ok, parameters: [{ name: 'q', in: 'query', description: 'op-level' }, { name: 'z', in: 'query' }] },
        },
      },
      components: { parameters: { Id: { name: 'id', in: 'path', required: true } } },
    })
    expect(list).toHaveLength(1)
    const params = list[0]?.parameters ?? []
    expect(params.map((p) => `${p.in}:${p.name}`)).toEqual(['path:id', 'query:q', 'header:q', 'query:z'])
    expect(params[1]?.description).toBe('op-level')
  })

  it('makes unique ids from operationId or a slug', () => {
    const list = ops({
      ...base,
      paths: {
        '/pets/{id}': { get: { ...ok, operationId: 'getPet' }, delete: ok },
        '/pets/{id}/': { delete: ok },
        '/other': { get: { ...ok, operationId: 'getPet' }, post: { ...ok, operationId: 'delete-pets-id' } },
      },
    })
    expect(list.map((o) => o.id)).toEqual(['getPet', 'delete-pets-id-2', 'delete-pets-id-3', 'get-other', 'delete-pets-id'])
    expect(new Set(list.map((o) => o.id)).size).toBe(list.length)
  })

  it('keeps document key order and defaults tags', () => {
    const list = ops({ ...base, paths: { '/x': { post: ok, get: { ...ok, tags: ['t'], deprecated: true } } } })
    expect(list.map((o) => o.method)).toEqual(['post', 'get'])
    expect(list[0]?.tags).toEqual(['default'])
    expect(list[1]?.tags).toEqual(['t'])
    expect(list[1]?.deprecated).toBe(true)
    expect(list[0]?.deprecated).toBe(false)
  })

  it('includes webhooks, following path item refs', () => {
    const doc = fixtureJson('kitchen-sink-31.json') as OpenApiDocument
    const list = ops(doc)
    const hooks = list.filter((o) => o.webhook)
    expect(hooks.map((o) => [o.webhook, o.path, o.id])).toEqual([
      ['orderPaid', 'orderPaid', 'orderPaidWebhook'],
      ['orderShipped', 'orderShipped', 'orderShippedWebhook'],
    ])
    const styles = list.find((o) => o.id === 'paramStyles')
    expect(styles?.parameters).toHaveLength(12)
    const getOrder = list.find((o) => o.id === 'getOrder')
    expect(getOrder?.parameters.map((p) => p.name)).toEqual(['orderId'])
  })
})

describe('groupByTag', () => {
  it('orders declared tags first, then first-seen, skips empty ones', () => {
    const doc = {
      ...base,
      tags: [
        { name: 'b', description: 'Bees', 'x-displayName': 'The Bees' },
        { name: 'unused' },
        { name: 'a' },
      ],
      paths: {
        '/1': { get: { ...ok, tags: ['z'] } },
        '/2': { get: { ...ok, tags: ['a', 'b'] } },
        '/3': { get: ok },
      },
    } as OpenApiDocument
    const { groups, tagGroups } = groupByTag(doc, ops(doc))
    expect(groups.map((g) => g.name)).toEqual(['b', 'a', 'z', 'default'])
    expect(groups[0]).toMatchObject({ displayName: 'The Bees', description: 'Bees' })
    expect(groups[0]?.operations.map((o) => o.path)).toEqual(['/2'])
    expect(groups[1]?.operations.map((o) => o.path)).toEqual(['/2'])
    expect(groups[2]?.displayName).toBe('z')
    expect(tagGroups).toBeUndefined()
  })

  it('builds x-tagGroups with a trailing Other', () => {
    const spec = loadDocument(fixtureJson('kitchen-sink-31.json'))
    expect(spec.groups.map((g) => g.name)).toEqual(['orders', 'payments', 'catalog', 'params', 'events'])
    expect(spec.groups[0]?.displayName).toBe('Orders')
    expect(spec.tagGroups?.map((s) => [s.name, s.groups.map((g) => g.name)])).toEqual([
      ['Commerce', ['orders', 'payments', 'catalog']],
      ['Reference', ['params']],
      ['Other', ['events']],
    ])
  })
})

describe('loadDocument', () => {
  it('loads a Swagger 2.0 document end to end', () => {
    const raw = fixtureJson('petstore-swagger2.json')
    const positions = new Map([['', { line: 1, column: 1 }]])
    const spec = loadDocument(raw, { positions, format: 'json' })
    expect(spec.source).toEqual({ family: 'swagger2', version: '2.0', raw, format: 'json' })
    expect(spec.document.openapi).toBe('3.1.0')
    expect(spec.positions).toBe(positions)
    expect(spec.operations.map((o) => o.id)).toContain('uploadFile')
    expect(spec.operations).toHaveLength(13)
    expect(spec.groups.map((g) => g.name)).toEqual(['pet', 'store', 'user'])
    expect(spec.resolver.deref(spec.operations.find((o) => o.id === 'updatePet')?.operation.requestBody)).toMatchObject({
      required: true,
    })
    const deletePet = spec.operations.find((o) => o.id === 'deletePet')
    expect(deletePet?.parameters.map((p) => p.name)).toEqual(['petId', 'api_key'])
  })

  it('loads 3.1 petstore with its webhook', () => {
    const spec = loadDocument(fixtureJson('petstore-31.json'))
    expect(spec.source.family).toBe('openapi31')
    expect(spec.operations.map((o) => o.id)).toEqual(['listPets', 'createPet', 'showPetById', 'newPetWebhook'])
    expect(spec.warnings).toEqual([])
  })

  it('throws OpenApiError for non-specs', () => {
    expect(() => loadDocument({ hello: 1 })).toThrow(/Not an OpenAPI/)
  })
})
