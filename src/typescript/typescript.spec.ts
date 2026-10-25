import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { fixtureJson, fixtureText } from '../../tests/fixtures/specs'
import { loadSpec } from '../load'
import { loadDocument, type LoadedSpec } from '../model'
import { createTsContext, documentTypes, operationTypes, schemaToTs, typeName } from './index'
import { quote } from './names'

/** A document with the awkward cases: cycles, tags without const, collisions, tuples, odd keys. */
const EDGE = {
  openapi: '3.1.0',
  info: { title: 'Edge cases', version: '0.1.0' },
  paths: {
    '/trees/{id}': {
      get: {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', format: 'int64' } },
          { name: 'session', in: 'cookie', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'The tree',
            headers: { 'X-Rate-Limit': { required: true, schema: { type: 'integer' } } },
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TreeNode' } },
              'text/plain': { schema: { type: 'string' } },
            },
          },
          '204': { description: 'Empty' },
        },
      },
    },
    '/pets': {
      post: {
        operationId: 'pets',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { '2XX': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pair' } } } } },
      },
    },
  },
  components: {
    schemas: {
      TreeNode: {
        type: 'object',
        description: 'A node of a tree.\nNodes nest.',
        required: ['value'],
        properties: {
          value: { type: 'string' },
          children: { type: 'array', items: { $ref: '#/components/schemas/TreeNode' } },
          parent: { anyOf: [{ $ref: '#/components/schemas/TreeNode' }, { type: 'null' }] },
        },
      },
      Pet: {
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: { propertyName: 'petType', mapping: { cat: '#/components/schemas/Cat' } },
      },
      Cat: { type: 'object', required: ['petType'], properties: { petType: { type: 'string' }, lives: { type: 'integer' } } },
      Dog: { type: 'object', required: ['petType'], properties: { petType: { type: 'string' }, 'good-boy': { type: 'boolean' } } },
      Pair: { type: 'array', prefixItems: [{ type: 'string' }, { type: ['number', 'null'] }], minItems: 1, items: false },
      Quotes: { enum: ["it's", 'say "hi"', 'back\\slash', 1, true, null] },
      Keywords: {
        type: 'object',
        properties: { class: { type: 'string' }, default: { type: 'string' }, 'content-type': { type: 'string' }, '0zero': { type: 'string' } },
      },
      order_item: { type: 'object', properties: { sku: { type: 'string' } } },
      OrderItem: { type: 'object', properties: { id: { type: 'string' } } },
      Blob: { type: 'string', format: 'binary' },
      PetsResponse: { type: 'string', description: 'A component that looks like an operation type.' },
      Labels: {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: { type: 'integer' },
        patternProperties: { '^x-': { type: 'string' } },
      },
      Combined: { allOf: [{ $ref: '#/components/schemas/Cat' }, { type: 'object', properties: { owner: { type: 'string' } } }] },
    },
  },
}

const kitchen = (): LoadedSpec => loadDocument(fixtureJson('kitchen-sink-31.json'))
const petstore = (): LoadedSpec => loadDocument(fixtureJson('petstore-31.json'))
const edge = (): LoadedSpec => loadDocument(structuredClone(EDGE))
const op = (spec: LoadedSpec, id: string) => spec.operations.find((o) => o.id === id)!

describe('typeName and literals', () => {
  it('PascalCases like laravel-api and keeps identifiers valid', () => {
    expect(typeName('createOrder')).toBe('CreateOrder')
    expect(typeName('user-list')).toBe('UserList')
    expect(typeName('order_item')).toBe('OrderItem')
    expect(typeName('get /pets/{petId}')).toBe('GetPetsPetId')
    expect(typeName('2fa.verify')).toBe('_2faVerify')
    expect(typeName('---')).toBe('')
  })
  it('quotes strings safely', () => {
    expect(quote(`it's "x"\\\n`)).toBe(`'it\\'s "x"\\\\\\n'`)
  })
})

describe('schemaToTs', () => {
  const t = (schema: unknown) => schemaToTs(schema)

  it('primitives, formats and the boolean schemas', () => {
    expect(t({ type: 'string' })).toBe('string')
    expect(t({ type: 'integer', format: 'int64' })).toBe('number')
    expect(t({ type: 'number' })).toBe('number')
    expect(t({ type: 'boolean' })).toBe('boolean')
    expect(t({ type: 'null' })).toBe('null')
    expect(t({ type: 'string', format: 'binary' })).toBe('Blob')
    expect(t({ type: 'string', contentMediaType: 'image/png' })).toBe('Blob')
    expect(t({ type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' })).toBe('string')
    expect(t({ format: 'uuid' })).toBe('string')
    expect(t({})).toBe('unknown')
    expect(t(true)).toBe('unknown')
    expect(t(false)).toBe('never')
  })

  it('enums, const, type arrays and nullable', () => {
    expect(t({ enum: ["it's", 'a"b', 1, -2.5, false, null] })).toBe(`'it\\'s' | 'a"b' | 1 | -2.5 | false | null`)
    expect(t({ const: 'order.paid' })).toBe(`'order.paid'`)
    expect(t({ type: ['string', 'null'] })).toBe('string | null')
    expect(t({ type: ['integer', 'number'] })).toBe('number')
    expect(t({ type: 'string', nullable: true })).toBe('string | null')
    expect(t({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('string | null')
  })

  it('arrays and tuples', () => {
    expect(t({ type: 'array', items: { type: 'string' } })).toBe('string[]')
    expect(t({ type: 'array', items: { type: ['string', 'null'] } })).toBe('(string | null)[]')
    expect(t({ type: 'array' })).toBe('unknown[]')
    expect(t({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] })).toBe('[string, number]')
    expect(t({ type: 'array', prefixItems: [{ type: 'string' }, { type: ['number', 'null'] }], minItems: 1, items: { type: 'boolean' } })).toBe(
      '[string, (number | null)?, ...boolean[]]',
    )
  })

  it('objects: optional, readonly, quoted keys, JSDoc', () => {
    expect(
      t({
        type: 'object',
        required: ['id', 'class'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true, description: 'The id */ here' },
          class: { type: 'string' },
          'x-rate': { type: 'integer', default: 10, examples: [5] },
          secret: { type: 'string', writeOnly: true, deprecated: true },
          nested: { type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: { b: { type: 'string' } } } } } },
        },
      }),
    ).toBe(
      [
        '{',
        '  /**',
        '   * The id *\\/ here',
        '   * @format uuid',
        '   */',
        '  readonly id: string',
        '  class: string',
        '  /**',
        '   * @default 10',
        '   * @example 5',
        '   */',
        "  'x-rate'?: number",
        '  /**',
        '   * @writeOnly sent in requests, never returned',
        '   * @deprecated',
        '   */',
        '  secret?: string',
        '  nested?: {',
        '    a?: {',
        '      b?: string',
        '    }[]',
        '  }',
        '}',
      ].join('\n'),
    )
  })

  it('maps: additionalProperties and patternProperties', () => {
    expect(t({ type: 'object' })).toBe('{\n  [key: string]: unknown\n}')
    expect(t({ type: 'object', additionalProperties: false })).toBe('{\n  [key: string]: never\n}')
    expect(t({ type: 'object', additionalProperties: { type: 'string' } })).toBe('{\n  [key: string]: string\n}')
    expect(t({ type: 'object', properties: { a: { type: 'number' } }, additionalProperties: true })).toBe('{\n  a?: number\n  [key: string]: unknown\n}')
    // A typed index next to properties would clash with them: an intersection keeps both.
    expect(t({ type: 'object', properties: { a: { type: 'number' } }, additionalProperties: { type: 'string' } })).toBe(
      '{\n  a?: number\n} & {\n  [key: string]: string\n}',
    )
    expect(t({ type: 'object', patternProperties: { '^x-': { type: 'string' } } })).toBe('{\n  /** Keys matching ^x- */\n  [key: string]: string\n}')
  })

  it('allOf: simple object parts merge, others intersect', () => {
    expect(
      t({ allOf: [{ type: 'object', required: ['a'], properties: { a: { type: 'string' } } }, { properties: { b: { type: 'number' } } }] }),
    ).toBe('{\n  a: string\n  b?: number\n}')
    expect(t({ allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: { b: { type: 'number' } } }] })).toBe(
      'Base & {\n  b?: number\n}',
    )
    expect(t({ allOf: [{ $ref: '#/components/schemas/A' }, { anyOf: [{ $ref: '#/components/schemas/B' }, { $ref: '#/components/schemas/C' }] }] })).toBe(
      'A & (B | C)',
    )
  })

  it('oneOf with a discriminator tags the branches that do not pin it', () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      components: {
        schemas: {
          Cat: { type: 'object', properties: { kind: { type: 'string' } } },
          Dog: { type: 'object', properties: { kind: { const: 'dog' } } },
        },
      },
    }
    const ctx = createTsContext(loadDocument(doc).document)
    const schema = {
      oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
      discriminator: { propertyName: 'kind', mapping: { 'the-cat': '#/components/schemas/Cat' } },
    }
    expect(schemaToTs(schema, ctx)).toBe(`(Cat & { kind: 'the-cat' }) | Dog`)
    expect([...ctx.used].sort()).toEqual(['#/components/schemas/Cat', '#/components/schemas/Dog'])
  })

  it('refs: component names, siblings, inlined non-component refs', () => {
    expect(t({ $ref: '#/components/schemas/order_item' })).toBe('OrderItem')
    expect(t({ $ref: '#/components/schemas/Pet', description: 'only a note' })).toBe('Pet')
    const ctx = createTsContext(edge().document)
    expect(schemaToTs({ $ref: '#/components/schemas/Cat/properties/lives' }, ctx)).toBe('number')
    expect(schemaToTs({ $ref: '#/components/schemas/missing' }, ctx)).toBe('unknown')
  })
})

describe('names', () => {
  it('components: unique PascalCase names, document order keeps the plain one, globals are avoided', () => {
    const ctx = createTsContext(edge().document)
    expect(ctx.nameOf('#/components/schemas/order_item')).toBe('OrderItem')
    expect(ctx.nameOf('#/components/schemas/OrderItem')).toBe('OrderItem2')
    expect(ctx.nameOf('#/components/schemas/Blob')).toBe('Blob2')
  })

  it('operations: operationId, else method and path; a stem never clashes with a component', () => {
    const spec = edge()
    expect(operationTypes(spec, op(spec, 'get-trees-id')).names.base).toBe('GetTreesId')
    // `PetsResponse` is a component, so `pets` cannot use the stem `Pets`.
    expect(operationTypes(spec, op(spec, 'pets')).names.base).toBe('Pets2')
  })
})

describe('operationTypes', () => {
  it('createOrder: headers, the body, the 2xx union, per-status types and the components they reach', () => {
    const spec = kitchen()
    const { names, code } = operationTypes(spec, op(spec, 'createOrder'))
    expect(names).toEqual({
      base: 'CreateOrder',
      headers: 'CreateOrderHeaders',
      requestBody: 'CreateOrderRequestBody',
      response: 'CreateOrderResponse',
      responses: { '201': 'CreateOrderResponse201', default: 'CreateOrderResponseDefault' },
      responseBodies: {},
      responseHeaders: { '201': 'CreateOrderResponse201Headers' },
      all: [
        'CreateOrderHeaders',
        'CreateOrderRequestBody',
        'CreateOrderResponse',
        'CreateOrderResponse201',
        'CreateOrderResponse201Headers',
        'CreateOrderResponseDefault',
      ],
    })
    expect(code).toContain('export type CreateOrderRequestBody = Order\n')
    expect(code).toContain('export interface Order {')
    // Components come after the operation's types, alphabetically.
    const order = ['CreateOrderHeaders', 'CreateOrderResponseDefault', 'interface Money', 'interface Order ', 'interface OrderItem', 'type OrderStatus', 'interface Problem']
    const at = order.map((s) => code.indexOf(s))
    expect(at.every((n, i) => n >= 0 && (i === 0 || n > at[i - 1]!))).toBe(true)
  })

  it('splits a body by media type when the types differ', () => {
    const spec = kitchen()
    const { names, code } = operationTypes(spec, op(spec, 'uploadImage'))
    expect(names.requestBodies).toEqual({
      'multipart/form-data': 'UploadImageRequestBodyFormData',
      'application/octet-stream': 'UploadImageRequestBodyBinary',
    })
    expect(code).toContain('export type UploadImageRequestBody = UploadImageRequestBodyFormData | UploadImageRequestBodyBinary')
    expect(code).toContain('  file: Blob\n')
    expect(code).toContain('export type UploadImageRequestBodyBinary = Blob')
  })

  it('a response with several bodies, headers and no 2xx body', () => {
    const spec = edge()
    const { names } = operationTypes(spec, op(spec, 'get-trees-id'))
    expect(names.responseBodies['200']).toEqual({ 'application/json': 'GetTreesIdResponse200Json', 'text/plain': 'GetTreesIdResponse200Text' })
    expect(names.responseHeaders['200']).toBe('GetTreesIdResponse200Headers')
    expect(names.cookies).toBe('GetTreesIdCookies')
    const del = operationTypes(kitchen(), op(kitchen(), 'deleteOrder')) // an entry of another load works too
    expect(del.code).toContain('export type DeleteOrderResponse = void')
    expect(operationTypes(spec, op(spec, 'pets'), { components: false }).code).not.toContain('interface Cat')
  })

  it('webhooks have types too', () => {
    const spec = kitchen()
    const hook = spec.operations.find((o) => o.webhook === 'orderPaid')!
    expect(operationTypes(spec, hook).code).toContain('export type OrderPaidWebhookRequestBody = OrderEvent')
  })

  it('matches the snapshots', async () => {
    const k = kitchen()
    await expect(operationTypes(k, op(k, 'createOrder')).code).toMatchFileSnapshot('__snapshots__/kitchen-createOrder.ts.txt')
    await expect(documentTypes(k)).toMatchFileSnapshot('__snapshots__/kitchen-sink.d.ts.txt')
    await expect(documentTypes(petstore())).toMatchFileSnapshot('__snapshots__/petstore.d.ts.txt')
    await expect(documentTypes(edge())).toMatchFileSnapshot('__snapshots__/edge.d.ts.txt')
  })
})

describe('the output compiles', () => {
  const specs: Record<string, () => LoadedSpec> = {
    kitchen,
    petstore,
    edge,
    'petstore-30': () => loadSpec(fixtureText('petstore-30.yaml')),
    swagger2: () => loadDocument(fixtureJson('petstore-swagger2.json')),
    oauth: () => loadDocument(fixtureJson('oauth-31.json')),
  }

  it('with strict and no diagnostics, the whole document and every operation alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-ts-'))
    try {
      const files: string[] = []
      for (const [name, load] of Object.entries(specs)) {
        const spec = load()
        const doc = join(dir, `${name}.d.ts`)
        writeFileSync(doc, documentTypes(spec))
        files.push(doc)
        for (const entry of spec.operations) {
          const file = join(dir, `${name}-${entry.id.replace(/[^\w-]/g, '_')}.ts`)
          writeFileSync(file, operationTypes(spec, entry).code)
          files.push(file)
        }
      }
      const program = ts.createProgram(files, {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
        types: [],
        isolatedModules: true,
      })
      const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => {
        const where = d.file ? `${d.file.fileName.slice(dir.length + 1)}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : ''
        return `${where} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
      })
      expect(diagnostics).toEqual([])
      expect(files.length).toBeGreaterThan(20)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
