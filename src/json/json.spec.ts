import { detectFormat, JsonError, parseJson, stringifyJson } from './index'

function expectError(text: string, line: number, column: number, message?: RegExp): void {
  let error: unknown
  try {
    parseJson(text)
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(JsonError)
  const e = error as JsonError
  if (message) expect(e.message).toMatch(message)
  expect({ line: e.line, column: e.column }).toEqual({ line, column })
}

describe('parseJson', () => {
  it('parses every JSON type like JSON.parse', () => {
    const text =
      '{"a": [1, -2.5e-3, 0, 1E2, true, false, null], "b": {"c": "d\\n\\u00e9\\"\\\\\\/\\b\\f\\r\\t"}, "e": ""}'
    expect(parseJson(text).value).toEqual(JSON.parse(text))
    expect(parseJson(' 42 ').value).toBe(42)
    expect(parseJson('"x"').value).toBe('x')
    expect(parseJson('[]').value).toEqual([])
    expect(parseJson('{}').value).toEqual({})
    expect(parseJson('"\\ud83d\\ude00"').value).toBe('\u{1F600}')
  })

  it('tolerates a BOM and CRLF', () => {
    const p = parseJson('﻿{\r\n  "a": 1\r\n}')
    expect(p.value).toEqual({ a: 1 })
    expect(p.positions.get('/a')).toEqual({ line: 2, column: 3 })
  })

  it('keeps __proto__ as a plain own key', () => {
    const v = parseJson('{"__proto__": {"polluted": true}}').value as Record<string, unknown>
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype)
    expect(Object.keys(v)).toEqual(['__proto__'])
  })

  it('records pointers: keys for members, values for items', () => {
    const text = [
      '{',
      '  "paths": {',
      '    "/pets/{id}": {',
      '      "tags": ["a",',
      '        "b"]',
      '    }',
      '  },',
      '  "a~b": 1',
      '}',
    ].join('\n')
    const { positions } = parseJson(text)
    expect(positions.get('')).toEqual({ line: 1, column: 1 })
    expect(positions.get('/paths')).toEqual({ line: 2, column: 3 })
    expect(positions.get('/paths/~1pets~1{id}')).toEqual({ line: 3, column: 5 })
    expect(positions.get('/paths/~1pets~1{id}/tags')).toEqual({ line: 4, column: 7 })
    expect(positions.get('/paths/~1pets~1{id}/tags/0')).toEqual({ line: 4, column: 16 })
    expect(positions.get('/paths/~1pets~1{id}/tags/1')).toEqual({ line: 5, column: 9 })
    expect(positions.get('/a~0b')).toEqual({ line: 8, column: 3 })
  })

  it('rejects what RFC 8259 rejects, with positions', () => {
    expectError('', 1, 1, /end of input/)
    expectError('{"a": 1,}', 1, 9, /string key/)
    expectError('[1, 2,]', 1, 7, /unexpected character/)
    expectError('{"a" 1}', 1, 6, /':'/)
    expectError('{\n  "a": 01\n}', 2, 8, /invalid number/)
    expectError('[1.]', 1, 2, /invalid number/)
    expectError('[-]', 1, 2, /invalid number/)
    expectError('[.5]', 1, 2, /unexpected character/)
    expectError("{'a': 1}", 1, 2, /string key/)
    expectError('{"a": tru}', 1, 7, /'true'/)
    expectError('"a\tb"', 1, 3, /control character/)
    expectError('"abc', 1, 1, /unterminated string/)
    expectError('"\\x41"', 1, 2, /invalid escape/)
    expectError('"\\u12g4"', 1, 2, /\\u escape/)
    expectError('{"a": 1} x', 1, 10, /after the JSON value/)
    expectError('// c\n{}', 1, 1, /unexpected character/)
    expectError('{\n  "a": [1,\n  2', 2, 8, /unterminated array/)
    expectError('{\n  "a": 1', 1, 1, /unterminated object/)
    expectError('[1 2]', 1, 4, /','/)
  })

  it('rejects duplicate keys at the second key', () => {
    expectError('{"a": 1,\n "a": 2}', 2, 2, /duplicate key 'a'/)
  })

  it('matches JSON.parse on random documents', () => {
    let seed = 12345
    const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const gen = (d: number): unknown => {
      const k = r()
      if (d > 3 || k < 0.4) {
        const t = Math.floor(r() * 5)
        if (t === 0) return null
        if (t === 1) return r() < 0.5
        if (t === 2) return (r() - 0.5) * 10 ** Math.floor(r() * 30 - 15)
        return String.fromCharCode(
          ...Array.from({ length: Math.floor(r() * 8) }, () => Math.floor(r() * 0x2fff)),
        )
      }
      if (k < 0.7) return Array.from({ length: Math.floor(r() * 4) }, () => gen(d + 1))
      const o: Record<string, unknown> = {}
      for (let i = 0; i < r() * 4; i++) o[`k${Math.floor(r() * 1000)}\n"`] = gen(d + 1)
      return o
    }
    for (let i = 0; i < 500; i++) {
      const text = JSON.stringify(gen(0), null, i % 3)
      expect(parseJson(text).value).toEqual(JSON.parse(text))
    }
  })

  it('parses ~1 MB quickly', () => {
    const items = Array.from({ length: 6000 }, (_, i) => ({
      id: i,
      name: `item ${i}`,
      tags: ['a', 'b'],
      nested: { ok: true, ratio: i / 7, note: 'x'.repeat(40) },
    }))
    const text = JSON.stringify({ items }, null, 2)
    expect(text.length).toBeGreaterThan(1_000_000)
    const t0 = performance.now()
    const { value, positions } = parseJson(text)
    const ms = performance.now() - t0
    expect(value).toEqual({ items })
    expect(positions.get('/items/5999/nested/note')).toBeDefined()
    expect(ms).toBeLessThan(1000)
  })
})

describe('stringifyJson', () => {
  it('indents and never returns undefined', () => {
    expect(stringifyJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}')
    expect(stringifyJson({ a: 1 }, 0)).toBe('{"a":1}')
    expect(stringifyJson(undefined)).toBe('null')
  })
})

describe('detectFormat', () => {
  it('looks at the first meaningful character', () => {
    expect(detectFormat('{"openapi": "3.1.0"}')).toBe('json')
    expect(detectFormat('﻿\n  [1]')).toBe('json')
    expect(detectFormat('openapi: 3.1.0')).toBe('yaml')
    expect(detectFormat('# {comment}\na: 1')).toBe('yaml')
    expect(detectFormat('   ')).toBe('yaml')
  })
})
