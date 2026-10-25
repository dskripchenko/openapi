import { fixtureJson } from '../../tests/fixtures/specs'
import type { MediaType, Operation, Parameter, RequestBody, Response, Schema } from '../core/types'
import { normalize } from './normalize'
import { upgradeSchema30 } from './upgrade30'

const swaggerBase = { swagger: '2.0', info: { title: 'T', version: '1' } }

describe('normalize: Swagger 2.0 petstore', () => {
  const raw = fixtureJson('petstore-swagger2.json')
  const before = JSON.stringify(raw)
  const { document: doc, warnings } = normalize(raw)
  const op = (path: string, method: string) => (doc.paths?.[path] as Record<string, Operation>)[method] as Operation

  it('does not mutate the input', () => {
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('produces a 3.1 document with servers from host/basePath/schemes', () => {
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.swagger).toBeUndefined()
    expect(doc.servers).toEqual([{ url: 'https://petstore.swagger.io/v2' }, { url: 'http://petstore.swagger.io/v2' }])
    expect(doc['x-logo']).toEqual({ url: 'https://example.com/logo.png' })
    expect(doc.tags?.[0]?.name).toBe('pet')
    expect(warnings).toEqual([])
  })

  it('moves definitions to components.schemas and rewrites refs', () => {
    const pet = doc.components?.schemas?.Pet as Schema
    expect(pet.properties?.category).toEqual({ $ref: '#/components/schemas/Category' })
    expect(pet.properties?.tags?.items).toEqual({ $ref: '#/components/schemas/Tag' })
    // x-nullable → type with null; example → examples
    expect(pet.properties?.nickname).toEqual({ type: ['string', 'null'] })
    expect(pet.properties?.name).toEqual({ type: 'string', example: 'doggie', examples: ['doggie'] })
  })

  it('turns a body parameter into a requestBody per consumes', () => {
    const body = op('/pet', 'post').requestBody as RequestBody
    expect(body.required).toBe(true)
    expect(body.description).toMatch(/Pet object/)
    expect(Object.keys(body.content)).toEqual(['application/json', 'application/xml'])
    expect(body.content['application/json']?.schema).toEqual({ $ref: '#/components/schemas/Pet' })
    expect(op('/pet', 'post').parameters).toBeUndefined()
  })

  it('keeps a global body parameter as a requestBodies reference', () => {
    expect(op('/pet', 'put').requestBody).toEqual({ $ref: '#/components/requestBodies/PetBody' })
    const rb = doc.components?.requestBodies?.PetBody as RequestBody
    expect(rb.content['application/json']?.schema).toEqual({ $ref: '#/components/schemas/Pet' })
    expect(doc.components?.parameters?.PetBody).toBeUndefined()
  })

  it('turns file formData into multipart with a binary property', () => {
    const body = op('/pet/{petId}/uploadImage', 'post').requestBody as RequestBody
    expect(Object.keys(body.content)).toEqual(['multipart/form-data'])
    const schema = body.content['multipart/form-data']?.schema as Schema
    expect(schema.type).toBe('object')
    expect(schema.properties?.file).toEqual({ type: 'string', format: 'binary', description: 'file to upload' })
    expect(schema.properties?.additionalMetadata?.type).toBe('string')
    const params = op('/pet/{petId}/uploadImage', 'post').parameters as Parameter[]
    expect(params.map((p) => p.name)).toEqual(['petId'])
  })

  it('turns plain formData into urlencoded', () => {
    const body = op('/pet/{petId}', 'post').requestBody as RequestBody
    expect(Object.keys(body.content)).toEqual(['application/x-www-form-urlencoded'])
    expect(Object.keys((body.content['application/x-www-form-urlencoded']?.schema as Schema).properties ?? {})).toEqual([
      'name',
      'status',
    ])
  })

  it('converts parameter type/items/collectionFormat into schema/style/explode', () => {
    const status = (op('/pet/findByStatus', 'get').parameters as Parameter[])[0] as Parameter
    expect(status).toMatchObject({ name: 'status', in: 'query', required: true, style: 'form', explode: true })
    expect(status.schema).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['available', 'pending', 'sold'], default: 'available' },
    })
    const tags = (op('/pet/findByTags', 'get').parameters as Parameter[])[0] as Parameter
    expect(tags).toMatchObject({ style: 'form', explode: false })
    expect((op('/pet/findByTags', 'get').parameters as unknown[])[1]).toEqual({ $ref: '#/components/parameters/Limit' })
    expect((doc.components?.parameters?.Limit as Parameter).schema).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  })

  it('converts boolean exclusiveMinimum on parameters', () => {
    const p = (op('/store/order/{orderId}', 'get').parameters as Parameter[])[0] as Parameter
    expect(p.schema).toEqual({ type: 'integer', format: 'int64', maximum: 10, exclusiveMinimum: 1 })
  })

  it('keeps path-level parameters at the path level', () => {
    const item = doc.paths?.['/pet/{petId}']
    expect((item?.parameters as Parameter[])[0]?.schema).toEqual({ type: 'integer', format: 'int64' })
  })

  it('builds response content from produces, with examples and headers', () => {
    const ok = op('/pet/findByStatus', 'get').responses?.['200'] as Response
    expect(Object.keys(ok.content ?? {})).toEqual(['application/json', 'application/xml'])
    const json = ok.content?.['application/json'] as MediaType
    expect(json.schema).toEqual({ type: 'array', items: { $ref: '#/components/schemas/Pet' } })
    expect(json.example).toEqual([{ id: 1, name: 'doggie', photoUrls: [], status: 'available' }])
    // Separate objects per media type.
    expect(ok.content?.['application/xml']?.schema).not.toBe(json.schema)

    const login = op('/user/login', 'get').responses?.['200'] as Response
    expect(login.headers?.['X-Rate-Limit']).toEqual({
      description: 'calls per hour allowed by the user',
      schema: { type: 'integer', format: 'int32' },
    })
    expect(Object.keys((op('/store/inventory', 'get').responses?.['200'] as Response).content ?? {})).toEqual(['application/json'])
    expect((op('/pet', 'post').responses?.['405'] as Response).content).toBeUndefined()
  })

  it('rewrites response refs and converts components.responses', () => {
    expect(op('/pet/{petId}', 'get').responses?.['404']).toEqual({ $ref: '#/components/responses/NotFound' })
    const nf = doc.components?.responses?.NotFound as Response
    expect(nf.content?.['application/json']?.schema).toEqual({ $ref: '#/components/schemas/ApiResponse' })
  })

  it('converts security definitions', () => {
    const s = doc.components?.securitySchemes ?? {}
    expect(s.api_key).toEqual({ type: 'apiKey', name: 'api_key', in: 'header' })
    expect(s.basicAuth).toEqual({ type: 'http', scheme: 'basic', description: 'HTTP basic' })
    expect(s.petstore_auth).toEqual({
      type: 'oauth2',
      flows: {
        implicit: {
          authorizationUrl: 'https://petstore.swagger.io/oauth/authorize',
          scopes: { 'write:pets': 'modify pets in your account', 'read:pets': 'read your pets' },
        },
      },
    })
    expect(s.app_auth).toMatchObject({ flows: { clientCredentials: { tokenUrl: 'https://petstore.swagger.io/oauth/token' } } })
    expect(s.code_auth).toMatchObject({
      flows: { authorizationCode: { authorizationUrl: expect.any(String), tokenUrl: expect.any(String), scopes: {} } },
    })
  })
})

describe('normalize: Swagger 2.0 edge cases', () => {
  it('uses a relative server when host is missing, and https by default', () => {
    expect(normalize({ ...swaggerBase, basePath: '/api', paths: {} }).document.servers).toEqual([{ url: '/api' }])
    expect(normalize({ ...swaggerBase, host: 'x.io', paths: {} }).document.servers).toEqual([{ url: 'https://x.io' }])
    expect(normalize({ ...swaggerBase, paths: {} }).document.servers).toBeUndefined()
  })

  it('maps every collectionFormat and warns on tsv', () => {
    const param = (collectionFormat: string, where = 'query') => ({
      name: 'a',
      in: where,
      type: 'array',
      items: { type: 'string' },
      collectionFormat,
    })
    const { document, warnings } = normalize({
      ...swaggerBase,
      paths: {
        '/x': {
          get: {
            parameters: [param('ssv'), { ...param('pipes'), name: 'b' }, { ...param('tsv'), name: 'c' }, { ...param('csv', 'header'), name: 'd' }],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    })
    const ps = document.paths?.['/x']?.get?.parameters as Parameter[]
    expect(ps[0]).toMatchObject({ style: 'spaceDelimited', explode: false })
    expect(ps[1]).toMatchObject({ style: 'pipeDelimited', explode: false })
    expect(ps[2]).toMatchObject({ style: 'form', explode: false })
    expect(ps[3]?.style).toBeUndefined()
    expect(warnings.some((w) => w.includes('tsv'))).toBe(true)
  })

  it('inlines a referenced formData parameter and merges path-level body', () => {
    const { document } = normalize({
      ...swaggerBase,
      parameters: { Upload: { name: 'f', in: 'formData', type: 'file', required: true } },
      paths: {
        '/a': { post: { parameters: [{ $ref: '#/parameters/Upload' }], responses: { 200: { description: 'ok' } } } },
        '/b': {
          parameters: [{ name: 'payload', in: 'body', schema: { type: 'object' } }],
          put: { responses: { 200: { description: 'ok' } } },
        },
      },
    })
    const a = document.paths?.['/a']?.post?.requestBody as RequestBody
    expect(a.required).toBe(true)
    expect((a.content['multipart/form-data']?.schema as Schema).required).toEqual(['f'])
    const b = document.paths?.['/b']?.put?.requestBody as RequestBody
    expect(b.content['application/json']?.schema).toEqual({ type: 'object' })
    expect(document.paths?.['/b']?.parameters).toBeUndefined()
  })

  it('maps password flow and op-level schemes, keeps x-* on operations', () => {
    const { document } = normalize({
      ...swaggerBase,
      host: 'h.io',
      securityDefinitions: { pw: { type: 'oauth2', flow: 'password', tokenUrl: '/t', scopes: {}, 'x-a': 1 } },
      paths: { '/x': { get: { schemes: ['wss'], 'x-internal': true, responses: { default: { description: 'd' } } } } },
    })
    expect(document.components?.securitySchemes?.pw).toEqual({
      type: 'oauth2',
      flows: { password: { tokenUrl: '/t', scopes: {} } },
      'x-a': 1,
    })
    expect(document.paths?.['/x']?.get?.servers).toEqual([{ url: 'wss://h.io' }])
    expect(document.paths?.['/x']?.get?.['x-internal']).toBe(true)
  })

  it('turns a type: file response into a binary string', () => {
    const { document } = normalize({
      ...swaggerBase,
      produces: ['application/pdf'],
      paths: { '/f': { get: { responses: { 200: { description: 'pdf', schema: { type: 'file' } } } } } },
    })
    expect((document.paths?.['/f']?.get?.responses?.['200'] as Response).content?.['application/pdf']?.schema).toEqual({
      type: 'string',
      format: 'binary',
    })
  })
})

describe('normalize: 3.0 → 3.1 schemas', () => {
  it('handles nullable in all its forms', () => {
    expect(upgradeSchema30({ type: 'string', nullable: true })).toEqual({ type: ['string', 'null'] })
    expect(upgradeSchema30({ type: 'string', nullable: false })).toEqual({ type: 'string' })
    expect(upgradeSchema30({ type: 'string', enum: ['a'], nullable: true })).toEqual({
      type: ['string', 'null'],
      enum: ['a', null],
    })
    expect(upgradeSchema30({ $ref: '#/components/schemas/A', nullable: true })).toEqual({
      anyOf: [{ $ref: '#/components/schemas/A' }, { type: 'null' }],
    })
    expect(upgradeSchema30({ allOf: [{ $ref: '#/x' }], description: 'd', nullable: true })).toEqual({
      anyOf: [{ allOf: [{ $ref: '#/x' }] }, { type: 'null' }],
      description: 'd',
    })
    expect(upgradeSchema30({ oneOf: [{ type: 'string' }], nullable: true })).toEqual({
      oneOf: [{ type: 'string' }, { type: 'null' }],
    })
    expect(upgradeSchema30({ nullable: true })).toEqual({})
  })

  it('converts exclusive bounds, example and file', () => {
    expect(upgradeSchema30({ type: 'number', minimum: 1, exclusiveMinimum: true, maximum: 9, exclusiveMaximum: false })).toEqual({
      type: 'number',
      exclusiveMinimum: 1,
      maximum: 9,
    })
    expect(upgradeSchema30({ type: 'integer', example: 5 })).toEqual({ type: 'integer', example: 5, examples: [5] })
    expect(upgradeSchema30({ example: 5, examples: [6] })).toEqual({ example: 5, examples: [6] })
    expect(upgradeSchema30({ type: 'file' })).toEqual({ type: 'string', format: 'binary' })
  })

  it('recurses into nested schemas', () => {
    const out = upgradeSchema30({
      type: 'object',
      properties: { a: { type: 'string', nullable: true } },
      additionalProperties: { type: 'integer', nullable: true },
      items: { type: 'number', nullable: true },
      allOf: [{ properties: { b: { $ref: '#/x', nullable: true } } }],
      not: { type: 'string', nullable: true },
    }) as Schema
    expect(out.properties?.a?.type).toEqual(['string', 'null'])
    expect((out.additionalProperties as Schema).type).toEqual(['integer', 'null'])
    expect(out.items?.type).toEqual(['number', 'null'])
    expect(out.allOf?.[0]?.properties?.b).toEqual({ anyOf: [{ $ref: '#/x' }, { type: 'null' }] })
    expect(out.not?.type).toEqual(['string', 'null'])
  })

  it('walks every schema location of a document', () => {
    const nullableStr = () => ({ type: 'string', nullable: true })
    const content = () => ({ 'application/json': { schema: nullableStr() } })
    const raw = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/x': {
          parameters: [{ name: 'p', in: 'query', schema: nullableStr() }],
          post: {
            parameters: [{ name: 'q', in: 'query', content: content() }],
            requestBody: { content: content() },
            responses: { 200: { description: 'ok', headers: { H: { schema: nullableStr() } }, content: content() } },
            callbacks: { cb: { '{$url}': { post: { requestBody: { content: content() }, responses: {} } } } },
          },
        },
      },
      components: {
        schemas: { S: nullableStr() },
        parameters: { P: { name: 'p', in: 'query', schema: nullableStr() } },
        headers: { H: { schema: nullableStr() } },
        requestBodies: { B: { content: content() } },
        responses: { R: { description: 'r', content: content() } },
      },
    }
    const before = JSON.stringify(raw)
    const { document } = normalize(raw)
    expect(JSON.stringify(raw)).toBe(before)
    expect(document.openapi).toBe('3.1.0')
    const text = JSON.stringify(document)
    expect(text).not.toContain('nullable')
    expect(text.match(/\["string","null"\]/g)?.length).toBe(11)
  })

  it('keeps aliased schemas consistent', () => {
    const shared = { $ref: '#/components/schemas/A', nullable: true }
    const raw = {
      openapi: '3.0.0',
      info: { title: 'T', version: '1' },
      paths: {},
      components: { schemas: { A: { type: 'object' }, B: { properties: { x: shared, y: shared } } } },
    }
    const b = normalize(raw).document.components?.schemas?.B as Schema
    expect(b.properties?.x).toEqual({ anyOf: [{ $ref: '#/components/schemas/A' }, { type: 'null' }] })
    expect(b.properties?.y).toBe(b.properties?.x)
  })
})

describe('normalize: 3.1 input', () => {
  it('returns an equal clone', () => {
    const raw = fixtureJson('kitchen-sink-31.json')
    const { document, warnings } = normalize(raw)
    expect(document).toEqual(raw)
    expect(document).not.toBe(raw)
    expect(document.components).not.toBe((raw as { components: unknown }).components)
    expect(warnings).toEqual([])
  })

  it('fills a missing info with a warning', () => {
    const { document, warnings } = normalize({ openapi: '3.1.0' })
    expect(document.info).toEqual({ title: '', version: '' })
    expect(warnings).toHaveLength(1)
  })
})
