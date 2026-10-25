import type { Parameter, ParameterIn } from '../core/types'
import { serializeParam, type SerializedParam } from './serialize'

const STRING = 'blue'
const ARRAY = ['blue', 'black', 'brown']
const OBJECT = { R: 100, G: 200, B: 150 }

/** Renders a serialized param the way it lands in the request. */
function render(result: SerializedParam | undefined): string | undefined {
  if (!result) return undefined
  if ('value' in result) return result.value
  return result.pairs.map(([k, v]) => k + '=' + v).join(result.in === 'cookie' ? '; ' : '&')
}

function ser(
  location: ParameterIn,
  style: string | undefined,
  explode: boolean | undefined,
  value: unknown,
) {
  const param: Parameter = { name: 'color', in: location }
  if (style !== undefined) param.style = style
  if (explode !== undefined) param.explode = explode
  return render(serializeParam(param, value))
}

// [location, style, explode, empty, string, array, object]
const TABLE: [
  ParameterIn,
  string,
  boolean,
  string | null,
  string | null,
  string | null,
  string | null,
][] = [
  [
    'path',
    'matrix',
    false,
    ';color',
    ';color=blue',
    ';color=blue,black,brown',
    ';color=R,100,G,200,B,150',
  ],
  [
    'path',
    'matrix',
    true,
    ';color',
    ';color=blue',
    ';color=blue;color=black;color=brown',
    ';R=100;G=200;B=150',
  ],
  ['path', 'label', false, '.', '.blue', '.blue,black,brown', '.R,100,G,200,B,150'],
  ['path', 'label', true, '.', '.blue', '.blue.black.brown', '.R=100.G=200.B=150'],
  ['path', 'simple', false, '', 'blue', 'blue,black,brown', 'R,100,G,200,B,150'],
  ['path', 'simple', true, '', 'blue', 'blue,black,brown', 'R=100,G=200,B=150'],
  ['header', 'simple', false, '', 'blue', 'blue,black,brown', 'R,100,G,200,B,150'],
  ['header', 'simple', true, '', 'blue', 'blue,black,brown', 'R=100,G=200,B=150'],
  [
    'query',
    'form',
    false,
    'color=',
    'color=blue',
    'color=blue,black,brown',
    'color=R,100,G,200,B,150',
  ],
  [
    'query',
    'form',
    true,
    'color=',
    'color=blue',
    'color=blue&color=black&color=brown',
    'R=100&G=200&B=150',
  ],
  [
    'query',
    'spaceDelimited',
    false,
    null,
    null,
    'color=blue%20black%20brown',
    'color=R%20100%20G%20200%20B%20150',
  ],
  [
    'query',
    'pipeDelimited',
    false,
    null,
    null,
    'color=blue|black|brown',
    'color=R|100|G|200|B|150',
  ],
  ['query', 'deepObject', true, null, null, null, 'color[R]=100&color[G]=200&color[B]=150'],
  [
    'cookie',
    'form',
    false,
    'color=',
    'color=blue',
    'color=blue,black,brown',
    'color=R,100,G,200,B,150',
  ],
  [
    'cookie',
    'form',
    true,
    'color=',
    'color=blue',
    'color=blue; color=black; color=brown',
    'R=100; G=200; B=150',
  ],
]

describe('serializeParam: OpenAPI style table', () => {
  for (const [location, style, explode, empty, string, array, object] of TABLE) {
    describe(`${location} ${style} explode=${explode}`, () => {
      if (empty !== null) it('empty', () => expect(ser(location, style, explode, '')).toBe(empty))
      if (string !== null)
        it('string', () => expect(ser(location, style, explode, STRING)).toBe(string))
      if (array !== null)
        it('array', () => expect(ser(location, style, explode, ARRAY)).toBe(array))
      if (object !== null)
        it('object', () => expect(ser(location, style, explode, OBJECT)).toBe(object))
    })
  }
})

describe('serializeParam: defaults and edge cases', () => {
  it('uses form/explode for query and simple for path by default', () => {
    expect(ser('query', undefined, undefined, ARRAY)).toBe('color=blue&color=black&color=brown')
    expect(ser('query', undefined, undefined, OBJECT)).toBe('R=100&G=200&B=150')
    expect(ser('path', undefined, undefined, OBJECT)).toBe('R,100,G,200,B,150')
    expect(ser('header', undefined, undefined, ARRAY)).toBe('blue,black,brown')
    expect(ser('cookie', undefined, undefined, 'blue')).toBe('color=blue')
  })

  it('omits null, undefined, empty arrays and objects', () => {
    expect(ser('query', undefined, undefined, undefined)).toBeUndefined()
    expect(ser('query', undefined, undefined, null)).toBeUndefined()
    expect(ser('query', undefined, undefined, [])).toBeUndefined()
    expect(ser('query', undefined, undefined, {})).toBeUndefined()
  })

  it('stringifies numbers and booleans', () => {
    expect(ser('query', undefined, undefined, 5)).toBe('color=5')
    expect(ser('query', undefined, undefined, false)).toBe('color=false')
    expect(ser('path', undefined, undefined, [1, true])).toBe('1,true')
  })

  it('falls back to form for delimited styles with primitives or explode', () => {
    expect(ser('query', 'spaceDelimited', false, 'blue')).toBe('color=blue')
    expect(ser('query', 'pipeDelimited', true, ARRAY)).toBe('color=blue&color=black&color=brown')
  })

  it('nests deepObject', () => {
    expect(ser('query', 'deepObject', true, { a: { b: 1 }, c: [1, 2] })).toBe(
      'color[a][b]=1&color[c][0]=1&color[c][1]=2',
    )
  })
})

describe('serializeParam: percent-encoding', () => {
  it('encodes everything but unreserved in query values and names', () => {
    expect(ser('query', 'form', true, 'a b&c=d/é!*')).toBe('color=a%20b%26c%3Dd%2F%C3%A9%21%2A')
    expect(render(serializeParam({ name: 'a b', in: 'query' }, 'x'))).toBe('a%20b=x')
  })

  it('keeps delimiters literal but encodes them inside values', () => {
    expect(ser('query', 'form', false, ['a,b', 'c'])).toBe('color=a%2Cb,c')
    expect(ser('path', 'simple', false, ['a,b', 'c'])).toBe('a%2Cb,c')
  })

  it('keeps reserved characters with allowReserved (query only)', () => {
    const param: Parameter = { name: 'q', in: 'query', allowReserved: true }
    expect(render(serializeParam(param, 'a/b?c:d@e,f;g=h&i %41#'))).toBe(
      'q=a/b?c:d@e,f;g=h&i%20%41%23',
    )
    const path: Parameter = { name: 'id', in: 'path', allowReserved: true }
    expect(render(serializeParam(path, 'a/b'))).toBe('a%2Fb')
  })

  it('does not percent-encode headers', () => {
    expect(ser('header', 'simple', false, 'a b/é')).toBe('a b/é')
  })

  it('encodes only non-cookie-octets in cookies', () => {
    expect(ser('cookie', 'form', true, 'a@b;c d,é')).toBe('color=a@b%3Bc%20d%2C%C3%A9')
  })

  it('handles lone surrogates without throwing', () => {
    expect(ser('query', 'form', true, '\uD800')).toBe('color=%EF%BF%BD')
  })
})

describe('serializeParam: content', () => {
  it('JSON-encodes values of JSON content parameters', () => {
    const param: Parameter = { name: 'filter', in: 'query', content: { 'application/json': {} } }
    expect(render(serializeParam(param, { a: 1 }))).toBe('filter=%7B%22a%22%3A1%7D')
    const header: Parameter = {
      name: 'X-Filter',
      in: 'header',
      content: { 'application/json': {} },
    }
    expect(render(serializeParam(header, { a: [1] }))).toBe('{"a":[1]}')
    const path: Parameter = { name: 'id', in: 'path', content: { 'application/json': {} } }
    expect(render(serializeParam(path, 'x'))).toBe('%22x%22')
  })

  it('keeps strings for non-JSON content', () => {
    const param: Parameter = { name: 'c', in: 'cookie', content: { 'text/plain': {} } }
    expect(render(serializeParam(param, 'a b'))).toBe('c=a%20b')
  })
})
