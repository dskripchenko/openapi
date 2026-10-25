import type { Schema } from '../core/types'
import { ref, resolve } from '../../tests/fixtures/schema/petstore'
import { samplePattern } from './pattern'
import { sample } from './sample'
import { validate } from './validate'
import { sampleXml } from './xml'

describe('sample: literal sources', () => {
  it('prefers example, then examples[0], default, const, enum[0]', () => {
    expect(sample({ type: 'string', example: 'a', examples: ['b'], default: 'c' })).toBe('a')
    expect(sample({ type: 'string', examples: ['b'], default: 'c' })).toBe('b')
    expect(sample({ type: 'string', default: 'c', enum: ['d'] })).toBe('c')
    expect(sample({ const: 5, enum: [1] })).toBe(5)
    expect(sample({ type: 'string', enum: ['x', 'y'] })).toBe('x')
  })

  it('skips examples when preferExamples is false', () => {
    expect(sample({ type: 'string', example: 'a', default: 'c' }, { preferExamples: false })).toBe('c')
    expect(sample({ type: 'integer', example: 7 }, { preferExamples: false })).toBe(0)
  })

  it('returns copies, not the spec objects', () => {
    const example = { a: [1] }
    const s: Schema = { type: 'object', example }
    const out = sample(s) as { a: number[] }
    out.a.push(2)
    expect(example.a).toEqual([1])
  })
})

describe('sample: scalars', () => {
  it('generates by type', () => {
    expect(sample({ type: 'string' })).toBe('string')
    expect(sample({ type: 'integer' })).toBe(0)
    expect(sample({ type: 'number' })).toBe(0)
    expect(sample({ type: 'boolean' })).toBe(true)
    expect(sample({ type: 'null' })).toBe(null)
  })

  it('handles type arrays and nullable', () => {
    expect(sample({ type: ['null', 'string'] })).toBe('string')
    expect(sample({ type: ['null'] })).toBe(null)
    expect(sample({ nullable: true })).toBe(null)
    expect(sample({ type: 'integer', nullable: true })).toBe(0)
  })

  it.each([
    ['date-time', '2024-01-01T12:00:00Z'],
    ['date', '2024-01-01'],
    ['time', '12:00:00Z'],
    ['duration', 'P1D'],
    ['email', 'user@example.com'],
    ['idn-email', 'user@example.com'],
    ['hostname', 'example.com'],
    ['idn-hostname', 'example.com'],
    ['ipv4', '192.168.0.1'],
    ['ipv6', '2001:db8::1'],
    ['uri', 'https://example.com'],
    ['uri-reference', '/path'],
    ['iri', 'https://example.com'],
    ['url', 'https://example.com'],
    ['uuid', '3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    ['byte', 'c3RyaW5n'],
    ['binary', 'string'],
    ['password', 'password'],
    ['regex', '^[a-z]+$'],
    ['json-pointer', '/path/to/value'],
  ])('format %s', (format, expected) => {
    expect(sample({ type: 'string', format })).toBe(expected)
    expect(validate(expected, { type: 'string', format })).toEqual([])
  })

  it('numeric formats keep the numeric type', () => {
    expect(sample({ type: 'integer', format: 'int64' })).toBe(0)
    expect(sample({ type: 'number', format: 'double' })).toBe(0)
    expect(sample({ format: 'int32' })).toBe(0)
  })

  it('respects string length limits', () => {
    expect(sample({ type: 'string', minLength: 10 })).toBe('stringstri')
    expect(sample({ type: 'string', maxLength: 3 })).toBe('str')
    expect(sample({ type: 'string', maxLength: 0 })).toBe('')
  })

  it('respects numeric bounds', () => {
    expect(sample({ type: 'integer', minimum: 5 })).toBe(5)
    expect(sample({ type: 'integer', exclusiveMinimum: 5 })).toBe(6)
    expect(sample({ type: 'integer', maximum: -3 })).toBe(-3)
    expect(sample({ type: 'integer', exclusiveMaximum: -3 })).toBe(-4)
    expect(sample({ type: 'number', exclusiveMinimum: 0, maximum: 0.5 })).toBe(0.25)
    expect(sample({ type: 'integer', minimum: 7, multipleOf: 5 })).toBe(10)
    expect(sample({ type: 'number', minimum: 0.33, multipleOf: 0.1 })).toBe(0.4)
    // 3.0 boolean style
    expect(sample({ type: 'integer', minimum: 5, exclusiveMinimum: true as unknown as number })).toBe(6)
  })
})

describe('sample: patterns', () => {
  it.each([
    '^[a-z]{3}$',
    '^\\d{4}-\\d{2}$',
    '^[A-Z][a-z]+$',
    '^(foo|bar)baz?$',
    '^\\w+@\\w+\\.com$',
    '^[^0-9]{2,4}$',
    '^#[0-9a-fA-F]{6}$',
    '^(?:ab)+c*$',
    '^\\+?[1-9]\\d{1,14}$',
    'abc',
    '^[a-z0-9._-]+$',
  ])('generates a match for %s', (pattern) => {
    const s = sample({ type: 'string', pattern }) as string
    expect(new RegExp(pattern, 'u').test(s)).toBe(true)
  })

  it('honors length limits with patterns', () => {
    const s = samplePattern('^a+$', 5, 10)
    expect(s).toBe('aaaaa')
    expect(sample({ type: 'string', pattern: '^[a-z]*$', minLength: 3 })).toBe('aaa')
  })

  it('falls back for unsupported constructs', () => {
    expect(samplePattern('^(a)\\1$')).toBeUndefined()
    expect(samplePattern('(?=x)x')).toBeUndefined()
    expect(sample({ type: 'string', pattern: '^(a)\\1$' })).toBe('string')
    expect(sample({ type: 'string', pattern: '[' })).toBe('string')
  })

  it('keeps a format value when it matches the pattern', () => {
    expect(sample({ type: 'string', format: 'date', pattern: '^\\d{4}' })).toBe('2024-01-01')
  })
})

describe('sample: arrays', () => {
  it('produces one item, or minItems items', () => {
    expect(sample({ type: 'array', items: { type: 'integer' } })).toEqual([0])
    expect(sample({ type: 'array', items: { type: 'integer' }, minItems: 3 })).toEqual([0, 0, 0])
    expect(sample({ type: 'array' })).toEqual([])
    expect(sample({ type: 'array', items: { type: 'string' }, maxItems: 0 })).toEqual([])
  })

  it('keeps uniqueItems arrays unique', () => {
    const s: Schema = { type: 'array', items: { type: 'string' }, minItems: 3, uniqueItems: true }
    expect(sample(s)).toEqual(['string', 'string1', 'string2'])
    const e: Schema = { type: 'array', items: { enum: ['a', 'b', 'c'] }, minItems: 2, uniqueItems: true }
    expect(sample(e)).toEqual(['a', 'b'])
  })

  it('uses prefixItems', () => {
    expect(sample({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }] })).toEqual(['string', 0])
    expect(sample({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'boolean' }, minItems: 2 })).toEqual([
      'string',
      true,
    ])
  })

  it('adds an item satisfying contains', () => {
    const s: Schema = { type: 'array', items: { type: 'integer' }, contains: { type: 'integer', minimum: 5 } }
    expect(sample(s)).toEqual([0, 5])
  })
})

describe('sample: objects', () => {
  it('includes all properties', () => {
    const s: Schema = { type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { type: 'integer' } } }
    expect(sample(s)).toEqual({ a: 'string', b: 0 })
  })

  it('infers object from properties', () => {
    expect(sample({ properties: { a: { type: 'boolean' } } })).toEqual({ a: true })
  })

  it('skips readOnly in requests and writeOnly in responses', () => {
    expect(sample(ref('User'), { resolve, mode: 'request' })).toEqual({ email: 'user@example.com', password: 'password' })
    expect(sample(ref('User'), { resolve, mode: 'response' })).toEqual({
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      email: 'user@example.com',
      createdAt: '2024-01-01T12:00:00Z',
    })
    expect(Object.keys(sample(ref('User'), { resolve }) as object)).toHaveLength(4)
  })

  it('samples additionalProperties only without properties', () => {
    expect(sample({ type: 'object', additionalProperties: { type: 'integer' } })).toEqual({ additionalProp1: 0 })
    expect(sample({ type: 'object', properties: { a: { type: 'integer' } }, additionalProperties: { type: 'string' } })).toEqual({ a: 0 })
  })

  it('fills minProperties', () => {
    expect(sample({ type: 'object', minProperties: 2, additionalProperties: { type: 'boolean' } })).toEqual({
      additionalProp1: true,
      additionalProp2: true,
    })
  })
})

describe('sample: composition', () => {
  it('merges allOf objects', () => {
    const s: Schema = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' }, nested: { type: 'object', properties: { x: { type: 'integer' } } } } },
        { type: 'object', properties: { b: { type: 'integer' }, nested: { type: 'object', properties: { y: { type: 'boolean' } } } } },
      ],
    }
    expect(sample(s)).toEqual({ a: 'string', nested: { x: 0, y: true }, b: 0 })
  })

  it('merges allOf scalars as schemas', () => {
    expect(sample({ allOf: [{ type: 'integer', minimum: 5 }, { maximum: 10 }] })).toBe(5)
    expect(sample({ allOf: [{ type: 'string' }, { minLength: 8 }] })).toBe('stringst')
  })

  it('takes the first oneOf/anyOf branch, skipping null', () => {
    expect(sample({ oneOf: [{ type: 'integer' }, { type: 'string' }] })).toBe(0)
    expect(sample({ anyOf: [{ type: 'null' }, { type: 'string' }] })).toBe('string')
  })

  it('combines own properties with the chosen branch', () => {
    const s: Schema = { type: 'object', properties: { id: { type: 'integer' } }, oneOf: [{ properties: { a: { type: 'string' } } }] }
    expect(sample(s)).toEqual({ id: 0, a: 'string' })
  })

  it('sets the discriminator from the mapping', () => {
    expect(sample(ref('Animal'), { resolve })).toEqual({ kind: 'cat', meows: true })
    const noMapping: Schema = { oneOf: [ref('Dog')], discriminator: { propertyName: 'kind' } }
    expect(sample(noMapping, { resolve })).toEqual({ kind: 'Dog', barks: 1 })
  })

  it('sets the discriminator for allOf children of a base schema', () => {
    expect(sample(ref('Circle'), { resolve })).toEqual({ shapeType: 'circle', radius: 1 })
    expect(sample(ref('Square'), { resolve })).toEqual({ shapeType: 'Square', side: 0 })
  })

  it('ignores not and if/then/else', () => {
    expect(sample({ type: 'integer', not: { const: 0 } })).toBe(0)
    expect(sample({ type: 'string', if: { minLength: 1 }, then: { maxLength: 2 } })).toBe('string')
  })
})

describe('sample: refs, cycles, depth', () => {
  it('resolves refs', () => {
    expect(sample(ref('Category'), { resolve })).toEqual({ id: 0, name: 'string' })
  })

  it('cuts cycles', () => {
    expect(sample(ref('Node'), { resolve })).toEqual({ value: 0, children: [] })
    expect(sample(ref('LoopA'), { resolve })).toBeUndefined()
  })

  it('handles unresolved refs', () => {
    expect(sample({ $ref: '#/nope' }, { resolve })).toEqual({})
    expect(sample({ $ref: '#/nope' })).toEqual({})
  })

  it('limits depth', () => {
    const deep: Schema = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'integer' } } } } } } }
    expect(sample(deep, { maxDepth: 2 })).toEqual({ a: {} })
    expect(sample(deep, { maxDepth: 1 })).toEqual({})
    expect(sample({ type: 'array', items: { type: 'array', items: { type: 'integer' } } }, { maxDepth: 1 })).toEqual([])
  })

  it('is deterministic', () => {
    for (const name of ['Pet', 'User', 'Node', 'Animal', 'Circle']) {
      expect(JSON.stringify(sample(ref(name), { resolve }))).toBe(JSON.stringify(sample(ref(name), { resolve })))
    }
  })
})

describe('sampleXml', () => {
  it('serializes the petstore Pet', () => {
    const xml = sampleXml(ref('Pet'), { resolve })
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<pet>',
        '  <id>10</id>',
        '  <name>doggie</name>',
        '  <category>',
        '    <id>0</id>',
        '    <name>string</name>',
        '  </category>',
        '  <photoUrls>',
        '    <photoUrl>string</photoUrl>',
        '  </photoUrls>',
        '  <tags>',
        '    <tag>',
        '      <id>0</id>',
        '      <name>string</name>',
        '    </tag>',
        '  </tags>',
        '  <status>available</status>',
        '</pet>',
      ].join('\n'),
    )
  })

  it('handles attributes, namespaces, prefixes and unwrapped arrays', () => {
    const s: Schema = {
      type: 'object',
      xml: { name: 'book', namespace: 'https://example.com/schema', prefix: 'bk' },
      properties: {
        id: { type: 'integer', xml: { attribute: true } },
        title: { type: 'string', example: 'A & B <c>' },
        author: { type: 'array', items: { type: 'string', example: 'Ann' } },
        lang: { type: 'string', example: 'en', xml: { attribute: true, name: 'xml:lang' } },
      },
    }
    expect(sampleXml(s)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<bk:book xmlns:bk="https://example.com/schema" id="0" xml:lang="en">',
        '  <title>A &amp; B &lt;c&gt;</title>',
        '  <author>Ann</author>',
        '</bk:book>',
      ].join('\n'),
    )
  })

  it('wraps a root array and names a scalar root', () => {
    expect(sampleXml({ type: 'array', items: { type: 'integer', xml: { name: 'n' } }, xml: { name: 'list' } })).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<list>\n  <n>0</n>\n</list>',
    )
    expect(sampleXml({ type: 'string' })).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<root>string</root>')
    expect(sampleXml(ref('Node'), { resolve })).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Node>\n  <value>0</value>\n</Node>',
    )
  })
})
