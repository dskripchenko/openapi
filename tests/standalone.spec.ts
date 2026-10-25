import type { HttpRequest } from '../src/core/types'
import { toSpecSources, urlLoader } from '../src/standalone/options'
import { proxySend } from '../src/standalone/proxy'
import { resolveLocale } from '../src/vue/page'

const fakeFetch = (respond: (url: string, init?: RequestInit) => Response) => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return respond(url, init)
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('standalone options', () => {
  it('maps Scalar-style sources to specs with unique ids', async () => {
    const { fn, calls } = fakeFetch(() => new Response('openapi: 3.1.0'))
    const specs = toSpecSources(
      {
        sources: [
          { url: '/a.json', title: 'Public API', slug: 'public' },
          { content: { openapi: '3.1.0' }, title: 'Admin API' },
          { url: '/c.yaml', slug: 'public' },
          { url: '/d.yaml' },
        ],
      },
      fn,
    )
    expect(specs.map((s) => s.id)).toEqual(['public', 'admin-api', 'public-2', 'api-4'])
    expect(specs[0]!.name).toBe('Public API')
    expect(specs[1]!.spec).toEqual({ openapi: '3.1.0' })
    // A url becomes a loader: nothing is fetched until the spec is opened.
    expect(calls).toHaveLength(0)
    expect(await (specs[0]!.spec as () => Promise<string>)()).toBe('openapi: 3.1.0')
    expect(calls[0]!.url).toBe('/a.json')
  })

  it('takes the top-level url/content shorthand', () => {
    expect(toSpecSources({ content: 'openapi: 3.1.0' })).toEqual([{ id: 'api-1', spec: 'openapi: 3.1.0' }])
    expect(toSpecSources({})).toEqual([])
  })

  it('fails a loader on an HTTP error', async () => {
    const { fn } = fakeFetch(() => new Response('nope', { status: 404, statusText: 'Not Found' }))
    await expect(urlLoader('/x.json', fn)()).rejects.toThrow('/x.json: 404 Not Found')
  })

  it('resolves the auto locale from the browser language', () => {
    expect(resolveLocale('auto', 'ru-RU')).toBe('ru')
    expect(resolveLocale('auto', 'de-DE')).toBe('en')
    expect(resolveLocale(undefined, 'ru')).toBe('ru')
    expect(resolveLocale('en', 'ru-RU')).toBe('en')
  })
})

describe('proxySend', () => {
  const request: HttpRequest = {
    method: 'POST',
    url: 'https://api.example.com/upload',
    headers: [['X-Key', '1']],
    body: { mediaType: 'multipart/form-data', form: [['name', 'a'], ['file', { filename: 'a.txt', contentType: 'text/plain', data: 'secret' }]] },
  }

  it('posts the request as JSON and returns the proxied response', async () => {
    const { fn, calls } = fakeFetch(
      () => new Response(JSON.stringify({ status: 201, statusText: 'Created', headers: [['x-id', '7']], body: '{"ok":true}', duration: 12 }), { headers: { 'content-type': 'application/json' } }),
    )
    const response = await proxySend('/proxy', fn)(request)
    expect(response).toEqual({ status: 201, statusText: 'Created', headers: [['x-id', '7']], body: '{"ok":true}', duration: 12 })
    expect(calls[0]!.url).toBe('/proxy')
    expect(calls[0]!.init?.method).toBe('POST')
    const sent = JSON.parse(String(calls[0]!.init?.body))
    expect(sent.url).toBe('https://api.example.com/upload')
    // The file's bytes travel in base64.
    expect(sent.body.form[1]).toEqual(['file', { filename: 'a.txt', contentType: 'text/plain', base64: btoa('secret') }])
  })

  it('reports a failing proxy as a request that did not get through', async () => {
    const { fn } = fakeFetch(() => new Response('denied', { status: 403, statusText: 'Forbidden' }))
    const response = await proxySend('/proxy', fn)(request)
    expect(response.status).toBe(0)
    expect(response.error).toBe('The proxy answered 403 Forbidden')
    const broken = fakeFetch(() => new Response('<html>', { status: 200 }))
    expect((await proxySend('/proxy', broken.fn)(request)).status).toBe(0)
  })
})

describe('proxySend with files, binary answers and cancel', () => {
  it('sends file bytes in base64 and reads a binary answer into a blob', async () => {
    let sent: { body?: { form?: [string, unknown][]; file?: { base64?: string } } } = {}
    const fn = (async (_u: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ status: 200, statusText: 'OK', headers: [['content-type', 'image/png']], body: '', bodyBase64: btoa('PNG') }), { status: 200 })
    }) as typeof fetch
    const r = await proxySend('/proxy', fn)({
      method: 'POST',
      url: 'https://api.example.com/up',
      headers: [],
      body: { mediaType: 'multipart/form-data', form: [['alt', 'x'], ['file', { filename: 'a.txt', contentType: 'text/plain', data: new Blob(['hi']) }]] },
    })
    expect(sent.body?.form?.[1]?.[1]).toEqual({ filename: 'a.txt', contentType: 'text/plain', base64: btoa('hi') })
    expect(r.blob?.type).toBe('image/png')
    expect(await r.blob?.text()).toBe('PNG')
  })

  it('passes the cancel signal to the proxy call', async () => {
    let signal: AbortSignal | undefined | null
    const fn = (async (_u: unknown, init?: RequestInit) => {
      signal = init?.signal
      throw new DOMException('Aborted', 'AbortError')
    }) as typeof fetch
    const controller = new AbortController()
    const r = await proxySend('/proxy', fn)({ method: 'GET', url: 'https://x', headers: [] }, { signal: controller.signal })
    expect(signal).toBe(controller.signal)
    expect(r.status).toBe(0)
  })
})
