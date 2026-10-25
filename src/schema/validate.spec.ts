import type { Schema } from '../core/types'
import { ref, resolve } from '../../tests/fixtures/schema/petstore'
import { validate } from './validate'

const keywords = (value: unknown, schema: Schema, opts = {}) => validate(value, schema, { resolve, ...opts }).map((i) => i.keyword)
const ok = (value: unknown, schema: Schema, opts = {}) => expect(validate(value, schema, { resolve, ...opts })).toEqual([])

describe('validate: type', () => {
  it.each([
    ['string', 'a', 1],
    ['integer', 1, 1.5],
    ['number', 1.5, '1'],
    ['boolean', false, 0],
    ['null', null, 0],
    ['array', [], {}],
    ['object', {}, []],
  ])('%s', (type, good, bad) => {
    ok(good, { type })
    expect(validate(bad, { type })).toEqual([{ path: '', message: `must be ${type}`, keyword: 'type' }])
  })

  it('type arrays and nullable', () => {
    ok(null, { type: ['string', 'null'] })
    expect(validate(1, { type: ['string', 'null'] })[0]!.message).toBe('must be string or null')
    ok(null, { type: 'string', nullable: true })
    ok(null, { type: 'string', enum: ['a'], nullable: true })
    expect(keywords(null, { type: 'string' })).toEqual(['type'])
    expect(keywords(NaN, { type: 'number' })).toEqual(['type'])
  })
})

describe('validate: enum/const', () => {
  it('uses deep equality', () => {
    ok({ a: [1] }, { enum: [{ a: [1] }, 2] })
    expect(validate('c', { enum: ['a', 'b'] })[0]!.message).toBe("must be one of: 'a', 'b'")
    ok([1, { x: 2 }], { const: [1, { x: 2 }] })
    expect(validate(3, { const: 2 })[0]!.message).toBe('must be equal to 2')
  })
})

describe('validate: numbers', () => {
  it('multipleOf with floats', () => {
    ok(0.3, { multipleOf: 0.1 })
    ok(10, { multipleOf: 5 })
    expect(keywords(7, { multipleOf: 5 })).toEqual(['multipleOf'])
  })

  it('bounds, 3.1 and 3.0 styles', () => {
    ok(5, { minimum: 5, maximum: 5 })
    expect(validate(4, { minimum: 5 })[0]!.message).toBe('must be >= 5')
    expect(validate(6, { maximum: 5 })[0]!.message).toBe('must be <= 5')
    expect(validate(5, { exclusiveMinimum: 5 })[0]).toEqual({ path: '', message: 'must be > 5', keyword: 'exclusiveMinimum' })
    expect(keywords(5, { exclusiveMaximum: 5 })).toEqual(['exclusiveMaximum'])
    const legacy = { minimum: 5, exclusiveMinimum: true, maximum: 9, exclusiveMaximum: true } as unknown as Schema
    expect(keywords(5, legacy)).toEqual(['exclusiveMinimum'])
    expect(keywords(9, legacy)).toEqual(['exclusiveMaximum'])
    ok(7, legacy)
    ok(5, { minimum: 5, exclusiveMinimum: false } as unknown as Schema)
  })

  it('ignores number keywords on other types', () => {
    ok('a', { minimum: 5 })
  })
})

describe('validate: strings', () => {
  it('counts code points', () => {
    ok('😀😀', { maxLength: 2 })
    expect(validate('😀', { minLength: 2 })[0]!.message).toBe('must be at least 2 characters')
    expect(validate('abc', { maxLength: 1 })[0]!.message).toBe('must be at most 1 character')
  })

  it('pattern with the unicode flag; invalid regex ignored', () => {
    ok('ё', { pattern: '^\\p{L}$' })
    expect(validate('1', { pattern: '^[a-z]$' })[0]!.message).toBe('must match pattern "^[a-z]$"')
    ok('anything', { pattern: '([' })
  })

  it.each([
    ['date-time', '2024-02-29T23:59:60.5+05:30', '2023-02-29T10:00:00Z'],
    ['date-time', '2024-01-01t00:00:00z', '2024-01-01T00:00:00'],
    ['date', '2024-12-31', '2024-13-01'],
    ['time', '08:30:00', '24:00:00'],
    ['email', 'a.b@example.co', 'a@b@c'],
    ['uuid', '3FA85F64-5717-4562-B3FC-2C963F66AFA6', '3fa85f64-5717-4562-b3fc'],
    ['ipv4', '255.255.255.255', '256.1.1.1'],
    ['ipv4', '10.0.0.1', '01.0.0.1'],
    ['ipv6', '::1', '1::2::3'],
    ['ipv6', '::ffff:192.168.0.1', '12345::'],
    ['ipv6', '1:2:3:4:5:6:7:8', '1:2:3:4:5:6:7'],
    ['uri', 'urn:isbn:0451450523', '/relative'],
    ['hostname', 'sub.example.com', '-bad.com'],
  ])('format %s: %s ok, %s not', (format, good, bad) => {
    ok(good, { type: 'string', format })
    expect(validate(bad, { type: 'string', format })).toEqual([{ path: '', message: `must be a valid ${format}`, keyword: 'format' }])
  })

  it('ignores unknown formats', () => {
    ok('whatever', { format: 'credit-card' })
    ok('x', { format: 'byte' })
  })
})

describe('validate: arrays', () => {
  it('items and prefixItems with paths', () => {
    const issues = validate([1, 'a', 2], { items: { type: 'integer' } })
    expect(issues).toEqual([{ path: '/1', message: 'must be integer', keyword: 'type' }])
    const tuple: Schema = { prefixItems: [{ type: 'string' }, { type: 'integer' }], items: { type: 'boolean' } }
    ok(['a', 1, true], tuple)
    expect(validate(['a', 1, 'x'], tuple)[0]!.path).toBe('/2')
  })

  it('size, uniqueness, contains', () => {
    expect(keywords([], { minItems: 1 })).toEqual(['minItems'])
    expect(keywords([1, 2], { maxItems: 1 })).toEqual(['maxItems'])
    expect(validate([{ a: 1 }, { a: 1 }], { uniqueItems: true })[0]!.message).toBe(
      'must not have duplicate items (items 0 and 1 are identical)',
    )
    ok([{ a: 1 }, { a: 2 }], { uniqueItems: true })
    expect(keywords([1, 2], { contains: { minimum: 5 } })).toEqual(['contains'])
    ok([1, 7], { contains: { minimum: 5 } })
  })
})

describe('validate: objects', () => {
  it('required, properties and nested paths', () => {
    const s: Schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } }
    expect(validate({}, s)).toEqual([{ path: '', message: "must have required property 'name'", keyword: 'required' }])
    expect(validate({ name: 'x', tags: ['a', 3] }, s)).toEqual([{ path: '/tags/1', message: 'must be string', keyword: 'type' }])
  })

  it('escapes JSON Pointer segments', () => {
    const issues = validate({ 'a/b~c': 1 }, { properties: { 'a/b~c': { type: 'string' } } })
    expect(issues[0]!.path).toBe('/a~1b~0c')
  })

  it('additionalProperties, patternProperties, propertyNames', () => {
    const s: Schema = {
      properties: { a: {} },
      patternProperties: { '^x-': { type: 'string' } },
      additionalProperties: false,
    }
    ok({ a: 1, 'x-y': 's' }, s)
    expect(validate({ a: 1, 'x-y': 1, b: 2 }, s)).toEqual([
      { path: '/x-y', message: 'must be string', keyword: 'type' },
      { path: '/b', message: "must not have additional property 'b'", keyword: 'additionalProperties' },
    ])
    expect(validate({ b: 'x' }, { additionalProperties: { type: 'integer' } })[0]!.path).toBe('/b')
    expect(validate({ AB: 1 }, { propertyNames: { pattern: '^[a-z]+$' } })[0]!.keyword).toBe('propertyNames')
  })

  it('min/maxProperties and dependentRequired', () => {
    expect(keywords({}, { minProperties: 1 })).toEqual(['minProperties'])
    expect(keywords({ a: 1, b: 2 }, { maxProperties: 1 })).toEqual(['maxProperties'])
    const dep: Schema = { dependentRequired: { card: ['billing'] } }
    ok({}, dep)
    expect(validate({ card: 1 }, dep)[0]!.message).toBe("must have property 'billing' when property 'card' is present")
  })

  it('readOnly in requests and writeOnly in responses', () => {
    const user = { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', email: 'a@example.com', password: 'secret123' }
    expect(validate(user, ref('User'), { resolve, mode: 'request' })).toEqual([
      { path: '/id', message: 'is read-only and must not be sent in a request', keyword: 'readOnly' },
    ])
    expect(validate(user, ref('User'), { resolve, mode: 'response' })).toEqual([
      { path: '/password', message: 'is write-only and must not appear in a response', keyword: 'writeOnly' },
    ])
    ok(user, ref('User'))
  })

  it('does not require readOnly properties in requests', () => {
    const s: Schema = { required: ['id', 'name'], properties: { id: { readOnly: true }, name: {} } }
    ok({ name: 'x' }, s, { mode: 'request' })
    expect(keywords({ name: 'x' }, s, { mode: 'response' })).toEqual(['required'])
  })
})

describe('validate: composition', () => {
  it('allOf collects every issue', () => {
    expect(keywords('a', { allOf: [{ minLength: 2 }, { pattern: '^b' }] })).toEqual(['minLength', 'pattern'])
  })

  it('anyOf', () => {
    ok(1, { anyOf: [{ type: 'string' }, { type: 'integer' }] })
    expect(validate(true, { anyOf: [{ type: 'string' }, { type: 'integer' }] })[0]!.message).toBe('must match a schema in anyOf')
  })

  it('oneOf requires exactly one', () => {
    const s: Schema = { oneOf: [{ type: 'integer' }, { minimum: 0 }] }
    ok(-1, s)
    expect(validate(1, s)[0]!.message).toBe('must match exactly one schema in oneOf (matches 2)')
    expect(validate(-1.5, s)[0]!.message).toBe('must match exactly one schema in oneOf')
  })

  it('not and if/then/else', () => {
    expect(keywords(1, { not: { type: 'integer' } })).toEqual(['not'])
    const s: Schema = { if: { properties: { kind: { const: 'a' } } }, then: { required: ['a'] }, else: { required: ['b'] } }
    expect(validate({ kind: 'a' }, s)[0]!.message).toBe("must have required property 'a'")
    expect(validate({ kind: 'z' }, s)[0]!.message).toBe("must have required property 'b'")
    ok({ kind: 'a', a: 1 }, s)
  })

  it('discriminator picks the branch and reports its issues', () => {
    ok({ kind: 'dog', barks: 3 }, ref('Animal'))
    expect(validate({ kind: 'dog', barks: 0 }, ref('Animal'), { resolve })).toEqual([
      { path: '/barks', message: 'must be >= 1', keyword: 'minimum' },
    ])
    expect(validate({ kind: 'cow' }, ref('Animal'), { resolve })).toEqual([
      { path: '/kind', message: "must be one of: 'cat', 'dog'", keyword: 'discriminator' },
    ])
    expect(validate({ meows: true }, ref('Animal'), { resolve })).toEqual([
      { path: '', message: "must have required property 'kind'", keyword: 'discriminator' },
    ])
  })

  it('discriminator without mapping uses schema names', () => {
    const s: Schema = { oneOf: [ref('Cat'), ref('Dog')], discriminator: { propertyName: 'kind' } }
    ok({ kind: 'Cat', meows: false }, s)
    expect(keywords({ kind: 'cat', meows: false }, s)).toEqual(['discriminator'])
  })

  it('base schema discriminator validates the mapped child', () => {
    ok({ shapeType: 'circle', radius: 2 }, ref('Shape'))
    expect(keywords({ shapeType: 'circle', radius: 0 }, ref('Shape'))).toEqual(['exclusiveMinimum'])
    ok({ shapeType: 'circle', radius: 2 }, ref('Circle'))
  })
})

describe('validate: refs', () => {
  it('follows refs and survives ref loops', () => {
    expect(keywords({ value: 'x' }, ref('Node'))).toEqual(['type'])
    ok({ value: 1, next: { value: 2, children: [{ value: 3 }] } }, ref('Node'))
    expect(validate({ value: 1, next: { value: 'a' } }, ref('Node'), { resolve })[0]!.path).toBe('/next/value')
    ok(1, ref('LoopA'))
  })

  it('ignores unresolvable refs', () => {
    ok(1, { $ref: '#/nope' })
  })

  it('applies sibling keywords next to $ref', () => {
    expect(keywords({ id: 1 }, { $ref: '#/components/schemas/Category', required: ['name'] })).toEqual(['required'])
  })
})
