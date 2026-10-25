import { loadSpec } from '../src'
import { buildSearchIndex, fold, type SearchSegment } from '../src/vue/search'
import { fixtureText } from './fixtures/specs'

const kitchen = buildSearchIndex(loadSpec(fixtureText('kitchen-sink-31.json')))
const text = (segments: SearchSegment[] | undefined) => (segments ?? []).map((s) => (s.mark ? `[${s.text}]` : s.text)).join('')

describe('search index', () => {
  it('indexes operations, tags, schemas and description headings', () => {
    const kinds = new Set(kitchen.entries.map((e) => e.kind))
    expect([...kinds].sort()).toEqual(['heading', 'operation', 'schema', 'tag'])
    expect(kitchen.entries.find((e) => e.kind === 'heading')?.key).toBe('heading/Rate limits')
  })

  it('finds an operation by a word of its description, with a marked snippet', () => {
    const [hit] = kitchen.search('tokenized')
    expect(hit?.entry.key).toBe('operation/createPayment')
    expect(text(hit?.snippet)).toContain('[tokenized]')
  })

  it('ranks a summary match above a description match', () => {
    const keys = kitchen.search('order').map((h) => h.entry.key)
    expect(keys.indexOf('operation/listOrders')).toBeLessThan(keys.indexOf('operation/createPayment'))
    expect(text(kitchen.search('list order')[0]?.title)).toBe('[List] [order]s')
  })

  it('needs every word (AND)', () => {
    expect(kitchen.search('order tokenized').map((h) => h.entry.key)).toEqual(['operation/createPayment'])
    expect(kitchen.search('tokenized nonsense')).toEqual([])
  })

  it('matches paths, ids, parameters and nested property names', () => {
    expect(kitchen.search('/catalog/images')[0]?.entry.key).toBe('operation/uploadImage')
    expect(kitchen.search('searchCatalog')[0]?.entry.key).toBe('operation/searchCatalog')
    expect(kitchen.search('idempotency').map((h) => h.entry.key)).toContain('operation/createOrder')
    // Order → items → OrderItem.sku: two levels below the body.
    expect(kitchen.search('sku').map((h) => h.entry.key)).toContain('operation/createOrder')
    expect(kitchen.search('iban').map((h) => h.entry.key)).toEqual(expect.arrayContaining(['schema/BankTransfer', 'operation/createPayment']))
  })

  it('finds tags and schemas, and lists every match for the navigation', () => {
    expect(kitchen.search('refunds')[0]?.entry.key).toBe('tag/payments')
    expect(kitchen.search('PaymentMethod')[0]?.entry.key).toBe('schema/PaymentMethod')
    const all = kitchen.matches('order')!
    expect(all.has('operation/createPayment')).toBe(true)
    expect(all.has('schema/Order')).toBe(true)
    expect(kitchen.matches('  ')).toBeNull()
  })

  it('lowercases Unicode text, Cyrillic included', () => {
    expect(fold('Заказ ЁЛКА')).toBe('заказ елка')
    const index = buildSearchIndex(
      loadSpec({
        openapi: '3.1.0',
        info: { title: 'Т', version: '1' },
        paths: { '/orders': { get: { operationId: 'list', summary: 'Список заказов', description: 'Возвращает ёлки', responses: { 200: { description: 'ok' } } } } },
      }),
    )
    expect(index.search('ЗАКАЗ')[0]?.entry.key).toBe('operation/list')
    expect(index.search('елки')[0]?.entry.key).toBe('operation/list')
    expect(text(index.search('заказ')[0]?.title)).toBe('Список [заказ]ов')
  })

  it('caps the results', () => {
    expect(kitchen.search('o', 3)).toHaveLength(3)
  })
})

describe('search performance', () => {
  // A spec the size of a large real API: 800 operations, 300 schemas.
  function largeSpec(): object {
    const schemas: Record<string, object> = {}
    for (let i = 0; i < 300; i++) {
      schemas[`Model${i}`] = {
        type: 'object',
        description: `Model number ${i} of the generated catalogue with several fields.`,
        properties: Object.fromEntries(Array.from({ length: 12 }, (_, j) => [`field${j}_${i % 40}`, j % 3 ? { type: 'string' } : { $ref: `#/components/schemas/Model${(i + j) % 300}` }])),
      }
    }
    const paths: Record<string, object> = {}
    for (let i = 0; i < 400; i++) {
      const op = (verb: string) => ({
        tags: [`tag${i % 25}`],
        operationId: `${verb}Resource${i}`,
        summary: `${verb} resource ${i}`,
        description: `Long description of the ${verb} call for resource ${i}. `.repeat(8) + (i === 321 ? 'The unique word is zanzibar.' : ''),
        parameters: [
          { name: `filter${i % 10}`, in: 'query', description: 'Filters the list by a field', schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/Model${i % 300}` } } } },
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: `#/components/schemas/Model${(i * 7) % 300}` } } } } },
      })
      paths[`/resources${i}/{id}`] = { get: op('get'), post: op('update') }
    }
    return { openapi: '3.1.0', info: { title: 'Large', version: '1', description: '## Intro\n\ntext' }, paths, components: { schemas } }
  }

  it('builds and answers fast on a large spec', () => {
    const spec = loadSpec(largeSpec())
    expect(spec.operations.length).toBe(800)
    let t = performance.now()
    const index = buildSearchIndex(spec)
    const build = performance.now() - t
    expect(build).toBeLessThan(300)

    let slowest = 0
    for (const q of ['resource', 'zanzibar', 'filter list', 'model field', 'update 32', 'xyz']) {
      t = performance.now()
      index.search(q)
      index.matches(q)
      slowest = Math.max(slowest, performance.now() - t)
    }
    expect(slowest).toBeLessThan(20)
    expect(index.search('zanzibar').map((h) => h.entry.key)).toEqual(['operation/getResource321', 'operation/updateResource321'])
    console.log(`search index: build ${build.toFixed(1)} ms, slowest query ${slowest.toFixed(1)} ms over ${index.entries.length} entries`)
  })
})
