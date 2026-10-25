import type { Schema } from '../core/types'
import {
  fieldSpec,
  fromLocalDateTime,
  itemsToText,
  localDateTimeFits,
  plainText,
  textToItems,
  toLocalDateTime,
  typeLabel,
  valueText,
} from './fields'
import { maskSecret, previewHeaders, secretHeaderNames } from './preview'
import {
  bodyFormSchema,
  formNode,
  formProperties,
  freeKey,
  isJsonMediaType,
  matchVariant,
  renameKey,
  withKey,
} from './schemaForm'

const schemas: Record<string, Schema> = {
  Status: { type: 'string', enum: ['new', 'paid'] },
  Money: { type: 'object', required: ['amount'], properties: { amount: { type: 'string' }, currency: { type: 'string', default: 'EUR' } } },
  Card: { type: 'object', required: ['kind'], properties: { kind: { const: 'card' }, number: { type: 'string' } } },
  Bank: { type: 'object', required: ['kind'], properties: { kind: { const: 'bank' }, iban: { type: 'string' } } },
}
const resolve = (ref: string) => schemas[ref.split('/').pop()!]

describe('try-it fields', () => {
  it('picks the input by schema', () => {
    expect(fieldSpec({ $ref: '#/components/schemas/Status' }, resolve)).toMatchObject({
      kind: 'enum',
      options: [
        { value: 'new', label: 'new' },
        { value: 'paid', label: 'paid' },
      ],
    })
    expect(fieldSpec({ type: 'boolean' }).kind).toBe('boolean')
    expect(fieldSpec({ type: 'integer', minimum: 1, exclusiveMaximum: 100 })).toMatchObject({ kind: 'integer', min: 1, max: 99, step: 1 })
    expect(fieldSpec({ type: 'number', multipleOf: 0.5 })).toMatchObject({ kind: 'number', step: 0.5 })
    expect(fieldSpec({ type: 'array', items: { type: 'integer' } })).toMatchObject({ kind: 'array', itemType: 'integer' })
    expect(fieldSpec({ type: 'array', items: { $ref: '#/components/schemas/Status' } }, resolve).options).toHaveLength(2)
    expect(fieldSpec({ type: 'array', items: { type: 'object' } }).kind).toBe('json')
    expect(fieldSpec({ type: 'object' }).kind).toBe('json')
    expect(fieldSpec(undefined).kind).toBe('json')
    expect(fieldSpec({ type: 'string', format: 'date' }).kind).toBe('date')
    expect(fieldSpec({ type: 'string', format: 'date-time' }).kind).toBe('datetime')
    expect(fieldSpec({ type: ['string', 'null'] })).toMatchObject({ kind: 'string', nullable: true })
    expect(fieldSpec({ type: 'string', default: 'x' }).placeholder).toBe('x')
  })

  it('labels types', () => {
    expect(typeLabel(fieldSpec({ type: 'string', format: 'uuid' }))).toBe('string · uuid')
    expect(typeLabel(fieldSpec({ type: 'array', items: { type: 'integer' } }))).toBe('integer[]')
  })

  it('maps array text to items and back', () => {
    expect(textToItems('')).toEqual([])
    expect(textToItems('a, b,,c')).toEqual(['a', 'b', 'c'])
    expect(textToItems('[1,"x",true]')).toEqual(['1', 'x', 'true'])
    expect(itemsToText([], 'integer')).toBe('')
    expect(itemsToText(['1', '2'], 'integer')).toBe('[1,2]')
    expect(itemsToText(['a', 'b'], 'string')).toBe('["a","b"]')
    expect(valueText(undefined)).toBe('')
    expect(valueText(3)).toBe('3')
    expect(valueText({ a: 1 })).toBe('{"a":1}')
  })

  it('converts date-times to the local input and back', () => {
    const local = toLocalDateTime('2024-03-05T10:20:30Z')
    expect(local).toMatch(/^2024-03-0\dT\d\d:20:30$/)
    expect(fromLocalDateTime(local)).toBe('2024-03-05T10:20:30Z')
    expect(fromLocalDateTime('')).toBe('')
    expect(localDateTimeFits('')).toBe(true)
    expect(localDateTimeFits('not a date')).toBe(false)
  })

  it('flattens markdown to plain text', () => {
    expect(plainText('**Bold** and `code`, see [docs](https://x.y).\n\n- item')).toBe('Bold and code, see docs. item')
    expect(plainText(undefined)).toBe('')
  })
})

describe('schema form model', () => {
  it('resolves refs, drops read-only properties and keeps order', () => {
    const node = formNode({ allOf: [{ $ref: '#/components/schemas/Money' }, { properties: { id: { type: 'string', readOnly: true } } }] }, resolve)
    expect(node.kind).toBe('object')
    expect(formProperties(node.schema, resolve)).toEqual([
      { name: 'amount', schema: { type: 'string' }, required: true },
      { name: 'currency', schema: { type: 'string', default: 'EUR' }, required: false },
    ])
  })

  it('tells maps, arrays, scalars and free values apart', () => {
    expect(formNode({ type: 'object', additionalProperties: { type: 'string' } }).kind).toBe('map')
    expect(formNode({ type: 'array', items: {} }).kind).toBe('array')
    expect(formNode({ type: 'integer' }).kind).toBe('scalar')
    expect(formNode({}).kind).toBe('any')
  })

  it('turns oneOf into variants; a null branch only makes it nullable', () => {
    const node = formNode(
      {
        oneOf: [{ $ref: '#/components/schemas/Card' }, { $ref: '#/components/schemas/Bank' }],
        discriminator: { propertyName: 'kind', mapping: { card: '#/components/schemas/Card', bank: '#/components/schemas/Bank' } },
      },
      resolve,
    )
    expect(node.variants?.map((v) => v.label)).toEqual(['card', 'bank'])
    expect(matchVariant({ kind: 'bank', iban: 'x' }, node, resolve)).toBe(1)
    expect(matchVariant(undefined, node, resolve)).toBe(-1)
    const plain = formNode({ anyOf: [{ $ref: '#/components/schemas/Card' }, { $ref: '#/components/schemas/Bank' }] }, resolve)
    expect(matchVariant({ iban: 'x' }, plain, resolve)).toBe(1)
    expect(formNode({ anyOf: [{ $ref: '#/components/schemas/Money' }, { type: 'null' }] }, resolve)).toMatchObject({ kind: 'object' })
  })

  it('edits object values immutably', () => {
    const v = { a: 1, b: 2 }
    expect(withKey(v, 'c', 3)).toEqual({ a: 1, b: 2, c: 3 })
    expect(withKey(v, 'a', undefined)).toEqual({ b: 2 })
    expect(Object.keys(renameKey(v, 'a', 'z'))).toEqual(['z', 'b'])
    expect(renameKey(v, 'a', 'b')).toBe(v)
    expect(freeKey({ key: 1, key2: 1 })).toBe('key3')
    expect(v).toEqual({ a: 1, b: 2 })
  })

  it('edits JSON object bodies as a form', () => {
    expect(isJsonMediaType('application/json; charset=utf-8')).toBe(true)
    expect(isJsonMediaType('application/merge-patch+json')).toBe(true)
    expect(isJsonMediaType('application/xml')).toBe(false)
    const money = { schema: { $ref: '#/components/schemas/Money' } }
    expect(bodyFormSchema('application/json', money, resolve)).toBe(money.schema)
    expect(bodyFormSchema('application/xml', money, resolve)).toBeUndefined()
    expect(bodyFormSchema('application/json', { schema: { type: 'string' } }, resolve)).toBeUndefined()
  })
})

describe('request preview', () => {
  it('masks credentials', () => {
    expect(maskSecret('Bearer tok-1234567890-abcd')).toBe('Bearer ••••abcd')
    expect(maskSecret('Basic dTpw')).toBe('Basic ••••')
    expect(maskSecret('raw-api-key-value')).toBe('••••alue')
    const secrets = secretHeaderNames([{ type: 'apiKey', in: 'header', name: 'X-API-Key' }, undefined])
    expect(
      previewHeaders(
        { method: 'POST', url: '/', headers: [['Authorization', 'Bearer abcdefghijkl'], ['x-api-key', 'secret-key-1234'], ['Accept', 'a']], body: { mediaType: 'multipart/form-data', form: [] } },
        secrets,
      ),
    ).toEqual([
      ['Authorization', 'Bearer ••••ijkl'],
      ['x-api-key', '••••1234'],
      ['Accept', 'a'],
      ['Content-Type', 'multipart/form-data; boundary=…'],
    ])
  })
})
