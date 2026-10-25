/** Property-style check: every generated sample validates against its own schema. */
import type { Schema } from '../core/types'
import { ref, resolve } from '../../tests/fixtures/schema/petstore'
import { sample } from './sample'
import { validate } from './validate'

const corpus: [string, Schema][] = [
  ['petstore Pet', ref('Pet')],
  ['petstore Category', ref('Category')],
  ['pet list', { type: 'array', items: ref('Pet') }],
  ['User', ref('User')],
  ['recursive Node', ref('Node')],
  ['discriminated Animal', ref('Animal')],
  ['allOf Circle', ref('Circle')],
  ['allOf Square', ref('Square')],
  ['bounded integer', { type: 'integer', minimum: 10, maximum: 20, multipleOf: 3 }],
  ['exclusive number', { type: 'number', exclusiveMinimum: 1.5, exclusiveMaximum: 2 }],
  ['negative range', { type: 'integer', maximum: -10 }],
  ['3.0 exclusive', { type: 'number', minimum: 0, exclusiveMinimum: true } as unknown as Schema],
  ['long string', { type: 'string', minLength: 20, maxLength: 25 }],
  ['short string', { type: 'string', maxLength: 2 }],
  ['pattern', { type: 'string', pattern: '^[A-Z]{2}-\\d{3,5}$' }],
  ['pattern with length', { type: 'string', pattern: '^[a-z]+$', minLength: 4, maxLength: 6 }],
  ['date-time', { type: 'string', format: 'date-time' }],
  ['nullable string', { type: ['string', 'null'], format: 'email' }],
  ['3.0 nullable', { type: 'string', nullable: true, enum: ['a', 'b'] }],
  ['tuple', { type: 'array', prefixItems: [{ type: 'string', format: 'uuid' }, { type: 'integer' }], items: false as unknown as Schema }],
  ['unique tags', { type: 'array', items: { type: 'string', maxLength: 8 }, minItems: 3, maxItems: 5, uniqueItems: true }],
  ['contains', { type: 'array', items: { type: 'integer' }, contains: { const: 3 } }],
  ['map', { type: 'object', additionalProperties: { type: 'integer', minimum: 1 }, minProperties: 1 }],
  ['closed object', { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'boolean' }, b: { type: 'string', format: 'ipv6' } } }],
  ['pattern props', { type: 'object', properties: { id: { type: 'integer' } }, patternProperties: { '^x-': { type: 'string' } } }],
  ['dependentRequired', { type: 'object', properties: { card: { type: 'string' }, billing: { type: 'string' } }, dependentRequired: { card: ['billing'] } }],
  ['anyOf nullable ref', { anyOf: [ref('Category'), { type: 'null' }] }],
  ['oneOf scalars', { oneOf: [{ type: 'string', format: 'date' }, { type: 'integer' }] }],
  ['allOf scalars', { allOf: [{ type: 'integer', minimum: 5 }, { maximum: 7 }, { multipleOf: 2 }] }],
  ['allOf with own props', { type: 'object', required: ['id'], properties: { id: { type: 'integer' } }, allOf: [{ properties: { name: { type: 'string', minLength: 3 } } }] }],
  ['nested arrays', { type: 'array', items: { type: 'array', items: { type: 'number', multipleOf: 0.25, minimum: 0.3 } }, minItems: 2 }],
  ['const object', { const: { a: 1 } }],
  ['enum', { type: 'string', enum: ['red', 'green'] }],
  ['not', { type: 'integer', not: { const: 1 } }],
  ['if/then', { type: 'object', properties: { kind: { type: 'string' }, size: { type: 'integer' } }, if: { required: ['kind'] }, then: { required: ['size'] } }],
  [
    'order',
    {
      type: 'object',
      required: ['id', 'items'],
      properties: {
        id: { type: 'string', format: 'uuid', readOnly: true },
        items: { type: 'array', minItems: 1, items: { type: 'object', required: ['sku', 'qty'], properties: { sku: { type: 'string', pattern: '^SKU-[0-9]{6}$' }, qty: { type: 'integer', minimum: 1 } } } },
        note: { type: 'string', maxLength: 140, writeOnly: true },
        placedAt: { type: 'string', format: 'date-time', readOnly: true },
        total: { type: 'number', exclusiveMinimum: 0 },
      },
    },
  ],
]

describe('validate(sample(s), s) is empty', () => {
  it.each(corpus)('%s', (_name, schema) => {
    for (const mode of [undefined, 'request', 'response'] as const) {
      const value = sample(schema, { resolve, mode })
      expect(validate(value, schema, { resolve, mode }), JSON.stringify(value)).toEqual([])
      // Determinism: a second run gives the same sample.
      expect(sample(schema, { resolve, mode })).toEqual(value)
    }
  })
})
