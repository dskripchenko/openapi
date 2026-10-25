import { fixtureJson } from '../../tests/fixtures/specs'
import type { PositionMap } from '../core/types'
import { validateDocument, type DocumentIssue } from './document'

const ok = { responses: { 200: { description: 'ok' } } }
const v30 = (extra: object = {}) => ({ openapi: '3.0.3', info: { title: 'T', version: '1' }, paths: {}, ...extra })
const v31 = (extra: object = {}) => ({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {}, ...extra })
const v20 = (extra: object = {}) => ({ swagger: '2.0', info: { title: 'T', version: '1' }, paths: {}, ...extra })

const messages = (issues: DocumentIssue[]) => issues.map((i) => `${i.severity} ${i.pointer} ${i.message}`)
const errors = (raw: unknown) => validateDocument(raw).filter((i) => i.severity === 'error')
const warnings = (raw: unknown) => validateDocument(raw).filter((i) => i.severity === 'warning')

describe('validateDocument: fixtures are clean', () => {
  it.each(['petstore-swagger2.json', 'petstore-31.json', 'kitchen-sink-31.json'])('%s', (name) => {
    expect(messages(validateDocument(fixtureJson(name)))).toEqual([])
  })
})

describe('validateDocument: rules', () => {
  it('rejects non-specs', () => {
    expect(messages(validateDocument({ foo: 1 }))).toEqual([
      'error  Not an OpenAPI document: neither "openapi" nor "swagger" field found',
    ])
  })

  it('requires info, title and version as strings', () => {
    expect(messages(errors({ openapi: '3.0.0', paths: {} }))).toEqual(['error  info is required'])
    expect(messages(errors({ openapi: '3.0.0', info: {}, paths: {} }))).toEqual([
      'error /info info.title is required',
      'error /info info.version is required',
    ])
    expect(messages(errors({ openapi: '3.0.0', info: { title: 1, version: 1.0 }, paths: {} }))).toEqual([
      'error /info/title info.title must be a string',
      'error /info/version info.version must be a string',
    ])
    expect(messages(errors({ openapi: '3.0.0', info: [], paths: {} }))).toEqual(['error /info info must be an object'])
  })

  it('requires paths for 2.0/3.0 but not 3.1', () => {
    expect(messages(errors({ swagger: '2.0', info: { title: 'T', version: '1' } }))).toEqual(['error  paths is required'])
    expect(messages(errors({ openapi: '3.0.1', info: { title: 'T', version: '1' } }))).toEqual(['error  paths is required'])
    expect(errors({ openapi: '3.1.0', info: { title: 'T', version: '1' }, webhooks: {} })).toEqual([])
    expect(messages(errors({ openapi: '3.1.0', info: { title: 'T', version: '1' } }))).toEqual([
      'error  One of paths, components or webhooks is required',
    ])
    expect(messages(errors(v30({ paths: [] })))).toEqual(['error /paths paths must be an object'])
    expect(messages(errors(v30({ paths: { pets: {} } })))).toEqual(['error /paths/pets Path "pets" must start with "/"'])
  })

  it('requires responses for 2.0/3.0 operations only', () => {
    expect(messages(errors(v30({ paths: { '/a': { get: {} } } })))).toEqual(['error /paths/~1a/get responses is required'])
    expect(messages(errors(v20({ paths: { '/a': { get: {} } } })))).toEqual(['error /paths/~1a/get responses is required'])
    expect(errors(v31({ paths: { '/a': { get: {} } } }))).toEqual([])
    expect(messages(errors(v30({ paths: { '/a': { get: { responses: {} } } } })))).toEqual([
      'error /paths/~1a/get/responses responses must contain at least one response',
    ])
  })

  it('requires response description and valid status codes', () => {
    const doc = v30({
      paths: {
        '/a': { get: { responses: { 200: {}, '2XX': { description: 'r' }, '600': { description: 'x' }, abc: { description: 'y' }, default: { description: 'd' }, 'x-foo': 1 } } },
      },
    })
    expect(messages(errors(doc))).toEqual([
      'error /paths/~1a/get/responses/200 response.description is required',
      'error /paths/~1a/get/responses/600 Invalid status code "600"',
      'error /paths/~1a/get/responses/abc Invalid status code "abc"',
    ])
  })

  it('checks parameter name/in/required', () => {
    const doc = v30({
      paths: {
        '/a/{id}': {
          get: {
            ...ok,
            parameters: [
              { in: 'query' },
              { name: 'x' },
              { name: 'y', in: 'body' },
              { name: 'id', in: 'path' },
            ],
          },
        },
      },
    })
    expect(messages(errors(doc))).toEqual([
      'error /paths/~1a~1{id}/get/parameters/0 parameter.name is required',
      'error /paths/~1a~1{id}/get/parameters/1 parameter.in is required',
      'error /paths/~1a~1{id}/get/parameters/2/in Invalid parameter location "body"',
      'error /paths/~1a~1{id}/get/parameters/3 Path parameter "id" must have required: true',
    ])
    // body is fine in 2.0
    expect(errors(v20({ paths: { '/a': { post: { ...ok, parameters: [{ name: 'b', in: 'body', schema: {} }] } } } }))).toEqual([])
  })

  it('matches path templates and path parameters both ways', () => {
    const doc = v30({
      paths: {
        '/a/{id}/{sub}': {
          parameters: [{ name: 'id', in: 'path', required: true }],
          get: { ...ok, parameters: [{ name: 'extra', in: 'path', required: true }] },
          put: { ...ok, parameters: [{ name: 'sub', in: 'path', required: true }] },
        },
      },
    })
    expect(messages(errors(doc))).toEqual([
      'error /paths/~1a~1{id}~1{sub}/get Path parameter "sub" of "/a/{id}/{sub}" is not defined',
      'error /paths/~1a~1{id}~1{sub}/get/parameters/0 Path parameter "extra" does not appear in "/a/{id}/{sub}"',
    ])
  })

  it('resolves parameter refs for template checks', () => {
    const doc = v30({
      paths: { '/a/{id}': { parameters: [{ $ref: '#/components/parameters/Id' }], get: ok } },
      components: { parameters: { Id: { name: 'id', in: 'path', required: true } } },
    })
    expect(errors(doc)).toEqual([])
  })

  it('reports duplicate parameters and operationIds', () => {
    const doc = v30({
      paths: {
        '/a': { get: { ...ok, operationId: 'op', parameters: [{ name: 'q', in: 'query' }, { name: 'q', in: 'query' }, { name: 'q', in: 'header' }] } },
        '/b': { get: { ...ok, operationId: 'op' } },
      },
    })
    expect(messages(errors(doc))).toEqual([
      'error /paths/~1a/get/parameters/1 Duplicate parameter "q" in query',
      'error /paths/~1b/get/operationId Duplicate operationId "op" (first at /paths/~1a/get)',
    ])
  })

  it('warns on unknown top-level fields and invalid method keys', () => {
    const doc = v30({ 'x-ok': 1, foo: 1, webhooks: {}, paths: { '/a': { GET: ok, copy: ok, summary: 's', 'x-y': 1 } } })
    expect(messages(warnings(doc))).toEqual([
      'warning /foo Unknown top-level field "foo"',
      'warning /webhooks Unknown top-level field "webhooks"',
      'warning /paths/~1a/GET HTTP method "GET" must be lower case',
      'warning /paths/~1a/copy Unknown field or HTTP method "copy"',
    ])
    expect(warnings(v31({ webhooks: {} }))).toEqual([])
  })

  it('checks types of known fields', () => {
    expect(messages(errors(v30({ servers: {}, tags: {}, security: {}, components: [], externalDocs: 'x' })))).toEqual([
      'error /externalDocs externalDocs must be an object',
      'error /security security must be an array',
      'error /components components must be an object',
      'error /servers servers must be an array',
      'error /tags tags must be an array',
    ])
    expect(messages(errors(v20({ schemes: 'https', definitions: [] })))).toEqual([
      'error /schemes schemes must be an array',
      'error /definitions definitions must be an object',
    ])
  })

  it('reports unresolved internal refs, ignores external ones and example data', () => {
    const doc = v30({
      paths: {
        '/a': {
          get: {
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Missing' },
                    example: { $ref: '#/not/structure' },
                    examples: { e: { $ref: '#/components/examples/Nope' } },
                  },
                },
              },
              404: { $ref: 'common.yaml#/NotFound' },
            },
          },
        },
      },
      components: { schemas: { Ok: { properties: { example: { $ref: '#/components/schemas/Gone' } } } } },
    })
    expect(messages(errors(doc))).toEqual([
      'error /paths/~1a/get/responses/200/content/application~1json/schema/$ref Reference "#/components/schemas/Missing" does not resolve',
      'error /paths/~1a/get/responses/200/content/application~1json/examples/e/$ref Reference "#/components/examples/Nope" does not resolve',
      'error /components/schemas/Ok/properties/example/$ref Reference "#/components/schemas/Gone" does not resolve',
    ])
  })

  it('reports security requirements with undefined schemes', () => {
    const doc = v30({
      security: [{ known: [] }, { unknown: [] }],
      paths: { '/a': { get: { ...ok, security: [{ other: ['s'] }] } } },
      components: { securitySchemes: { known: { type: 'http', scheme: 'bearer' } } },
    })
    expect(messages(errors(doc))).toEqual([
      'error /security/1/unknown Security scheme "unknown" is not defined',
      'error /paths/~1a/get/security/0/other Security scheme "other" is not defined',
    ])
    expect(errors(v20({ securityDefinitions: { k: { type: 'basic' } }, security: [{ k: [] }] }))).toEqual([])
  })

  it('checks security scheme shape', () => {
    const doc = v30({
      components: {
        securitySchemes: { a: { type: 'apiKey' }, b: { type: 'magic' }, c: { type: 'http' }, d: { type: 'mutualTLS' } },
      },
    })
    expect(messages(errors(doc))).toEqual([
      'error /components/securitySchemes/a apiKey security scheme needs name',
      'error /components/securitySchemes/a apiKey security scheme needs in',
      'error /components/securitySchemes/b/type Unknown security scheme type "magic"',
      'error /components/securitySchemes/c http security scheme needs scheme',
      'error /components/securitySchemes/d/type Unknown security scheme type "mutualTLS"',
    ])
  })

  it('warns on undeclared tags', () => {
    const doc = v30({ tags: [{ name: 'a' }, { name: 'a' }], paths: { '/x': { get: { ...ok, tags: ['a', 'b'] } } } })
    expect(messages(warnings(doc))).toEqual([
      'warning /tags/1/name Duplicate tag "a"',
      'warning /paths/~1x/get/tags/1 Tag "b" is not declared in the top-level tags',
    ])
  })

  it('checks server variables at every level', () => {
    const doc = v30({
      servers: [{ url: 'https://{env}.x.io/{v}', variables: { env: { default: 'prod' }, bad: {} } }, {}],
      paths: { '/a': { servers: [{ url: '{host}' }], get: { ...ok, servers: [{ url: 'https://ok.io' }] } } },
    })
    expect(messages(errors(doc))).toEqual([
      'error /servers/0/url Server variable "v" is not defined',
      'error /servers/0/variables/bad Server variable "bad" needs a string default',
      'error /servers/1 server.url is required',
      'error /paths/~1a/servers/0/url Server variable "host" is not defined',
    ])
  })

  it('validates callbacks and webhooks without template checks', () => {
    const doc = v31({
      webhooks: { hook: { post: { responses: { 200: {} } } } },
      paths: {
        '/a': {
          post: {
            ...ok,
            callbacks: { cb: { '{$request.body#/url}': { post: { responses: { abc: { description: 'x' } } } } } },
          },
        },
      },
    })
    expect(messages(errors(doc))).toEqual([
      'error /paths/~1a/post/callbacks/cb/{$request.body#~1url}/post/responses/abc Invalid status code "abc"',
      'error /webhooks/hook/post/responses/200 response.description is required',
    ])
  })
})

describe('validateDocument: positions', () => {
  it('uses the nearest ancestor position', () => {
    const positions: PositionMap = new Map([
      ['', { line: 1, column: 1 }],
      ['/info', { line: 2, column: 7 }],
      ['/paths', { line: 5, column: 8 }],
      ['/paths/~1a~1{id}', { line: 6, column: 3 }],
      ['/paths/~1a~1{id}/get', { line: 7, column: 5 }],
    ])
    const raw = {
      openapi: '3.0.0',
      info: { version: '1' },
      paths: { '/a/{id}': { get: { responses: { 200: {} } } } },
    }
    const issues = validateDocument(raw, { positions })
    expect(issues.map((i) => [i.message, i.line, i.column])).toEqual([
      ['info.title is required', 2, 7],
      ['response.description is required', 7, 5],
      ['Path parameter "id" of "/a/{id}" is not defined', 7, 5],
    ])
  })

  it('has no line without positions, and the root position for non-specs', () => {
    expect(validateDocument(v30({ foo: 1 }))[0]?.line).toBeUndefined()
    const issue = validateDocument({}, { positions: new Map([['', { line: 3, column: 2 }]]) })[0]
    expect(issue).toMatchObject({ line: 3, column: 2, severity: 'error' })
  })
})
