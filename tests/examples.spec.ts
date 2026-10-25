import { ref } from 'vue'
import { loadSpec } from '../src'
import type { MediaType, RequestBody, Response } from '../src/core/types'
import type { ReferenceContext } from '../src/vue/context'
import {
  GENERATED_EXAMPLE,
  INLINE_EXAMPLE,
  defaultExample,
  exampleNames,
  exampleText,
  namedExamples,
  sampleBody,
} from '../src/vue/draft'
import { en } from '../src/vue/labels'
import { fixtureText } from './fixtures/specs'

const spec = loadSpec(fixtureText('kitchen-sink-31.json'))
// The helpers read only the spec and the strings.
const ctx = { spec: ref(spec), labels: ref(en) } as unknown as ReferenceContext
const op = (id: string) => spec.operations.find((e) => e.id === id)!
const deref = <T>(v: unknown) => spec.resolver.deref(v as never) as T

describe('named examples', () => {
  const payment = deref<RequestBody>(op('createPayment').operation.requestBody).content['application/json']!
  const page = deref<Response>(op('listOrders').operation.responses!['200']).content!['application/json']!

  it('lists the examples with their summaries, refs followed', () => {
    expect(namedExamples(page, ctx).map((e) => [e.name, e.label])).toEqual([
      ['page', 'A page with one order'],
      ['empty', 'No orders yet'],
      ['archive', 'Archived orders'],
    ])
    const empty = namedExamples(page, ctx)[1]!
    expect(empty.description).toContain('**no**')
    expect(namedExamples(page, ctx)[2]!.externalValue).toBe('https://example.com/examples/orders-archive.json')
  })

  it('puts the generated sample first when there is a schema', () => {
    expect(exampleNames(payment, ctx)).toEqual([GENERATED_EXAMPLE, 'card', 'bank', 'wallet'])
    expect(namedExamples(payment, ctx, true)[0]!.label).toBe(en.generatedSample)
    expect(exampleNames({}, ctx)).toEqual([])
  })

  it('gives the text of an example by name', () => {
    expect(JSON.parse(exampleText(payment, 'bank', ctx, 'application/json')).iban).toBe('DE89370400440532013000')
    expect(JSON.parse(exampleText(page, 'empty', ctx, 'application/json', 'response'))).toEqual({ data: [], next: null })
    expect(exampleText(payment, 'wallet', ctx, 'application/json')).toBe('')
    expect(exampleText(payment, 'missing', ctx, 'application/json')).toBe('')
    expect(JSON.parse(exampleText(payment, GENERATED_EXAMPLE, ctx, 'application/json')).kind).toBe('card')
  })

  it('keeps the single example and names it', () => {
    const media: MediaType = { example: { a: 1 }, examples: { b: { value: { b: 2 } } } }
    expect(exampleNames(media, ctx)).toEqual([INLINE_EXAMPLE, 'b'])
    expect(exampleText(media, INLINE_EXAMPLE, ctx, 'application/json')).toBe('{\n  "a": 1\n}')
    expect(exampleText({ example: 'plain' }, INLINE_EXAMPLE, ctx, 'text/plain')).toBe('plain')
  })

  it('defaults to the first example with a value, else the generated sample', () => {
    expect(defaultExample(payment, ctx)).toBe('card')
    expect(defaultExample({ examples: { ext: { externalValue: 'x.json' } }, schema: { type: 'string' } }, ctx)).toBe(GENERATED_EXAMPLE)
    expect(JSON.parse(sampleBody(payment, ctx, 'application/json')).number).toBe('4242424242424242')
    expect(sampleBody({ schema: { type: 'integer' } }, ctx, 'application/json')).toBe('0')
    expect(sampleBody(undefined, ctx, 'application/json')).toBe('')
  })

  it('reads the named examples of a parameter', () => {
    const trace = op('paramStyles').parameters.find((p) => p.name === 'X-Trace')!
    expect(namedExamples(trace, ctx).map((e) => [e.label, e.value])).toEqual([
      ['Short id', 'abc'],
      ['long', 'abcdef0123456789'],
    ])
  })
})
