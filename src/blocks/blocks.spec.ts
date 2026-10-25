import { loadDocument } from '../model'
import { validateDocument } from '../validate'
import {
  BlockError,
  blockToDocument,
  blockToModel,
  emptyParam,
  emptyRequest,
  expandSchema,
  formatShorthand,
  inferSchema,
  modelToBlock,
  operationIdFor,
  parseBlock,
  parseShorthand,
  stringifyBlock,
  syncOrigins,
  syncPathParams,
} from './index'

const SAMPLE = `# one request
method: POST
url: https://api.example.com/v1/users/{id}
summary: Update a user
description: Changes the **name**.
auth: bearer
params:
  path: { id: integer }
  query:
    verbose: { type: boolean, description: More fields, example: true }
  header: { X-Request-Id: string }
body:
  example: { name: Ann, age: 31 }
responses:
  200: { description: OK, example: { id: 1, name: Ann } }
  404: Not found
`

const ok = (text: string) => {
  const r = parseBlock(text)
  if (!r.ok) throw new Error(`${r.error.message} (${r.error.line}:${r.error.column})`)
  return r
}
const fail = (text: string) => {
  const r = parseBlock(text)
  if (r.ok) throw new Error('expected an error')
  return r.error
}

describe('parseShorthand / formatShorthand', () => {
  it('reads types, formats, arrays, required and a description', () => {
    expect(parseShorthand('integer')).toEqual({ schema: { type: 'integer' }, required: false })
    expect(parseShorthand('string(email)! Contact email')).toEqual({ schema: { type: 'string', format: 'email' }, required: true, description: 'Contact email' })
    expect(parseShorthand('string[]').schema).toEqual({ type: 'array', items: { type: 'string' } })
    expect(parseShorthand('integer[][]').schema).toEqual({ type: 'array', items: { type: 'array', items: { type: 'integer' } } })
    expect(parseShorthand('file').schema).toEqual({ type: 'string', format: 'binary' })
    expect(() => parseShorthand('strin', '/x')).toThrow(BlockError)
  })

  it('writes the shorthand of a simple schema and nothing for a rich one', () => {
    for (const s of ['integer', 'string(email)', 'string[]', 'file', 'number(float)[]']) expect(formatShorthand(parseShorthand(s).schema)).toBe(s)
    expect(formatShorthand({ type: 'string', enum: ['a'] })).toBeUndefined()
  })

  it('expands schemas: shorthand properties, `name!`, items and a shorthand type', () => {
    expect(expandSchema({ type: 'object', properties: { id: 'integer!', 'tags!': { type: 'array', items: 'string' }, mail: 'string(email) Where to write' } })).toEqual({
      type: 'object',
      properties: { id: { type: 'integer' }, tags: { type: 'array', items: { type: 'string' } }, mail: { type: 'string', format: 'email', description: 'Where to write' } },
      required: ['id', 'tags'],
    })
    expect(expandSchema({ type: 'string(uuid)', description: 'x' })).toEqual({ type: 'string', format: 'uuid', description: 'x' })
    expect(expandSchema('integer[]')).toEqual({ type: 'array', items: { type: 'integer' } })
  })
})

describe('inferSchema', () => {
  it('guesses types and formats', () => {
    expect(inferSchema({ id: 1, price: 1.5, ok: true, at: '2024-01-02T03:04:05Z', day: '2024-01-02', mail: 'a@b.co', id2: '6f1c2a3b-1d2e-4f5a-9b8c-7d6e5f4a3b2c', site: 'https://x.io', none: null })).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        price: { type: 'number' },
        ok: { type: 'boolean' },
        at: { type: 'string', format: 'date-time' },
        day: { type: 'string', format: 'date' },
        mail: { type: 'string', format: 'email' },
        id2: { type: 'string', format: 'uuid' },
        site: { type: 'string', format: 'uri' },
        none: { type: 'null' },
      },
    })
  })

  it('merges array items', () => {
    expect(inferSchema([{ a: 1 }, { b: 'x' }])).toEqual({ type: 'array', items: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'string' } } } })
    expect(inferSchema([1, 2.5])).toEqual({ type: 'array', items: { type: 'number' } })
    expect(inferSchema([1, 'a'])).toEqual({ type: 'array', items: { anyOf: [{ type: 'integer' }, { type: 'string' }] } })
    expect(inferSchema([])).toEqual({ type: 'array' })
  })
})

describe('blockToDocument', () => {
  it('turns one request into an OpenAPI 3.1 document', () => {
    const { document, kind, format } = ok(SAMPLE)
    expect(kind).toBe('requests')
    expect(format).toBe('yaml')
    expect(document.servers).toEqual([{ url: 'https://api.example.com' }])
    const op = document.paths!['/v1/users/{id}']!.post!
    expect(op.operationId).toBe('postV1UsersById')
    expect(op.summary).toBe('Update a user')
    expect(op.security).toEqual([{ bearerAuth: [] }])
    expect(document.components?.securitySchemes).toEqual({ bearerAuth: { type: 'http', scheme: 'bearer' } })
    expect(op.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      { name: 'verbose', in: 'query', description: 'More fields', schema: { type: 'boolean' }, example: true },
      { name: 'X-Request-Id', in: 'header', schema: { type: 'string' } },
    ])
    expect(op.requestBody).toEqual({
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer' } } }, example: { name: 'Ann', age: 31 } } },
    })
    expect(op.responses).toEqual({
      '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } }, example: { id: 1, name: 'Ann' } } } },
      '404': { description: 'Not found' },
    })
    // The result is a document the rest of the package reads without complaint.
    expect(validateDocument(document).filter((i) => i.severity === 'error')).toEqual([])
    expect(loadDocument(document).operations.map((o) => o.id)).toEqual(['postV1UsersById'])
  })

  it('defaults: GET, a 200 response, string path parameters from the URL, relative paths without servers', () => {
    const doc = blockToDocument({ url: '/orders/{orderId}/items/{n}' })
    expect(doc.servers).toBeUndefined()
    expect(doc.info).toEqual({ title: 'API', version: '1.0.0' })
    const op = doc.paths!['/orders/{orderId}/items/{n}']!.get!
    expect(op.responses).toEqual({ '200': { description: 'OK' } })
    expect(op.parameters!.map((p) => [(p as { name: string }).name, (p as { required?: boolean }).required])).toEqual([
      ['orderId', true],
      ['n', true],
    ])
  })

  it('reads query parameters from the URL', () => {
    const op = blockToDocument({ url: '/search?q=cats&page=2&exact=true' }).paths!['/search']!.get!
    expect(op.parameters).toEqual([
      { name: 'q', in: 'query', schema: { type: 'string' }, example: 'cats' },
      { name: 'page', in: 'query', schema: { type: 'integer' }, example: 2 },
      { name: 'exact', in: 'query', schema: { type: 'boolean' }, example: true },
    ])
  })

  it('several requests: shared base URL and auth, own servers for another host, unique ids', () => {
    const doc = blockToDocument({
      title: 'Orders',
      baseUrl: 'https://api.shop.io/v2/',
      auth: { type: 'apiKey', in: 'header', name: 'X-Key' },
      requests: [
        { url: '/orders', summary: 'List' },
        { method: 'post', url: 'https://api.shop.io/v2/orders', body: { type: 'form', example: { a: 1 } }, auth: 'none' },
        { url: 'https://files.shop.io/upload', method: 'PUT', body: { type: 'multipart', schema: { type: 'object', properties: { file: 'file!' } } }, auth: 'basic' },
      ],
    })
    expect(doc.info.title).toBe('Orders')
    expect(doc.servers).toEqual([{ url: 'https://api.shop.io/v2' }])
    expect(doc.security).toEqual([{ apiKeyAuth: [] }])
    expect(doc.paths!['/orders']!.get!.operationId).toBe('getOrders')
    const post = doc.paths!['/orders']!.post!
    expect(post.security).toEqual([])
    expect(Object.keys((post.requestBody as { content: object }).content)).toEqual(['application/x-www-form-urlencoded'])
    const put = doc.paths!['/upload']!.put!
    expect(put.servers).toEqual([{ url: 'https://files.shop.io' }])
    expect((put.requestBody as { content: Record<string, { schema: unknown }> }).content['multipart/form-data']!.schema).toEqual({
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    })
    expect(Object.keys(doc.components!.securitySchemes!)).toEqual(['apiKeyAuth', 'basicAuth'])
  })

  it('auth kinds', () => {
    const schemes = (auth: unknown) => blockToDocument({ url: '/x', auth }).components?.securitySchemes
    expect(schemes('basic')).toEqual({ basicAuth: { type: 'http', scheme: 'basic' } })
    expect(schemes({ type: 'bearer', format: 'JWT' })).toEqual({ bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } })
    expect(schemes('apiKey')).toEqual({ apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' } })
    expect(schemes({ type: 'oauth2', tokenUrl: 'https://a.io/token', scopes: ['read', 'write'] })).toEqual({
      oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://a.io/token', scopes: { read: '', write: '' } } } },
    })
    expect(blockToDocument({ url: '/x', auth: { type: 'oauth2', tokenUrl: 'https://a.io/t', scopes: { read: 'Read' } } }).paths!['/x']!.get!.security).toEqual([{ oauth2: ['read'] }])
    expect(schemes({ type: 'openIdConnect', url: 'https://a.io/.well-known/openid-configuration' })).toEqual({
      openIdConnect: { type: 'openIdConnect', openIdConnectUrl: 'https://a.io/.well-known/openid-configuration' },
    })
    expect(blockToDocument({ url: '/x', auth: 'none' }).paths!['/x']!.get!.security).toEqual([])
  })

  it('response headers and a text response', () => {
    const op = blockToDocument({ url: '/x', responses: { 200: { type: 'text', example: 'pong', headers: { 'X-Rate': 'integer Remaining calls' } }, default: null } }).paths!['/x']!.get!
    expect(op.responses).toEqual({
      '200': { description: 'OK', headers: { 'X-Rate': { description: 'Remaining calls', schema: { type: 'integer' } } }, content: { 'text/plain': { schema: { type: 'string' }, example: 'pong' } } },
      default: { description: 'Error' },
    })
  })

  it('operation ids', () => {
    expect(operationIdFor('GET', '/v1/users/{user-id}/orders')).toBe('getV1UsersByUserIdOrders')
    expect(operationIdFor('delete', '/')).toBe('deleteRoot')
    const doc = blockToDocument({ requests: [{ url: '/a' }, { url: '/a', method: 'POST', operationId: 'getA' }] })
    expect([doc.paths!['/a']!.get!.operationId, doc.paths!['/a']!.post!.operationId]).toEqual(['getA', 'getA2'])
  })

  it('keeps x- extensions', () => {
    const doc = blockToDocument({ 'x-team': 'a', requests: [{ url: '/a', 'x-rate': 5 }] })
    expect((doc as unknown as Record<string, unknown>)['x-team']).toBe('a')
    expect((doc.paths!['/a']!.get! as unknown as Record<string, unknown>)['x-rate']).toBe(5)
  })
})

describe('parseBlock errors', () => {
  it('names the line of a value at fault', () => {
    expect(fail('url: /a\nmethod: FETCH\n')).toEqual({ message: expect.stringContaining('Unknown method "FETCH"'), line: 2, column: 1, pointer: '/method' })
    expect(fail('requests:\n  - url: /a\n  - url: users\n')).toMatchObject({ message: expect.stringContaining('not a URL'), line: 3 })
    expect(fail('url: /a\nauth: magic\n')).toMatchObject({ message: expect.stringContaining('Unknown auth type "magic"'), line: 2 })
    expect(fail('url: /a\nparams:\n  query:\n    n: numbr\n')).toMatchObject({ message: expect.stringContaining('"numbr" is not a type'), line: 4 })
    expect(fail('url: /a\nparams:\n  body: { a: string }\n')).toMatchObject({ message: expect.stringContaining('Unknown parameter location "body"'), line: 3 })
    expect(fail('url: /a\nparams:\n  path: { id: integer }\n')).toMatchObject({ message: expect.stringContaining('not in the URL'), line: 3 })
    expect(fail('url: /a\nrespones: {}\n')).toMatchObject({ message: expect.stringContaining('did you mean "responses"'), line: 2 })
    expect(fail('url: /a\nresponses:\n  20: OK\n')).toMatchObject({ message: expect.stringContaining('not a status'), line: 3 })
    expect(fail('url: /a\nbody: { type: weird }\n')).toMatchObject({ message: expect.stringContaining('Unknown media type'), line: 2 })
    expect(fail('summary: no url\n')).toMatchObject({ message: expect.stringContaining('needs `url`') })
    expect(fail('requests:\n  - url: /a\n  - url: /a\n')).toMatchObject({ message: expect.stringContaining('already in the block'), line: 3 })
  })

  it('reports syntax errors with their place, in YAML and JSON', () => {
    expect(fail('url: /a\nparams: [unclosed\n')).toMatchObject({ line: expect.any(Number), column: expect.any(Number) })
    expect(fail('{\n  "url": "/a",\n  "method": }\n')).toMatchObject({ line: 3 })
    expect(fail('   \n')).toMatchObject({ message: expect.stringContaining('empty') })
  })
})

describe('full documents', () => {
  it('pass through, normalized to 3.1', () => {
    const r = ok('swagger: "2.0"\ninfo: { title: Old, version: "1" }\npaths:\n  /a:\n    get:\n      responses: { 200: { description: OK } }\n')
    expect(r.kind).toBe('document')
    expect(r.document.openapi).toBe('3.1.0')
    expect(r.document.paths!['/a']!.get).toBeDefined()
    const j = ok(JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} }))
    expect(j).toMatchObject({ kind: 'document', format: 'json' })
  })

  it('an unsupported version is an error', () => {
    expect(fail('openapi: 4.0.0\n').message).toContain('Unsupported OpenAPI version')
  })
})

describe('stringifyBlock', () => {
  it('round-trips YAML ↔ JSON through the parser', () => {
    const { data } = ok(SAMPLE)
    const json = stringifyBlock(data, 'json')
    const fromJson = ok(json)
    expect(fromJson.format).toBe('json')
    expect(fromJson.data).toEqual(data)
    const yaml = stringifyBlock(fromJson.data, 'yaml')
    const back = ok(yaml)
    expect(back.format).toBe('yaml')
    expect(back.data).toEqual(data)
    expect(back.document).toEqual(ok(SAMPLE).document)
    // Statuses stay plain keys, strings that look like other things are quoted.
    expect(yaml).toMatch(/^ {2}200:/m)
    expect(stringifyBlock({ url: '/a', summary: 'true', description: 'a: b' }, 'yaml')).toBe("url: /a\nsummary: 'true'\ndescription: 'a: b'\n")
  })
})

describe('the constructor model', () => {
  const roundTrip = (data: unknown, format: 'yaml' | 'json' = 'yaml') => modelToBlock(blockToModel(data, format), data, format)

  it('reads the fields', () => {
    const m = blockToModel(ok(SAMPLE).data)
    expect(m.multiple).toBe(false)
    const r = m.requests[0]!
    expect([r.method, r.url, r.summary, r.auth.kind]).toEqual(['POST', 'https://api.example.com/v1/users/{id}', 'Update a user', 'bearer'])
    expect(r.params.map((p) => [p.in, p.name, p.type, p.required, p.example])).toEqual([
      ['path', 'id', 'integer', true, ''],
      ['query', 'verbose', 'boolean', false, 'true'],
      ['header', 'X-Request-Id', 'string', false, ''],
    ])
    expect(r.body).toMatchObject({ enabled: true, type: 'json', mode: 'example', required: true })
    expect(JSON.parse(r.body.example)).toEqual({ name: 'Ann', age: 31 })
    expect(r.responses.map((x) => [x.status, x.description])).toEqual([
      ['200', 'OK'],
      ['404', 'Not found'],
    ])
  })

  it('gives the data back unchanged — and its text', () => {
    for (const text of [SAMPLE, stringifyBlock(ok(SAMPLE).data, 'json')]) {
      const { data, format } = ok(text)
      const { data: back, errors } = roundTrip(data, format)
      expect(errors).toEqual([])
      expect(back).toEqual(data)
      expect(stringifyBlock(back, format)).toBe(stringifyBlock(data, format))
    }
    const rich = {
      title: 'Shop',
      baseUrl: 'https://a.io',
      auth: { type: 'oauth2', flow: 'clientCredentials', tokenUrl: 'https://a.io/t', scopes: { read: 'Read things' } },
      'x-team': 'core',
      requests: [
        {
          url: '/items/{id}',
          operationId: 'item',
          params: { path: { id: { type: 'integer', minimum: 1 } }, query: { sort: { type: 'string', enum: ['a', 'b'] } } },
          responses: { 200: { schema: { type: 'object' }, headers: { 'X-A': 'string' } }, 404: null },
          'x-rate': 3,
        },
        { url: '/a?x=1', method: 'DELETE', auth: 'none', body: { type: 'text', example: 'hi', required: false } },
      ],
    }
    expect(roundTrip(rich).data).toEqual(rich)
  })

  it('changes only what the form changed, keeping what it cannot express', () => {
    const data = {
      url: '/items/{id}',
      operationId: 'item',
      'x-rate': 3,
      params: { path: { id: { type: 'integer', minimum: 1 } }, query: { sort: { type: 'string', enum: ['a', 'b'] } } },
      responses: { 200: { description: 'OK', schema: { type: 'object' }, headers: { 'X-A': 'string' } } },
    }
    const m = blockToModel(data)
    const r = m.requests[0]!
    r.summary = 'Get an item'
    r.method = 'PUT'
    r.params[1]!.description = 'Order'
    r.params.push({ ...emptyParam('header', 'X-Trace'), required: true })
    r.responses[0]!.description = 'The item'
    r.responses[0]!.example = '{"id": 1}'
    const { data: out, errors } = modelToBlock(m, data)
    expect(errors).toEqual([])
    expect(out).toEqual({
      url: '/items/{id}',
      operationId: 'item',
      'x-rate': 3,
      params: { path: { id: { type: 'integer', minimum: 1 } }, query: { sort: { type: 'string', enum: ['a', 'b'], description: 'Order' } }, header: { 'X-Trace': 'string!' } },
      responses: { 200: { description: 'The item', schema: { type: 'object' }, headers: { 'X-A': 'string' }, example: { id: 1 } } },
      summary: 'Get an item',
      method: 'PUT',
    })
    expect(parseBlock(stringifyBlock(out, 'yaml')).ok).toBe(true)
  })

  it('keeps a parameter shorthand a shorthand, and moves to the object form for an example', () => {
    const data = { url: '/a', params: { query: { q: 'string! Text to find' } } }
    const m = blockToModel(data)
    m.requests[0]!.params[0]!.type = 'string(email)'
    expect(modelToBlock(m, data).data.params).toEqual({ query: { q: 'string(email)! Text to find' } })
    m.requests[0]!.params[0]!.example = 'a@b.co'
    m.requests[0]!.params[0]!.required = false
    expect(modelToBlock(m, data).data.params).toEqual({ query: { q: { type: 'string(email)', description: 'Text to find', example: 'a@b.co' } } })
  })

  it('renames and relocates parameters and statuses', () => {
    const data = { url: '/a', params: { query: { q: 'integer' } }, responses: { 200: 'Fine' } }
    const m = blockToModel(data)
    const p = m.requests[0]!.params[0]!
    p.name = 'limit'
    p.in = 'header'
    m.requests[0]!.responses[0]!.status = '201'
    expect(modelToBlock(m, data).data).toEqual({ url: '/a', params: { header: { limit: 'integer' } }, responses: { 201: 'Fine' } })
  })

  it('path parameters follow the URL', () => {
    const r = emptyRequest('/users/{id}')
    expect(r.params.map((p) => [p.name, p.implicit])).toEqual([['id', true]])
    // An implied parameter left as it is is not written.
    expect(modelToBlock({ multiple: false, title: '', baseUrl: '', auth: blockToModel({}).auth, requests: [r] }).data).toEqual({
      url: '/users/{id}',
      responses: { 200: 'OK' },
    })
    r.params[0]!.type = 'integer'
    r.url = '/users/{id}/posts/{postId}'
    syncPathParams(r)
    expect(r.params.map((p) => [p.name, p.type])).toEqual([
      ['id', 'integer'],
      ['postId', 'string'],
    ])
    r.url = '/users/{postId}'
    syncPathParams(r)
    expect(r.params.map((p) => p.name)).toEqual(['postId'])
  })

  it('body: media type, example and schema texts, errors for unreadable text', () => {
    const data = { method: 'POST', url: '/a', body: { example: { a: 1 } } }
    const m = blockToModel(data)
    const body = m.requests[0]!.body
    body.example = '{"a": 2, "b": [1]}'
    body.schema = 'type: object\nproperties:\n  a: integer!\n'
    body.type = 'form'
    let res = modelToBlock(m, data)
    expect(res.errors).toEqual([])
    expect(res.data.body).toEqual({ example: { a: 2, b: [1] }, type: 'form', schema: { type: 'object', properties: { a: 'integer!' } } })
    expect(parseBlock(stringifyBlock(res.data, 'yaml')).ok).toBe(true)
    body.example = '{"a": '
    res = modelToBlock(m, res.data)
    expect(res.errors).toEqual([{ field: '0.body.example', message: expect.any(String) }])
    expect(res.data.body).toMatchObject({ example: { a: 2, b: [1] } })
    body.enabled = false
    expect(modelToBlock(m, data).data.body).toBeUndefined()
  })

  it('auth: changes are written compactly, an unchanged one stays as written', () => {
    const data = { url: '/a', auth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://t', scopes: { r: 'Read' } } } } }
    const m = blockToModel(data)
    expect(m.requests[0]!.auth).toMatchObject({ kind: 'oauth2', flow: 'clientCredentials', tokenUrl: 'https://t', scopes: 'r' })
    expect(modelToBlock(m, data).data).toEqual(data)
    m.requests[0]!.auth.kind = 'apiKey'
    m.requests[0]!.auth.in = 'query'
    m.requests[0]!.auth.name = 'key'
    expect(modelToBlock(m, data).data.auth).toEqual({ type: 'apiKey', in: 'query', name: 'key' })
    m.requests[0]!.auth.kind = 'bearer'
    expect(modelToBlock(m, data).data.auth).toBe('bearer')
    m.requests[0]!.auth.kind = 'inherit'
    expect(modelToBlock(m, data).data.auth).toBeUndefined()
  })

  it('one request becomes several, with shared settings at the top', () => {
    const data = { title: 'T', url: 'https://a.io/x', description: 'About x', summary: 'X' }
    const m = blockToModel(data)
    m.multiple = true
    m.requests.push(emptyRequest('/y'))
    m.auth.kind = 'bearer'
    const { data: out } = modelToBlock(m, data)
    expect(out).toEqual({ title: 'T', auth: 'bearer', requests: [{ url: 'https://a.io/x', description: 'About x', summary: 'X' }, { url: '/y', responses: { 200: 'OK' } }] })
    const parsed = ok(stringifyBlock(out, 'yaml'))
    expect(parsed.document.security).toEqual([{ bearerAuth: [] }])
    // After writing, the model's items point into the new data: the next write keeps it.
    syncOrigins(m)
    expect(modelToBlock(m, out).data).toEqual(out)
  })

  it('a brand new block from an empty model', () => {
    const m = blockToModel({})
    expect(m.requests).toHaveLength(1)
    m.requests[0]!.url = '/ping'
    const { data } = modelToBlock(m)
    expect(ok(stringifyBlock(data, 'json')).document.paths!['/ping']).toBeDefined()
  })
})
