import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { loadSpec } from '../load'
import { decodePrefill, encodePrefill, pickSpec, prefillHash, resolveSection, scalarDocumentSlug, scalarSlug, splitLink, type PrefillData } from '.'

const kitchen = loadSpec(readFileSync(resolve(import.meta.dirname, '../../tests/fixtures/specs/kitchen-sink-31.json'), 'utf8'))

describe('scalarSlug', () => {
  it('follows the Scalar 1.x rule', () => {
    expect(scalarSlug('Item')).toBe('item')
    expect(scalarSlug('  Hello, World!  ')).toBe('hello-world')
    expect(scalarSlug('a__b  c--d')).toBe('a-b-c-d')
    expect(scalarSlug('-edge-')).toBe('edge')
    expect(scalarSlug('v1.1')).toBe('v11')
  })
  it('keeps letters of any script', () => {
    expect(scalarSlug('Заказы клиентов')).toBe('заказы-клиентов')
    expect(scalarSlug('Ёлка')).toBe('ёлка')
    // NFD input composes to the same slug as NFC.
    expect(scalarSlug('Café')).toBe(scalarSlug('Café'))
  })
  it('is idempotent', () => {
    for (const s of ['Some Tag', 'Заказы / v2', 'a.b.c', 'x_y-z']) expect(scalarSlug(scalarSlug(s))).toBe(scalarSlug(s))
  })
  it('makes document slugs the way DocLink does', () => {
    expect(scalarDocumentSlug('v1.1')).toBe('v1-1')
    expect(scalarDocumentSlug('v1')).toBe('v1')
    expect(scalarDocumentSlug('api/v2')).toBe('api-v2')
  })
})

describe('splitLink', () => {
  it('splits the anchor and the payload', () => {
    expect(splitLink('#operation/x')).toEqual({ anchor: 'operation/x' })
    expect(splitLink('shop/operation/x?f=jabc')).toEqual({ anchor: 'shop/operation/x', payload: 'jabc' })
    expect(splitLink('tag/%D0%B7%D0%B0%D0%BA%D0%B0%D0%B7%D1%8B')).toEqual({ anchor: 'tag/заказы' })
    expect(splitLink('operation/x?other=1')).toEqual({ anchor: 'operation/x' })
  })
})

describe('pickSpec', () => {
  const specs = [{ id: 'pets' }, { id: 'shop', name: 'Kitchen Sink' }, { id: 'v1.1' }]
  it('reads the document segment by id or slug', () => {
    expect(pickSpec('shop/operation/createOrder', specs)).toEqual({ spec: 'shop', rest: 'operation/createOrder' })
    expect(pickSpec('kitchen-sink/tag/orders', specs)).toEqual({ spec: 'shop', rest: 'tag/orders' })
    expect(pickSpec('v1-1/model/Pet', specs)).toEqual({ spec: 'v1.1', rest: 'model/Pet' })
  })
  it('leaves links without a document segment to the open spec', () => {
    expect(pickSpec('operation/x', specs)).toEqual({ rest: 'operation/x' })
    expect(pickSpec('tag/item/GET/v1/item/list', specs)).toEqual({ rest: 'tag/item/GET/v1/item/list' })
  })
  it('drops an unknown document segment before a section', () => {
    expect(pickSpec('v1/tag/item/GET/v1/item/list', [{ id: 'spec' }])).toEqual({ rest: 'tag/item/GET/v1/item/list' })
    expect(pickSpec('nothing-here', specs)).toEqual({ rest: 'nothing-here' })
  })
})

describe('resolveSection', () => {
  it('keeps canonical anchors', () => {
    expect(resolveSection('operation/createOrder', kitchen)).toBe('operation/createOrder')
    expect(resolveSection('schema/Order', kitchen)).toBe('schema/Order')
    expect(resolveSection('tag/orders', kitchen)).toBe('tag/orders')
  })
  it('maps Scalar operation links by method and path', () => {
    expect(resolveSection('tag/orders/POST/orders', kitchen)).toBe('operation/createOrder')
    expect(resolveSection('tag/orders/get/orders/{orderId}', kitchen)).toBe('operation/getOrder')
    expect(resolveSection('tag/orders/DELETE/orders/{orderId}', kitchen)).toBe('operation/deleteOrder')
  })
  it('tolerates the server base path on either side', () => {
    // The first server's path is `/{basePath}` = `/v2`.
    expect(resolveSection('tag/orders/POST/v2/orders', kitchen)).toBe('operation/createOrder')
    expect(resolveSection('tag/orders/GET/v2/orders/{orderId}', kitchen)).toBe('operation/getOrder')
  })
  it('falls back to the tag when the operation is not there', () => {
    expect(resolveSection('tag/orders/PUT/orders', kitchen)).toBe('tag/orders')
    expect(resolveSection('tag/payments', kitchen)).toBe('tag/payments')
    expect(resolveSection('tag/unknown/GET/x', kitchen)).toBeNull()
  })
  it('maps Scalar model links to schemas', () => {
    expect(resolveSection('model/Order', kitchen)).toBe('schema/Order')
    expect(resolveSection('model/order', kitchen)).toBe('schema/Order')
    expect(resolveSection('model/Nope', kitchen)).toBeNull()
  })
  it('resolves the DocLink examples', () => {
    const spec = loadSpec({
      openapi: '3.1.0',
      info: { title: 'Laravel API', version: '1' },
      servers: [{ url: 'https://example.com/api' }],
      tags: [{ name: 'item' }, { name: 'Заказы клиентов' }],
      paths: {
        '/v1/item/list': { get: { operationId: 'itemList', tags: ['item'], responses: {} }, post: { operationId: 'itemListPost', tags: ['item'], responses: {} } },
        '/v1.1/order.create': { post: { tags: ['Заказы клиентов'], responses: {} } },
      },
      components: { schemas: { 'Item.Resource': { type: 'object' } } },
    })
    const at = (hash: string) => resolveSection(pickSpec(splitLink(hash).anchor, [{ id: 'spec' }]).rest, spec)
    expect(at('#v1/tag/item/GET/v1/item/list')).toBe('operation/itemList')
    expect(at('#v1/tag/item/POST/v1/item/list')).toBe('operation/itemListPost')
    expect(at('#tag/item/GET/api/v1/item/list')).toBe('operation/itemList')
    expect(at('#v1-1/tag/заказы-клиентов/POST/v1.1/order.create')).toMatch(/^operation\//)
    expect(at(`#v1-1/tag/${encodeURIComponent('заказы-клиентов')}`)).toBe('tag/Заказы клиентов')
    expect(at('#v1/model/itemresource')).toBe('schema/Item.Resource')
  })
})

describe('prefill codec', () => {
  const data: PrefillData = {
    v: 1,
    server: 1,
    vars: { port: '9090' },
    query: { status: 'new', q: 'ёлка 🎄' },
    header: { 'Idempotency-Key': 'k-1' },
    mediaType: 'application/json',
    body: '{\n  "name": "Привет"\n}',
    auth: { bearer: 't', basic: { username: 'u', password: 'p' } },
  }

  it('round-trips compressed and plain payloads', async () => {
    const z = await encodePrefill(data)
    expect(z[0]).toBe('z')
    expect(z).toMatch(/^z[A-Za-z0-9_-]+$/)
    expect(await decodePrefill(z)).toEqual(data)
    const j = await encodePrefill(data, { compress: false })
    expect(j[0]).toBe('j')
    expect(await decodePrefill(j)).toEqual(data)
  })

  it('reads what PHP gzdeflate + base64url makes, and PHP can read ours', async () => {
    const json = JSON.stringify({ v: 1, query: { search: 'чай' }, body: '{"a":1}' })
    const php = 'z' + deflateRawSync(Buffer.from(json, 'utf8')).toString('base64url')
    expect(await decodePrefill(php)).toEqual({ v: 1, query: { search: 'чай' }, body: '{"a":1}' })
    const ours = await encodePrefill({ v: 1, path: { id: '42' } })
    expect(inflateRawSync(Buffer.from(ours.slice(1), 'base64url')).toString('utf8')).toBe('{"v":1,"path":{"id":"42"}}')
  })

  it('builds the hash', () => {
    expect(prefillHash('shop/operation/createOrder', 'jabc')).toBe('shop/operation/createOrder?f=jabc')
  })

  it('ignores unknown keys and keeps strings', async () => {
    const payload = 'j' + Buffer.from(JSON.stringify({ v: 1, extra: true, query: { n: 5, b: false, o: {} }, server: 'https://x', body: 3 })).toString('base64url')
    expect(await decodePrefill(payload)).toEqual({ v: 1, query: { n: '5', b: 'false' }, server: 'https://x' })
  })

  it('returns null for malformed input', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const j = (v: unknown) => 'j' + Buffer.from(JSON.stringify(v)).toString('base64url')
    expect(await decodePrefill('')).toBeNull()
    expect(await decodePrefill('x' + j({ v: 1 }).slice(1))).toBeNull()
    expect(await decodePrefill('j!!!')).toBeNull()
    expect(await decodePrefill('jabc')).toBeNull()
    expect(await decodePrefill('zAAAA')).toBeNull()
    expect(await decodePrefill(j([1]))).toBeNull()
    expect(await decodePrefill(j({ query: {} }))).toBeNull()
    expect(await decodePrefill(j({ v: 2 }))).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('refuses a payload that inflates past the limit', async () => {
    const bomb = 'z' + deflateRawSync(Buffer.from(JSON.stringify({ v: 1, body: 'a'.repeat(2 << 20) }))).toString('base64url')
    expect(await decodePrefill(bomb)).toBeNull()
  })
})
