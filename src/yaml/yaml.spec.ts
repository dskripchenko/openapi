import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseYaml, stringifyYaml, YamlError } from './index'

const value = (text: string): unknown => parseYaml(text).value

/** Asserts a YamlError at the given 1-based place. */
function expectError(text: string, line: number, column: number, message?: RegExp): void {
  let error: unknown
  try {
    parseYaml(text)
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(YamlError)
  const e = error as YamlError
  if (message) expect(e.message).toMatch(message)
  expect({ line: e.line, column: e.column }).toEqual({ line, column })
}

describe('parseYaml: block collections', () => {
  it('parses nested mappings by indentation', () => {
    expect(value('a: 1\nb:\n  c: x\n  d:\n    e: true\nf: end\n')).toEqual({
      a: 1,
      b: { c: 'x', d: { e: true } },
      f: 'end',
    })
  })

  it('parses sequences, indented and at the key indentation', () => {
    expect(value('a:\n  - 1\n  - 2\nb:\n- x\n- y\nc: z')).toEqual({
      a: [1, 2],
      b: ['x', 'y'],
      c: 'z',
    })
  })

  it('parses compact nested mappings and sequences in sequence items', () => {
    const text = [
      '- name: a',
      '  tags:',
      '  - x',
      '  - y',
      '- name: b',
      '  nested:',
      '    k: v',
      '- - 1',
      '  - 2',
      '-',
      '  late: map',
      '- ',
      '-   spaced: true',
      '    also: 1',
    ].join('\n')
    expect(value(text)).toEqual([
      { name: 'a', tags: ['x', 'y'] },
      { name: 'b', nested: { k: 'v' } },
      [1, 2],
      { late: 'map' },
      null,
      { spaced: true, also: 1 },
    ])
  })

  it('treats empty values as null', () => {
    expect(value('a:\nb: \nc:   # comment\nd:\n  - x')).toEqual({
      a: null,
      b: null,
      c: null,
      d: ['x'],
    })
  })

  it('parses a root scalar, an empty document and a root sequence', () => {
    expect(value('hello')).toBe('hello')
    expect(value('')).toBe(null)
    expect(value('# only a comment\n')).toBe(null)
    expect(value('- a\n- b\n')).toEqual(['a', 'b'])
  })

  it('accepts tabs as separation but not as indentation', () => {
    expect(value('a:\t1\nb:\t\t"x"')).toEqual({ a: 1, b: 'x' })
    expectError('a:\n\tb: 1', 2, 1, /tabs/)
  })

  it('supports explicit keys', () => {
    expect(value('? a\n: 1\n? b\nc: 2')).toEqual({ a: 1, b: null, c: 2 })
    expect(value('- ? x\n  : y')).toEqual([{ x: 'y' }])
    expectError('? [a, b]\n: 1', 1, 1, /complex/)
    expectError('- [a, b]: c', 1, 3, /flow collections as mapping keys/)
  })

  it('converts non-string keys with String()', () => {
    expect(value('200: ok\ntrue: t\n~: n\n1.50: f\n0x10: h')).toEqual({
      '200': 'ok',
      true: 't',
      null: 'n',
      '1.5': 'f',
      '16': 'h',
    })
  })

  it('keeps __proto__ as a plain own key', () => {
    const v = value('__proto__: {polluted: true}\nx: 1') as Record<string, unknown>
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype)
    expect(Object.keys(v)).toEqual(['__proto__', 'x'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('parseYaml: flow collections', () => {
  it('parses nested, multi-line flow collections', () => {
    expect(value('a: [1, [2, 3], {b: c, d: [e]}]\nf: {g: 1, h: }\n')).toEqual({
      a: [1, [2, 3], { b: 'c', d: ['e'] }],
      f: { g: 1, h: null },
    })
    const text = 'a: [\n  one,   # first\n  two\n    words,\n  {x: 1,\n   y: 2},\n]\n'
    expect(value(text)).toEqual({ a: ['one', 'two words', { x: 1, y: 2 }] })
  })

  it('handles JSON-like input, trailing commas, single pairs and keys without values', () => {
    expect(value('{"a":1, "b": [true, null, "x"],}')).toEqual({ a: 1, b: [true, null, 'x'] })
    expect(value('[a: 1, b]')).toEqual([{ a: 1 }, 'b'])
    expect(value('{a, b: 2}')).toEqual({ a: null, b: 2 })
    expect(value('{url: http://x.y/z?q=1, t: a:b}')).toEqual({ url: 'http://x.y/z?q=1', t: 'a:b' })
  })

  it('reports unterminated and malformed flow collections', () => {
    expectError('a: [1, 2', 1, 4, /unterminated flow sequence/)
    expectError('a: {x: 1', 1, 4, /unterminated flow mapping/)
    expectError('a: [1, 2 }', 1, 10, /','/)
    expect(value('a: [1 2]')).toEqual({ a: ['1 2'] })
    expectError('a: [1, , 2]', 1, 8, /','/)
  })
})

describe('parseYaml: scalars', () => {
  it('folds multi-line plain scalars', () => {
    expect(value('a: one\n  two\n\n  three\n   four\nb: x')).toEqual({
      a: 'one two\nthree four',
      b: 'x',
    })
    expect(value('- a\n  b # c\n- d')).toEqual(['a b', 'd'])
  })

  it('keeps # without preceding space and colons without following space', () => {
    expect(value('a: b#c\nd: http://e:8080/f\ng: x:y')).toEqual({
      a: 'b#c',
      d: 'http://e:8080/f',
      g: 'x:y',
    })
  })

  it('parses single-quoted scalars', () => {
    expect(value("a: 'it''s'\nb: ''\nc: 'x # y: z'\nd: 'one\n  two\n\n  three'")).toEqual({
      a: "it's",
      b: '',
      c: 'x # y: z',
      d: 'one two\nthree',
    })
  })

  it('parses double-quoted escapes and folding', () => {
    const v = value(
      [
        'a: "tab\\there\\nnl \\"q\\" \\\\ \\/ \\x41\\u00e9\\U0001F600 \\0\\a\\b\\v\\f\\r\\e\\N\\_\\L\\P"',
        'b: "folded   ',
        '   line\\',
        '   joined \\',
        '  ',
        '  end"',
        'c: "trailing\\t   \n  kept"',
      ].join('\n'),
    ) as Record<string, string>
    expect(v.a).toBe(
      'tab\there\nnl "q" \\ / A\u00e9\u{1F600} \0\x07\b\v\f\r\x1b\x85\xa0\u2028\u2029',
    )
    expect(v.b).toBe('folded linejoined \nend')
    expect(v.c).toBe('trailing\t kept')
  })

  it('rejects bad escapes and unterminated quotes', () => {
    expectError('a: "\\q"', 1, 5, /invalid escape/)
    expectError('a: "\\u12"', 1, 5, /invalid escape/)
    expectError('a: "abc', 1, 4, /unterminated/)
    expectError("a: 'abc\n", 1, 4, /unterminated/)
  })

  it('parses literal block scalars with chomping', () => {
    expect(value('a: |\n  one\n   two\n\n  three\n\n\nb: x')).toEqual({
      a: 'one\n two\n\nthree\n',
      b: 'x',
    })
    expect(value('a: |-\n  one\n\n')).toEqual({ a: 'one' })
    expect(value('a: |+\n  one\n\n\nb: 1')).toEqual({ a: 'one\n\n\n', b: 1 })
    expect(value('a: |\nb: 1')).toEqual({ a: '', b: 1 })
    expect(value('a: |+\n\n\nb: 1')).toEqual({ a: '\n\n', b: 1 })
    expect(value('a: | # comment\n  # not a comment\n')).toEqual({ a: '# not a comment\n' })
    // Only blank lines: the indentation is that of the longest one.
    expect(value('- |+\n  \n\n- x')).toEqual(['\n\n', 'x'])
    // Spaces beyond the indentation are text.
    expect(value('a: |-\n  x\n   \n  y')).toEqual({ a: 'x\n \ny' })
  })

  it('parses folded block scalars', () => {
    const text =
      'a: >\n  one\n  two\n\n  three\n    more\n    indented\n  back\n\n\nb: >-\n  x\n  y\n'
    expect(value(text)).toEqual({ a: 'one two\nthree\n  more\n  indented\nback\n', b: 'x y' })
  })

  it('honours an explicit indentation indicator', () => {
    expect(value('a: |2\n    lead\n  base\n')).toEqual({ a: '  lead\nbase\n' })
    expect(value('- |1-\n   x\n- y')).toEqual(['  x', 'y'])
    expect(value('a: >-2\n   lead\n  next')).toEqual({ a: ' lead\nnext' })
    // At the root the indicator counts from column 0, as libyaml does.
    expect(value('|1-\n\n 12-')).toBe('\n12-')
  })

  it('resolves the core schema', () => {
    expect(
      value(
        'n1: null\nn2: ~\nn3: NULL\nn4:\nb1: true\nb2: False\nb3: TRUE\nb4: yes\n' +
          'i1: 42\ni2: -7\ni3: 0x1F\ni4: 0o17\ni5: +3\ni6: 012\n' +
          'f1: 1.5\nf2: -.5\nf3: 1e3\nf4: .inf\nf5: -.Inf\nf6: 6.02E+23\n' +
          's1: 1.2.3\ns2: 0b101\ns3: 1_000\ns4: True!\ns5: nulls\ns6: 0x\ns7: .\n',
      ),
    ).toEqual({
      n1: null,
      n2: null,
      n3: null,
      n4: null,
      b1: true,
      b2: false,
      b3: true,
      b4: 'yes',
      i1: 42,
      i2: -7,
      i3: 31,
      i4: 15,
      i5: 3,
      i6: 12,
      f1: 1.5,
      f2: -0.5,
      f3: 1000,
      f4: Infinity,
      f5: -Infinity,
      f6: 6.02e23,
      s1: '1.2.3',
      s2: '0b101',
      s3: '1_000',
      s4: 'True!',
      s5: 'nulls',
      s6: '0x',
      s7: '.',
    })
    expect(Number.isNaN(value('.nan'))).toBe(true)
    expect(value('"true"')).toBe('true')
    expect(value("'1'")).toBe('1')
    expect(value('|\n  12\n')).toBe('12\n')
  })
})

describe('parseYaml: tags', () => {
  it('applies the core tags and ignores the rest', () => {
    expect(
      value(
        'a: !!str 123\nb: !!int "42"\nc: !!float 1\nd: !!bool "true"\ne: !!null ""\n' +
          'f: !custom 5\ng: !!str\nh: !<tag:yaml.org,2002:str> true\ni: ! 12\nj: !!map {x: 1}\nk: !!str null',
      ),
    ).toEqual({
      a: '123',
      b: 42,
      c: 1,
      d: true,
      e: null,
      f: 5,
      g: '',
      h: 'true',
      i: '12',
      j: { x: 1 },
      k: 'null',
    })
  })

  it('rejects a value its tag cannot convert', () => {
    expectError('a: !!int abc', 1, 4, /!!int/)
    expectError('a: !!bool yes', 1, 4, /!!bool/)
  })
})

describe('parseYaml: anchors, aliases, merge', () => {
  it('shares the anchored value', () => {
    const v = value('a: &x\n  k: 1\nb: *x\nc: &s str\nd: *s\ne: [&f 1, *f]') as Record<
      string,
      unknown
    >
    expect(v.b).toBe(v.a)
    expect(v).toEqual({ a: { k: 1 }, b: { k: 1 }, c: 'str', d: 'str', e: [1, 1] })
  })

  it('anchors on sequence items and compact mappings', () => {
    expect(value('- &item\n  name: x\n- *item')).toEqual([{ name: 'x' }, { name: 'x' }])
    expect(value('- &k key: v\n- *k')).toEqual([{ key: 'v' }, 'key'])
  })

  it('rejects an alias to an unknown anchor (and so recursion)', () => {
    expectError('a: *nope', 1, 4, /unknown anchor 'nope'/)
    expectError('a: &r [1, *r]', 1, 11, /unknown anchor/)
  })

  it('merges a map or a list of maps; explicit keys win', () => {
    const text = [
      'base: &b {x: 1, y: 2}',
      'more: &m {y: 20, z: 30}',
      'one:',
      '  <<: *b',
      '  y: 9',
      'two:',
      '  w: 0',
      '  <<: [*b, *m]',
      'three: {<<: *m, z: 3}',
      'four:',
      '  x: first',
      '  <<: *b',
    ].join('\n')
    const v = value(text) as Record<string, Record<string, unknown>>
    expect(v.one).toEqual({ x: 1, y: 9 })
    expect(v.two).toEqual({ w: 0, x: 1, y: 2, z: 30 })
    expect(v.three).toEqual({ y: 20, z: 3 })
    expect(v.four).toEqual({ x: 'first', y: 2 })
    expect(v.base).toEqual({ x: 1, y: 2 })
  })

  it('treats a quoted << as an ordinary key and rejects bad merge values', () => {
    expect(value("'<<': 1")).toEqual({ '<<': 1 })
    expectError('a:\n  <<: 5', 2, 3, /merge/)
  })
})

describe('parseYaml: documents and comments', () => {
  it('accepts --- and ... markers and directives', () => {
    expect(value('---\na: 1\n...\n')).toEqual({ a: 1 })
    expect(value('--- # doc\n- x\n')).toEqual(['x'])
    expect(value('%YAML 1.2\n---\nfoo')).toBe('foo')
    expect(value('--- |\n  text\n')).toBe('text\n')
    expect(value('a: "---"\nb: x---')).toEqual({ a: '---', b: 'x---' })
  })

  it('rejects a second document', () => {
    expectError('a: 1\n---\nb: 2', 2, 1, /multiple documents/)
    expectError('a: 1\n...\n---\nb: 2', 3, 1, /multiple documents/)
    expectError('a: 1\n...\nb: 2', 3, 1, /after the document/)
  })

  it('ignores comments everywhere they may stand', () => {
    const text =
      '# head\na: 1 # one\n  # indented comment\nb:   # empty\n  - x # item\n  # between\n  - y\n# tail'
    expect(value(text)).toEqual({ a: 1, b: ['x', 'y'] })
  })

  it('normalizes CRLF and a BOM', () => {
    const p = parseYaml('\ufeffa: 1\r\nb: |\r\n  x\r\n  y\r\n')
    expect(p.value).toEqual({ a: 1, b: 'x\ny\n' })
    expect(p.positions.get('/b')).toEqual({ line: 2, column: 1 })
  })
})

describe('parseYaml: errors', () => {
  it('reports duplicate keys at the second key', () => {
    expectError('a: 1\nb: 2\na: 3', 3, 1, /duplicate key 'a'/)
    expectError('x: {a: 1, a: 2}', 1, 11, /duplicate/)
  })

  it('reports bad indentation and stray content', () => {
    expectError('a:\n  b: 1\n   c: 2', 3, 5, /mapping values/)
    expectError('a:\n  b:\n    c: 1\n   d: 2', 4, 4, /indentation/)
    expectError('a: b: c', 1, 5, /mapping values/)
    expectError('a: "x" y', 1, 8, /unexpected content/)
    expectError('- a\nb: 1', 2, 1, /unexpected content/)
    expectError('a:\n  b: 1\n - c', 3, 2, /indentation/)
    expect(value('a: 1\n  - b')).toEqual({ a: '1 - b' })
    expectError('key without colon\nb: 1', 2, 2, /mapping values/)
    expectError('a: - b', 1, 4, /sequence/)
    expectError('a: @x', 1, 4, /unexpected character/)
  })

  it('reports invalid block scalar headers', () => {
    expectError('a: |x\n  t', 1, 5, /block scalar header/)
    expectError('a: |0\n  t', 1, 5, /block scalar header/)
  })
})

describe('parseYaml: positions', () => {
  it('maps pointers to keys for members and to content for items', () => {
    const text = [
      'openapi: 3.1.0', //   1
      'paths:', //           2
      '  /pets/{id}:', //    3
      '    get:', //         4
      '      tags: [a, b]', // 5
      '      params:', //    6
      '        - name: id', // 7
      '          in: path', // 8
      '        -   plain', // 9
      '        -', //        10
      '          deep: 1', // 11
      'a~b: {x: [1, 2]}', // 12
    ].join('\n')
    const { positions } = parseYaml(text)
    expect(positions.get('')).toEqual({ line: 1, column: 1 })
    expect(positions.get('/openapi')).toEqual({ line: 1, column: 1 })
    expect(positions.get('/paths')).toEqual({ line: 2, column: 1 })
    expect(positions.get('/paths/~1pets~1{id}')).toEqual({ line: 3, column: 3 })
    expect(positions.get('/paths/~1pets~1{id}/get/tags')).toEqual({ line: 5, column: 7 })
    expect(positions.get('/paths/~1pets~1{id}/get/tags/1')).toEqual({ line: 5, column: 17 })
    expect(positions.get('/paths/~1pets~1{id}/get/params/0')).toEqual({ line: 7, column: 11 })
    expect(positions.get('/paths/~1pets~1{id}/get/params/0/in')).toEqual({ line: 8, column: 11 })
    expect(positions.get('/paths/~1pets~1{id}/get/params/1')).toEqual({ line: 9, column: 13 })
    expect(positions.get('/paths/~1pets~1{id}/get/params/2')).toEqual({ line: 11, column: 11 })
    expect(positions.get('/a~0b')).toEqual({ line: 12, column: 1 })
    expect(positions.get('/a~0b/x')).toEqual({ line: 12, column: 7 })
    expect(positions.get('/a~0b/x/1')).toEqual({ line: 12, column: 14 })
  })

  it('points merged members at the << key and aliases at the alias', () => {
    const { positions } = parseYaml('b: &b {x: 1}\nc:\n  <<: *b\nd: *b')
    expect(positions.get('/c/x')).toEqual({ line: 3, column: 3 })
    expect(positions.get('/d')).toEqual({ line: 4, column: 1 })
    expect(positions.has('/c/<<')).toBe(false)
  })
})

describe('parseYaml: realistic spec', () => {
  it('parses a petstore-like OpenAPI 3.0 document', () => {
    const text = readFileSync(
      resolve(import.meta.dirname, '../../tests/fixtures/yaml/petstore.yaml'),
      'utf8',
    )
    const errorResponse = {
      description: 'unexpected error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    }
    const limitParam = {
      name: 'limit',
      in: 'query',
      description: 'How many items to return at one time (max 100)',
      required: false,
      schema: { type: 'integer', format: 'int32', maximum: 100, default: 20 },
    }
    const { value: doc, positions } = parseYaml(text)
    expect(doc).toEqual({
      openapi: '3.0.3',
      info: {
        title: 'Swagger Petstore',
        version: '1.0.0',
        description:
          'A sample API that uses a petstore as an example.\n\nSupports **markdown**:\n  - indented lines stay as they are\n',
        termsOfService: 'http://swagger.io/terms/',
        contact: { name: 'API Team', email: 'apiteam@example.com', url: 'http://swagger.io' },
        license: { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0.html' },
      },
      servers: [
        {
          url: 'https://petstore.example.com/v1',
          description: 'Production server, folded onto one line',
        },
        {
          url: 'http://localhost:{port}/v1',
          variables: { port: { default: '8080', enum: ['8080', '9090'] } },
        },
      ],
      tags: ['pets', 'store'],
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            operationId: 'listPets',
            tags: ['pets'],
            parameters: [limitParam],
            responses: {
              '200': {
                description: 'A paged array of pets',
                headers: {
                  'x-next': {
                    description: 'A link to the next page of responses',
                    schema: { type: 'string' },
                  },
                },
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Pets' } } },
              },
              default: errorResponse,
            },
          },
          post: {
            summary: 'Create a pet',
            operationId: 'createPets',
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
            responses: { '201': { description: 'Null response' }, default: errorResponse },
          },
        },
        '/pets/{petId}': {
          get: {
            summary: 'Info for a specific pet',
            parameters: [
              {
                name: 'petId',
                in: 'path',
                required: true,
                description: 'The id of the pet to retrieve',
                schema: { type: 'string' },
              },
              limitParam,
            ],
            responses: {
              '200': {
                description: 'Expected response to a valid request',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
              },
              default: errorResponse,
            },
          },
        },
      },
      components: {
        schemas: {
          Base: { type: 'object', required: ['id', 'name'] },
          Pet: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'integer', format: 'int64' },
              name: { type: 'string', example: 'Fido \u00e9' },
              tag: { type: 'string', nullable: true, pattern: '^[a-z]+$' },
              weight: { type: 'number', minimum: 0.5, exclusiveMaximum: 1000 },
              enabled: { type: 'boolean', default: true },
              empty: null,
            },
          },
          Pets: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/Pet' } },
          Error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'integer', format: 'int32' },
              message: { type: 'string' },
            },
          },
        },
      },
    })
    expect(positions.get('/paths/~1pets/get/responses/200')).toEqual({ line: 48, column: 9 })
    expect(positions.get('/paths/~1pets/get/parameters/0')).toEqual({ line: 38, column: 11 })
  })
})

/* ------------------------------ stringify ------------------------------ */

describe('stringifyYaml', () => {
  it('writes block style with preserved key order', () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      tags: ['a', 'b'],
      servers: [{ url: 'https://x', description: 'prod' }, { url: '/' }],
      matrix: [[1, 2], []],
      empty: {},
      none: [],
      n: null,
      t: true,
      num: 1.5,
    }
    expect(stringifyYaml(doc)).toBe(
      [
        'openapi: 3.1.0',
        'info:',
        '  title: API',
        "  version: '1.0'",
        'tags:',
        '  - a',
        '  - b',
        'servers:',
        '  - url: https://x',
        '    description: prod',
        '  - url: /',
        'matrix:',
        '  - - 1',
        '    - 2',
        '  - []',
        'empty: {}',
        'none: []',
        'n: null',
        't: true',
        'num: 1.5',
        '',
      ].join('\n'),
    )
  })

  it('quotes only when needed', () => {
    const cases: [string, string][] = [
      ['plain text', 'plain text'],
      ['', "''"],
      ['true', "'true'"],
      ['null', "'null'"],
      ['~', "'~'"],
      ['123', "'123'"],
      ['0x1F', "'0x1F'"],
      ['.inf', "'.inf'"],
      ['1.2.3', '1.2.3'],
      [' lead', "' lead'"],
      ['trail ', "'trail '"],
      ['a: b', "'a: b'"],
      ['a #b', "'a #b'"],
      ['a#b', 'a#b'],
      ['ends:', "'ends:'"],
      ['- x', "'- x'"],
      ['*ref', "'*ref'"],
      ['#/components/schemas/Pet', "'#/components/schemas/Pet'"],
      ["it's", "it's"],
      ["'q'", "'''q'''"],
      ['{x}', "'{x}'"],
      ['http://a:b/c', 'http://a:b/c'],
      ['...', "'...'"],
      ['bell\x07', '"bell\\a"'],
      ['nul\0', '"nul\\0"'],
      ['cr\r', '"cr\\r"'],
      ['sep\u2028', '"sep\\L"'],
      ['emoji \u{1F600}', 'emoji \u{1F600}'],
    ]
    for (const [input, out] of cases) expect(stringifyYaml({ k: input })).toBe(`k: ${out}\n`)
  })

  it('quotes keys only when needed', () => {
    expect(
      stringifyYaml({ '200': 1, '/pets': 2, '1.0': 3, '<<': 4, 'a: b': 5, '': 6, null: 7, '~': 8 }),
    ).toBe(
      "'200': 1\n/pets: 2\n'1.0': 3\n'<<': 4\n'a: b': 5\n'': 6\nnull: 7\n'~': 8\n".replace(
        "'200'",
        '200',
      ),
    )
  })

  it('writes multi-line strings as literal blocks with the right chomping', () => {
    expect(stringifyYaml({ a: 'x\ny' })).toBe('a: |-\n  x\n  y\n')
    expect(stringifyYaml({ a: 'x\ny\n' })).toBe('a: |\n  x\n  y\n')
    expect(stringifyYaml({ a: 'x\n\n' })).toBe('a: |+\n  x\n\n')
    expect(stringifyYaml({ a: '  lead\nx' })).toBe('a: |2-\n    lead\n  x\n')
    expect(stringifyYaml(['x\n\ny'])).toBe('- |-\n  x\n\n  y\n')
    expect(stringifyYaml('root\ntext')).toBe('|-\n  root\n  text\n')
    expect(stringifyYaml(' lead\nx')).toBe('|2-\n   lead\n  x\n')
    // Whitespace-only lines are read differently by different parsers: quote instead.
    expect(stringifyYaml({ a: 'x\n  \ny' })).toBe('a: "x\\n  \\ny"\n')
  })

  it('folds long single-line strings at lineWidth', () => {
    const long = 'word '.repeat(30).trim()
    const out = stringifyYaml({ d: long }, { lineWidth: 40 })
    expect(out.startsWith('d: >-\n')).toBe(true)
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(42)
    expect(parseYaml(out).value).toEqual({ d: long })
    expect(stringifyYaml({ d: long }, { lineWidth: 0 })).toBe(`d: ${long}\n`)
  })

  it('writes numbers and special floats', () => {
    expect(stringifyYaml([1, -2.5, 1e21, 5e-7, NaN, Infinity, -Infinity, -0])).toBe(
      '- 1\n- -2.5\n- 1e+21\n- 5e-7\n- .nan\n- .inf\n- -.inf\n- -0\n',
    )
  })

  it('honours the indent option and skips undefined', () => {
    expect(stringifyYaml({ a: { b: [1, { c: 2, u: undefined }] } }, { indent: 4 })).toBe(
      'a:\n    b:\n        - 1\n        - c: 2\n',
    )
    expect(stringifyYaml({})).toBe('{}\n')
    expect(stringifyYaml([])).toBe('[]\n')
    expect(stringifyYaml(null)).toBe('null\n')
  })

  it('throws on cycles', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => stringifyYaml(a)).toThrow(/cyclic/)
  })
})

/* ------------------------------ round trip ------------------------------ */

/** mulberry32: a small seeded PRNG so failures reproduce. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PIECES = [
  'a',
  'Z',
  'word',
  ' ',
  '  ',
  '\t',
  '\n',
  '\n\n',
  ':',
  ': ',
  ' #',
  '#',
  '-',
  '- ',
  '?',
  ',',
  '[',
  ']',
  '{',
  '}',
  '&',
  '*',
  '!',
  '|',
  '>',
  "'",
  '"',
  '\\',
  '%',
  '@',
  '`',
  '~',
  'null',
  'true',
  'False',
  '0x1F',
  '0o7',
  '1e3',
  '.inf',
  '.nan',
  '12',
  '-3.5',
  '---',
  '...',
  '<<',
  '\0',
  '\x07',
  '\x1b',
  '\r',
  '\x85',
  '\u2028',
  '\ufeff',
  '\u00e9',
  '\u{1F600}',
  '\ud800',
  'http://x:1/y',
  '/pets/{id}',
  '$ref',
  '\x7f',
]

function randomString(r: () => number): string {
  const n = Math.floor(r() * 6)
  let s = ''
  for (let i = 0; i < n; i++) s += PIECES[Math.floor(r() * PIECES.length)]
  return s
}

function randomValue(r: () => number, depth: number): unknown {
  const k = r()
  if (depth > 3 || k < 0.45) {
    const t = Math.floor(r() * 8)
    switch (t) {
      case 0:
        return null
      case 1:
        return r() < 0.5
      case 2:
        return Math.floor(r() * 2e6) - 1e6
      case 3:
        return (r() - 0.5) * 10 ** Math.floor(r() * 40 - 20)
      case 4:
        return [0, -0, 1e21, Number.MAX_SAFE_INTEGER, 5e-324][Math.floor(r() * 5)]
      default:
        return randomString(r)
    }
  }
  const len = Math.floor(r() * 5)
  if (k < 0.7) return Array.from({ length: len }, () => randomValue(r, depth + 1))
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < len; i++) obj[randomString(r)] = randomValue(r, depth + 1)
  return obj
}

describe('round trip', () => {
  it('parseYaml(stringifyYaml(x)) deep-equals x for random JSON values', () => {
    const r = rng(20261025)
    for (let i = 0; i < 3000; i++) {
      const v = randomValue(r, 0)
      const opts = { indent: 1 + Math.floor(r() * 4), lineWidth: r() < 0.5 ? 30 : 80 }
      const text = stringifyYaml(v, opts)
      let back: unknown
      try {
        back = parseYaml(text).value
      } catch (e) {
        throw new Error(`case ${i}: ${(e as Error).message}\n${JSON.stringify(v)}\n---\n${text}`, {
          cause: e,
        })
      }
      expect(back, `case ${i}:\n${text}`).toEqual(v)
    }
  })

  it('round-trips the petstore fixture', () => {
    const text = readFileSync(
      resolve(import.meta.dirname, '../../tests/fixtures/yaml/petstore.yaml'),
      'utf8',
    )
    const v = parseYaml(text).value
    expect(parseYaml(stringifyYaml(v)).value).toEqual(v)
  })
})

describe('performance', () => {
  it('parses a ~1 MB document well under a second', () => {
    const paths: Record<string, unknown> = {}
    for (let i = 0; paths && Object.keys(paths).length < 2000; i++) {
      paths[`/resource${i}/{id}`] = {
        get: {
          summary: `Get resource ${i}`,
          description: `Returns resource ${i}.\nSecond line with: colon\n`,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/R${i}` } } },
            },
            '404': { description: 'Not found', tags: ['a', 'b', 'c'] },
          },
        },
      }
    }
    const text = stringifyYaml({ openapi: '3.1.0', paths })
    expect(text.length).toBeGreaterThan(1_000_000)
    const t0 = performance.now()
    const { value: v, positions } = parseYaml(text)
    const ms = performance.now() - t0
    expect(Object.keys((v as { paths: object }).paths)).toHaveLength(2000)
    expect(positions.size).toBeGreaterThan(30_000)
    expect(ms).toBeLessThan(1500)
  })
})
