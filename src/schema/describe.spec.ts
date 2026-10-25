import { describe as label } from './describe'
import { ref, resolve } from '../../tests/fixtures/schema/petstore'

describe('describe', () => {
  it.each([
    [{ type: 'string', format: 'uuid' }, 'string<uuid>'],
    [{ type: 'integer', format: 'int64' }, 'integer<int64>'],
    [{ type: 'string' }, 'string'],
    [{ type: 'object' }, 'object'],
    [{ type: 'boolean' }, 'boolean'],
    [{ type: 'array', items: ref('Pet') }, 'array<Pet>'],
    [{ type: 'array', items: { type: 'array', items: { type: 'integer' } } }, 'array<array<integer>>'],
    [{ type: 'array' }, 'array'],
    [{ type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }] }, '[string, integer]'],
    [ref('Pet'), 'Pet'],
    [{ $ref: '#/components/schemas/a~1b' }, 'a/b'],
    [{ type: ['string', 'null'] }, 'string | null'],
    [{ type: 'string', nullable: true }, 'string | null'],
    [{ oneOf: [ref('Cat'), ref('Dog')] }, 'oneOf: Cat | Dog'],
    [{ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 'anyOf: string | integer'],
    [{ anyOf: [ref('Pet'), { type: 'null' }] }, 'Pet | null'],
    [{ allOf: [ref('Pet')] }, 'Pet'],
    [{ allOf: [ref('Shape'), { type: 'object', properties: {} }] }, 'Shape & object'],
    [{ type: 'string', enum: ['a'] }, 'string (enum)'],
    [{ enum: [1, 2] }, 'integer (enum)'],
    [{ const: 'x' }, 'string (const)'],
    [{ properties: { a: {} } }, 'object'],
    [{ format: 'date-time' }, 'string<date-time>'],
    [{}, 'any'],
  ])('%j → %s', (schema, expected) => {
    expect(label(schema, { resolve })).toBe(expected)
  })
})
