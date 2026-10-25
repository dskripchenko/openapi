import type { HttpRequest } from '../core/types'
import { fetchOAuthToken } from './oauth'
import { sendRequest } from './send'

type Call = { url: string; init: RequestInit }

function mockFetch(response: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response()
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('sendRequest', () => {
  it('returns status, headers, body and duration', async () => {
    const { fn, calls } = mockFetch(
      () =>
        new Response('{"ok":true}', {
          status: 201,
          statusText: 'Created',
          headers: { 'X-Id': '7' },
        }),
    )
    const req: HttpRequest = {
      method: 'post',
      url: 'https://api.test/pets',
      headers: [['Content-Type', 'application/json']],
      body: { mediaType: 'application/json', text: '{"a":1}' },
    }
    const res = await sendRequest(req, { fetch: fn })
    expect(res.status).toBe(201)
    expect(res.statusText).toBe('Created')
    expect(res.body).toBe('{"ok":true}')
    expect(res.headers).toContainEqual(['x-id', '7'])
    expect(res.duration).toBeGreaterThanOrEqual(0)
    expect(res.error).toBeUndefined()
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      credentials: 'same-origin',
      headers: [['Content-Type', 'application/json']],
    })
  })

  it('returns status 0 with the error on network failure', async () => {
    const { fn } = mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const res = await sendRequest({ method: 'GET', url: '/x', headers: [] }, { fetch: fn })
    expect(res).toMatchObject({
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      error: 'Failed to fetch',
    })
  })

  it('builds FormData for multipart and drops Content-Type', async () => {
    const { fn, calls } = mockFetch(() => new Response('ok'))
    const blob = new Blob(['BIN'], { type: 'application/octet-stream' })
    await sendRequest(
      {
        method: 'POST',
        url: '/upload',
        headers: [
          ['content-type', 'multipart/form-data'],
          ['X-A', '1'],
        ],
        body: {
          mediaType: 'multipart/form-data',
          form: [
            ['title', 'hello'],
            ['file', { filename: 'a.txt', contentType: 'text/plain', data: 'text content' }],
            ['blob', { filename: 'b.bin', data: blob }],
          ],
        },
      },
      { fetch: fn, credentials: 'include' },
    )
    const init = calls[0]!.init
    expect(init.headers).toEqual([['X-A', '1']])
    expect(init.credentials).toBe('include')
    const data = init.body as FormData
    expect(data).toBeInstanceOf(FormData)
    expect(data.get('title')).toBe('hello')
    const file = data.get('file') as File
    expect(file.name).toBe('a.txt')
    expect(file.type).toBe('text/plain')
    expect(await file.text()).toBe('text content')
    expect(await (data.get('blob') as File).text()).toBe('BIN')
  })

  it('builds URLSearchParams for urlencoded forms', async () => {
    const { fn, calls } = mockFetch(() => new Response(''))
    await sendRequest(
      {
        method: 'POST',
        url: '/f',
        headers: [],
        body: {
          mediaType: 'application/x-www-form-urlencoded',
          form: [
            ['a', 'x y'],
            ['a', '2'],
          ],
        },
      },
      { fetch: fn },
    )
    expect(String(calls[0]!.init.body)).toBe('a=x+y&a=2')
  })

  it('does not send a body with GET', async () => {
    const { fn, calls } = mockFetch(() => new Response(''))
    await sendRequest(
      { method: 'GET', url: '/', headers: [], body: { mediaType: 'text/plain', text: 'x' } },
      { fetch: fn },
    )
    expect(calls[0]!.init.body).toBeUndefined()
  })

  it('reports aborts as errors', async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = ((_: string, init: RequestInit) =>
      init.signal?.aborted
        ? Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
        : Promise.resolve(new Response(''))) as unknown as typeof fetch
    const res = await sendRequest(
      { method: 'GET', url: '/', headers: [] },
      { fetch: fn, signal: controller.signal },
    )
    expect(res.status).toBe(0)
    expect(res.error).toBe('The operation was aborted.')
  })
})

describe('fetchOAuthToken', () => {
  it('client credentials with secret uses Basic auth', async () => {
    const { fn, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 }),
        ),
    )
    const token = await fetchOAuthToken('clientCredentials', {
      tokenUrl: 'https://auth.test/token',
      clientId: 'my id',
      clientSecret: 's:cret',
      scopes: ['read', 'write'],
      fetch: fn,
    })
    expect(token).toEqual({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600 })
    const { url, init } = calls[0]!
    expect(url).toBe('https://auth.test/token')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('grant_type=client_credentials&scope=read+write')
    const headers = init.headers as [string, string][]
    expect(headers).toContainEqual(['Content-Type', 'application/x-www-form-urlencoded'])
    expect(headers).toContainEqual([
      'Authorization',
      'Basic ' + Buffer.from('my+id:s%3Acret').toString('base64'),
    ])
  })

  it('password flow without secret sends client_id in the body', async () => {
    const { fn, calls } = mockFetch(
      () => new Response(JSON.stringify({ access_token: 't', expires_in: '60' })),
    )
    const token = await fetchOAuthToken('password', {
      tokenUrl: '/token',
      clientId: 'app',
      username: 'u',
      password: 'p&w',
      fetch: fn,
    })
    expect(token).toEqual({ accessToken: 't', expiresIn: 60 })
    expect(calls[0]!.init.body).toBe('grant_type=password&username=u&password=p%26w&client_id=app')
    expect(
      (calls[0]!.init.headers as [string, string][]).some(([k]) => k === 'Authorization'),
    ).toBe(false)
  })

  it('rejects with the server error', async () => {
    const { fn } = mockFetch(
      () =>
        new Response(JSON.stringify({ error: 'invalid_client', error_description: 'Bad secret' }), {
          status: 401,
        }),
    )
    await expect(
      fetchOAuthToken('clientCredentials', { tokenUrl: '/t', clientId: 'x', fetch: fn }),
    ).rejects.toThrow('Token request failed: Bad secret')
    const { fn: fn2 } = mockFetch(
      () => new Response('nope', { status: 500, statusText: 'Server Error' }),
    )
    await expect(
      fetchOAuthToken('clientCredentials', { tokenUrl: '/t', clientId: 'x', fetch: fn2 }),
    ).rejects.toThrow('HTTP 500 Server Error')
  })
})
