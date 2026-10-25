import type { Parameter, SecurityScheme } from '../core/types'
import { buildRequest } from './build'
import { base64Utf8, encodeComponent } from './encode'
import { applySecurity, basicAuth } from './security'
import { joinUrl, serverUrl } from './server'

describe('serverUrl', () => {
  const server = {
    url: 'https://{env}.example.com:{port}/{base}',
    variables: { env: { default: 'api' }, port: { default: '443' }, base: { default: 'v1' } },
  }

  it('uses defaults', () => {
    expect(serverUrl(server)).toBe('https://api.example.com:443/v1')
  })

  it('uses given values and keeps unknown variables', () => {
    expect(serverUrl(server, { env: 'staging' })).toBe('https://staging.example.com:443/v1')
    expect(serverUrl({ url: '/{x}' })).toBe('/{x}')
  })
})

describe('joinUrl', () => {
  it('handles slashes', () => {
    expect(joinUrl('https://a.com/', '/pets')).toBe('https://a.com/pets')
    expect(joinUrl('https://a.com', 'pets')).toBe('https://a.com/pets')
    expect(joinUrl('https://a.com/api//', '//pets')).toBe('https://a.com/api/pets')
  })

  it('keeps relative servers relative', () => {
    expect(joinUrl('/api', '/pets')).toBe('/api/pets')
    expect(joinUrl('', '/pets')).toBe('/pets')
    expect(joinUrl('', '')).toBe('/')
  })
})

describe('base64Utf8', () => {
  it('matches standard base64', () => {
    expect(base64Utf8('')).toBe('')
    expect(base64Utf8('f')).toBe('Zg==')
    expect(base64Utf8('fo')).toBe('Zm8=')
    expect(base64Utf8('foo')).toBe('Zm9v')
    expect(base64Utf8('user:pass')).toBe('dXNlcjpwYXNz')
  })

  it('encodes UTF-8', () => {
    expect(base64Utf8('пароль:😀')).toBe(Buffer.from('пароль:😀', 'utf8').toString('base64'))
  })

  it('encodeComponent keeps unreserved only', () => {
    expect(encodeComponent("-._~!'()*")).toBe('-._~%21%27%28%29%2A')
  })
})

describe('applySecurity', () => {
  const apiKey = (location: 'header' | 'query' | 'cookie'): SecurityScheme => ({
    type: 'apiKey',
    name: 'X-Key',
    in: location,
  })

  it('places API keys', () => {
    expect(applySecurity([{ scheme: apiKey('header'), value: 'k 1' }]).headers).toEqual([
      ['X-Key', 'k 1'],
    ])
    expect(applySecurity([{ scheme: apiKey('query'), value: 'k 1' }]).query).toEqual([
      ['X-Key', 'k%201'],
    ])
    expect(applySecurity([{ scheme: apiKey('cookie'), value: 'k;1' }]).cookies).toEqual([
      ['X-Key', 'k%3B1'],
    ])
  })

  it('builds http auth headers', () => {
    const basic: SecurityScheme = { type: 'http', scheme: 'basic' }
    expect(
      applySecurity([{ scheme: basic, value: { username: 'Aladdin', password: 'open sesame' } }])
        .headers,
    ).toEqual([['Authorization', 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==']])
    expect(applySecurity([{ scheme: basic, value: 'Aladdin:open sesame' }]).headers[0]?.[1]).toBe(
      basicAuth('Aladdin', 'open sesame'),
    )
    expect(
      applySecurity([{ scheme: { type: 'http', scheme: 'Bearer' }, value: 't' }]).headers,
    ).toEqual([['Authorization', 'Bearer t']])
    expect(
      applySecurity([{ scheme: { type: 'http', scheme: 'digest' }, value: 'x=1' }]).headers,
    ).toEqual([['Authorization', 'Digest x=1']])
  })

  it('uses bearer tokens for oauth2 and openIdConnect', () => {
    const oauth: SecurityScheme = { type: 'oauth2', flows: {} }
    const oidc: SecurityScheme = { type: 'openIdConnect', openIdConnectUrl: 'https://x' }
    expect(
      applySecurity([
        { scheme: oauth, value: 'a' },
        { scheme: oidc, value: 'b' },
      ]).headers,
    ).toEqual([
      ['Authorization', 'Bearer a'],
      ['Authorization', 'Bearer b'],
    ])
  })

  it('skips empty values and mutualTLS', () => {
    expect(applySecurity([{ scheme: apiKey('header'), value: '' }]).headers).toEqual([])
    expect(applySecurity([{ scheme: { type: 'mutualTLS' }, value: 'x' }]).headers).toEqual([])
  })
})

describe('buildRequest', () => {
  const parameters: Parameter[] = [
    { name: 'id', in: 'path', required: true },
    { name: 'tags', in: 'query', schema: { type: 'array' } },
    { name: 'limit', in: 'query' },
    { name: 'empty', in: 'query', allowEmptyValue: true },
    { name: 'skipped', in: 'query' },
    { name: 'X-Trace', in: 'header' },
    { name: 'Accept', in: 'header' },
    { name: 'session', in: 'cookie' },
    { name: 'theme', in: 'cookie' },
  ]

  it('serializes all locations', () => {
    const req = buildRequest({
      method: 'get',
      path: '/pets/{id}',
      server: 'https://api.example.com/v1/',
      parameters,
      values: {
        path: { id: 'a/b' },
        query: { tags: ['x', 'y'], limit: 10, empty: '', skipped: '' },
        header: { 'X-Trace': 'abc', Accept: 'text/plain' },
        cookie: { session: 's 1', theme: 'dark' },
      },
    })
    expect(req).toEqual({
      method: 'GET',
      url: 'https://api.example.com/v1/pets/a%2Fb?tags=x&tags=y&limit=10&empty=',
      headers: [
        ['X-Trace', 'abc'],
        ['Cookie', 'session=s%201; theme=dark'],
      ],
    })
  })

  it('keeps missing path placeholders and handles undeclared ones', () => {
    const req = buildRequest({
      method: 'GET',
      path: '/a/{x}/{y}',
      parameters: [],
      values: { path: { y: 5 } },
    })
    expect(req.url).toBe('/a/{x}/5')
  })

  it('applies security to query, headers and cookies', () => {
    const req = buildRequest({
      method: 'GET',
      path: '/x',
      server: '/api',
      parameters: [{ name: 'q', in: 'query' }],
      values: { query: { q: 1 } },
      security: [
        { scheme: { type: 'apiKey', name: 'key', in: 'query' }, value: 'k' },
        { scheme: { type: 'apiKey', name: 'sid', in: 'cookie' }, value: 'c' },
        { scheme: { type: 'http', scheme: 'bearer' }, value: 't' },
      ],
    })
    expect(req.url).toBe('/api/x?q=1&key=k')
    expect(req.headers).toEqual([
      ['Authorization', 'Bearer t'],
      ['Cookie', 'sid=c'],
    ])
  })

  it('pretty-prints JSON bodies and sets Content-Type', () => {
    const req = buildRequest({
      method: 'post',
      path: '/pets',
      parameters: [],
      values: {},
      body: { mediaType: 'application/vnd.api+json', value: { a: [1, { b: null }] } },
    })
    expect(req.body).toEqual({
      mediaType: 'application/vnd.api+json',
      text: '{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ]\n}',
    })
    expect(req.headers).toEqual([['Content-Type', 'application/vnd.api+json']])
  })

  it('keeps JSON text as typed', () => {
    const req = buildRequest({
      method: 'POST',
      path: '/',
      parameters: [],
      values: {},
      body: { mediaType: 'application/json', value: '{"a":1}' },
    })
    expect(req.body?.text).toBe('{"a":1}')
  })

  it('serializes urlencoded fields with encoding styles', () => {
    const req = buildRequest({
      method: 'POST',
      path: '/form',
      parameters: [],
      values: {},
      body: {
        mediaType: 'application/x-www-form-urlencoded',
        value: {
          name: 'a b',
          tags: ['x', 'y'],
          ids: [1, 2],
          filter: { a: 1, b: 2 },
          deep: { c: 3 },
          skip: undefined,
        },
        encoding: {
          ids: { style: 'form', explode: false },
          deep: { style: 'deepObject', explode: true },
        },
      },
    })
    expect(req.body).toEqual({
      mediaType: 'application/x-www-form-urlencoded',
      form: [
        ['name', 'a b'],
        ['tags', 'x'],
        ['tags', 'y'],
        ['ids', '1,2'],
        ['a', '1'],
        ['b', '2'],
        ['deep[c]', '3'],
      ],
    })
    expect(req.headers).toEqual([['Content-Type', 'application/x-www-form-urlencoded']])
  })

  it('builds multipart fields without Content-Type header', () => {
    const file = { filename: 'a.png', contentType: 'image/png', data: 'PNG' }
    const req = buildRequest({
      method: 'POST',
      path: '/upload',
      parameters: [],
      values: {},
      body: {
        mediaType: 'multipart/form-data',
        value: { title: 'x', meta: { a: 1 }, file, many: [file, 'y'], count: 2, none: null },
      },
    })
    expect(req.body).toEqual({
      mediaType: 'multipart/form-data',
      form: [
        ['title', 'x'],
        ['meta', '{"a":1}'],
        ['file', file],
        ['many', file],
        ['many', 'y'],
        ['count', '2'],
      ],
    })
    expect(req.headers).toEqual([])
  })

  it('sends strings as text for text and other types', () => {
    const xml = buildRequest({
      method: 'PUT',
      path: '/',
      parameters: [],
      values: {},
      body: { mediaType: 'application/xml', value: '<a/>' },
    })
    expect(xml.body).toEqual({ mediaType: 'application/xml', text: '<a/>' })
    const plain = buildRequest({
      method: 'PUT',
      path: '/',
      parameters: [],
      values: {},
      body: { mediaType: 'text/plain', value: 'hi' },
    })
    expect(plain.body).toEqual({ mediaType: 'text/plain', text: 'hi' })
    const form = buildRequest({
      method: 'PUT',
      path: '/',
      parameters: [],
      values: {},
      body: { mediaType: 'application/x-www-form-urlencoded', value: 'a=1' },
    })
    expect(form.body).toEqual({ mediaType: 'application/x-www-form-urlencoded', text: 'a=1' })
  })

  it('appends query to a path that already has one', () => {
    const req = buildRequest({
      method: 'GET',
      path: '/x?fixed=1',
      parameters: [{ name: 'a', in: 'query' }],
      values: { query: { a: 2 } },
    })
    expect(req.url).toBe('/x?fixed=1&a=2')
  })

  it('sends a file value as the whole body of a binary media type', () => {
    const data = new Blob(['PNG'], { type: 'image/png' })
    const req = buildRequest({
      method: 'PUT',
      path: '/img',
      parameters: [],
      values: {},
      body: { mediaType: 'application/octet-stream', value: { filename: 'a.png', data } },
    })
    expect(req.body).toEqual({
      mediaType: 'application/octet-stream',
      file: { filename: 'a.png', data },
    })
    expect(req.headers).toContainEqual(['Content-Type', 'application/octet-stream'])
  })

  it('declares the file type under a wildcard media type', () => {
    const body = (contentType?: string) =>
      buildRequest({
        method: 'PUT',
        path: '/img',
        parameters: [],
        values: {},
        body: { mediaType: 'image/*', value: { filename: 'a.png', contentType } },
      }).headers
    expect(body('image/png')).toContainEqual(['Content-Type', 'image/png'])
    expect(body()).toContainEqual(['Content-Type', 'application/octet-stream'])
  })
})

describe('buildRequest: extra parameters', () => {
  const params: Parameter[] = [
    { name: 'q', in: 'query', schema: { type: 'string' } },
    { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
    { name: 'sid', in: 'cookie', schema: { type: 'string' } },
  ]
  const build = (extra: Parameters<typeof buildRequest>[0]['extra']) =>
    buildRequest({
      method: 'get',
      path: '/s',
      server: 'https://a.com',
      parameters: params,
      values: { query: { q: 'x' }, header: { 'X-Trace': 't' }, cookie: { sid: '1' } },
      extra,
      security: [{ scheme: { type: 'apiKey', in: 'header', name: 'X-Key' }, value: 'k' }],
    })

  it('appends them after the declared ones, encoded, before the credentials', () => {
    const r = build({ query: [['a b', 'c&d']], header: [['X-Extra', 'v 1']], cookie: [['theme', 'dark mode']] })
    expect(r.url).toBe('https://a.com/s?q=x&a%20b=c%26d')
    expect(r.headers).toEqual([
      ['X-Trace', 't'],
      ['X-Extra', 'v 1'],
      ['X-Key', 'k'],
      ['Cookie', 'sid=1; theme=dark%20mode'],
    ])
  })

  it('skips pairs without a name and trims names', () => {
    const r = build({ query: [['', 'lost'], [' n ', '']], header: [['  ', 'x']] })
    expect(r.url).toBe('https://a.com/s?q=x&n=')
    expect(r.headers.map(([k]) => k)).toEqual(['X-Trace', 'X-Key', 'Cookie'])
  })
})
