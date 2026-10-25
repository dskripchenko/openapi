import type { HttpRequest } from '../core/types'
import { buildRequest } from '../request'
import {
  psQuote,
  pyString,
  shellQuote,
  jsString,
  phpString,
  javaString,
  kotlinString,
  swiftString,
  csString,
  goString,
} from './common'
import { generateSnippet, SNIPPET_TARGETS, type SnippetTarget } from './index'

const CASES: Record<string, HttpRequest> = {
  'get-query-header': buildRequest({
    method: 'get',
    path: '/pets',
    server: 'https://api.example.com/v1',
    parameters: [
      { name: 'limit', in: 'query' },
      { name: 'tags', in: 'query' },
      { name: 'X-Request-Id', in: 'header' },
    ],
    values: { query: { limit: 10, tags: ['dog', 'cat'] }, header: { 'X-Request-Id': 'abc-123' } },
  }),
  'post-json-bearer': buildRequest({
    method: 'post',
    path: '/pets',
    server: 'https://api.example.com/v1',
    parameters: [],
    values: {},
    security: [{ scheme: { type: 'http', scheme: 'bearer' }, value: 'eyJhbGciOi.token' }],
    body: {
      mediaType: 'application/json',
      value: {
        name: 'Rex',
        age: 3,
        vaccinated: true,
        owner: null,
        tags: ['good', 'boy'],
        address: { city: 'Berlin', 'zip-code': '10115' },
        empty: {},
        list: [],
      },
    },
  }),
  'form-urlencoded': buildRequest({
    method: 'post',
    path: '/login',
    server: 'https://api.example.com',
    parameters: [],
    values: {},
    body: {
      mediaType: 'application/x-www-form-urlencoded',
      value: { username: 'alice', password: 'p@ss word&more', remember: true },
    },
  }),
  'multipart-file': buildRequest({
    method: 'post',
    path: '/pets/{id}/photo',
    server: 'https://api.example.com',
    parameters: [{ name: 'id', in: 'path' }],
    values: { path: { id: 42 } },
    security: [{ scheme: { type: 'apiKey', name: 'X-API-Key', in: 'header' }, value: 'secret' }],
    body: {
      mediaType: 'multipart/form-data',
      value: {
        caption: 'Rex at the beach',
        photo: { filename: 'rex.png', contentType: 'image/png' },
      },
    },
  }),
}

const NASTY = `it's "quoted" $HOME \`tick\` \\back\\slash\nnew line\ttab ünïcödé 😀 '@ """ \${x}`

CASES['escaping'] = {
  method: 'PUT',
  url: "https://api.example.com/items/a'b?q=x%20y&z=$HOME",
  headers: [
    ['X-Nasty', `it's "quoted" $HOME \`tick\` \\ ‘smart’`],
    ['Content-Type', 'text/plain'],
  ],
  body: { mediaType: 'text/plain', text: NASTY },
}

describe('snippets: snapshots', () => {
  for (const target of SNIPPET_TARGETS) {
    for (const [name, request] of Object.entries(CASES)) {
      it(`${target.id} ${name}`, async () => {
        const code = generateSnippet(target.id, request)
        expect(code.endsWith('\n')).toBe(false)
        if (name !== 'escaping') expect(code).not.toMatch(/[ \t]+$/m)
        await expect(code).toMatchFileSnapshot(`__snapshots__/${target.id}-${name}.txt`)
      })
    }
  }
})

describe('snippets: targets', () => {
  it('lists 13 unique targets', () => {
    expect(SNIPPET_TARGETS).toHaveLength(13)
    expect(new Set(SNIPPET_TARGETS.map((t) => t.id)).size).toBe(13)
  })

  it('throws on unknown targets', () => {
    expect(() => generateSnippet('cobol' as SnippetTarget, CASES['get-query-header']!)).toThrow(
      'Unknown snippet target',
    )
  })
})

describe('snippets: string escaping', () => {
  it('shell single quotes', () => {
    expect(shellQuote("it's $HOME `x`")).toBe("'it'\\''s $HOME `x`'")
  })

  it('PowerShell doubles plain and typographic single quotes', () => {
    expect(psQuote("it's ‘x’ $a")).toBe("'it''s ‘‘x’’ $a'")
  })

  it('JavaScript', () => {
    expect(jsString("a'b\\c\n \x01")).toBe("'a\\'b\\\\c\\n\\u2028\\x01'")
  })

  it('Python', () => {
    expect(pyString("a'b\n\x00é")).toBe("'a\\'b\\n\\x00é'")
  })

  it('PHP uses single quotes unless control characters need double quotes', () => {
    expect(phpString("a'b\\c$d")).toBe("'a\\'b\\\\c$d'")
    expect(phpString('a"$b\n')).toBe('"a\\"\\$b\\n"')
  })

  it('Go, Java, C#, Kotlin, Swift', () => {
    expect(goString('a"b\x01')).toBe('"a\\"b\\x01"')
    expect(javaString('a"b\x01\n')).toBe('"a\\"b\\001\\n"')
    expect(csString('a"b\x01')).toBe('"a\\"b\\u0001"')
    expect(kotlinString('a"$b\x01')).toBe('"a\\"\\$b\\u0001"')
    expect(swiftString('a"b\x01\x00')).toBe('"a\\"b\\u{1}\\0"')
  })

  it('escapes the nasty body per language', () => {
    const req = CASES['escaping']!
    expect(generateSnippet('curl', req)).toContain(`'it'\\''s "quoted" $HOME`)
    expect(generateSnippet('python-requests', req)).toContain(".encode('utf-8')")
    expect(generateSnippet('kotlin-okhttp', req)).toContain('\\$HOME')
    expect(generateSnippet('powershell', req)).toContain("'it''s")
    expect(generateSnippet('go-native', req)).toContain('"it\'s \\"quoted\\" $HOME `tick`')
  })
})

describe('snippets: body variants', () => {
  const base = { method: 'POST', url: 'https://x.test/a', headers: [] as [string, string][] }

  it('falls back to text for JSON with unsafe integers', () => {
    const req: HttpRequest = {
      ...base,
      headers: [['Content-Type', 'application/json']],
      body: { mediaType: 'application/json', text: '{"id": 12345678901234567890}' },
    }
    expect(generateSnippet('python-requests', req)).toContain(
      'data=\'{"id": 12345678901234567890}\'',
    )
    expect(generateSnippet('javascript-fetch', req)).toContain(
      'body: \'{"id": 12345678901234567890}\'',
    )
  })

  it('keeps custom JSON content types', () => {
    const req: HttpRequest = {
      ...base,
      headers: [['Content-Type', 'application/vnd.api+json']],
      body: { mediaType: 'application/vnd.api+json', text: '{"a":1}' },
    }
    const py = generateSnippet('python-requests', req)
    expect(py).toContain("'Content-Type': 'application/vnd.api+json'")
    expect(py).toContain('json={')
  })

  it('uses list forms for repeated form fields', () => {
    const req: HttpRequest = {
      ...base,
      headers: [['Content-Type', 'application/x-www-form-urlencoded']],
      body: {
        mediaType: 'application/x-www-form-urlencoded',
        form: [
          ['a', '1'],
          ['a', '2'],
        ],
      },
    }
    expect(generateSnippet('python-requests', req)).toContain("('a', '1'),")
    expect(generateSnippet('php-guzzle', req)).toContain("'body' => 'a=1&a=2'")
    expect(generateSnippet('javascript-fetch', req)).toContain("['a', '1'],")
    expect(generateSnippet('powershell', req)).toContain("Body = 'a=1&a=2'")
  })

  it('sends text-only multipart as multipart in python', () => {
    const req: HttpRequest = {
      ...base,
      body: { mediaType: 'multipart/form-data', form: [['a', '1']] },
    }
    expect(generateSnippet('python-requests', req)).toContain("'a': (None, '1'),")
    expect(generateSnippet('php-laravel', req)).toContain('asMultipart()')
  })

  it('handles methods without dedicated helpers', () => {
    const req: HttpRequest = { method: 'TRACE', url: 'https://x.test/', headers: [] }
    expect(generateSnippet('python-requests', req)).toContain(
      "requests.request('TRACE', 'https://x.test/')",
    )
    expect(generateSnippet('php-laravel', req)).toContain("send('TRACE', 'https://x.test/')")
    expect(generateSnippet('powershell', { ...req, method: 'PROPFIND' })).toContain(
      "CustomMethod = 'PROPFIND'",
    )
    expect(generateSnippet('csharp-httpclient', req)).toContain('HttpMethod.Trace')
    expect(generateSnippet('kotlin-okhttp', req)).toContain('.method("TRACE", null)')
  })

  it('prints relative URLs in raw HTTP without Host', () => {
    expect(generateSnippet('http-raw', { method: 'GET', url: '/api/x?y=1', headers: [] })).toBe(
      'GET /api/x?y=1 HTTP/1.1',
    )
  })
})
