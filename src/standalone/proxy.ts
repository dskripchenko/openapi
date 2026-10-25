import type { HttpRequest, HttpResponse } from '../core/types'
import type { SendFn } from '../request'

/**
 * A try-it transport through the host's proxy endpoint.
 *
 * The contract:
 *  - The page POSTs to `url` with `Content-Type: application/json`,
 *    `Accept: application/json` and same-origin cookies. When the page has a
 *    `<meta name="csrf-token">` (Laravel's convention), its value goes in
 *    `X-CSRF-TOKEN`.
 *  - The body is the `HttpRequest` as JSON:
 *    `{ method, url, headers: [name, value][], body?: { mediaType, text?, form?, file? } }`.
 *    `url` is absolute. A file — a form field or the whole body (`file`) —
 *    arrives as `{ filename, contentType?, base64? }`, `base64` holding its
 *    bytes (absent when no file was chosen).
 *  - The endpoint checks the URL against the hosts it allows, performs the
 *    request and answers 200 with the `HttpResponse` as JSON:
 *    `{ status, statusText, headers: [name, value][], body: string, bodyBase64?, duration?, error? }`.
 *    A binary answer (an image, a PDF) goes in `bodyBase64` with `body: ''`:
 *    the page previews or offers it for download. `error` with `status: 0`
 *    reports that the API was not reached.
 *  - Any other answer (not 2xx, not JSON) is shown as a failed request.
 *  - Cancel aborts the call to the proxy.
 */
export function proxySend(url: string, fetchFn: typeof fetch = (...a) => globalThis.fetch(...a)): SendFn {
  return async (request: HttpRequest, options = {}): Promise<HttpResponse> => {
    const started = now()
    const failed = (error: string): HttpResponse => ({ status: 0, statusText: '', headers: [], body: '', duration: now() - started, error })
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
      const csrf = csrfToken()
      if (csrf) headers['X-CSRF-TOKEN'] = csrf
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(await serializable(request)),
        signal: options.signal,
      })
      if (!response.ok) return failed(`The proxy answered ${response.status} ${response.statusText}`.trim())
      const data = (await response.json()) as Partial<HttpResponse> & { bodyBase64?: unknown }
      if (typeof data !== 'object' || data === null || typeof data.status !== 'number') return failed('The proxy answered without a response')
      const headerList = Array.isArray(data.headers) ? data.headers : []
      const type = headerList.find(([k]) => String(k).toLowerCase() === 'content-type')?.[1] ?? 'application/octet-stream'
      const blob = typeof data.bodyBase64 === 'string' ? new Blob([fromBase64(data.bodyBase64)], { type }) : undefined
      return {
        ...(blob ? { blob } : {}),
        status: data.status,
        statusText: data.statusText ?? '',
        headers: Array.isArray(data.headers) ? data.headers : [],
        body: typeof data.body === 'string' ? data.body : data.body === undefined ? '' : JSON.stringify(data.body),
        duration: typeof data.duration === 'number' ? data.duration : now() - started,
        ...(data.error ? { error: data.error } : {}),
      }
    } catch (error) {
      return failed(error instanceof Error ? error.message || error.name : String(error))
    }
  }
}

type WireFile = { filename: string; contentType?: string; base64?: string }

/** A file as JSON: its bytes in base64 (a Blob does not survive JSON). */
async function wireFile(file: { filename: string; contentType?: string; data?: Blob | string }): Promise<WireFile> {
  const out: WireFile = { filename: file.filename }
  if (file.contentType) out.contentType = file.contentType
  if (file.data instanceof Blob) out.base64 = toBase64(new Uint8Array(await file.data.arrayBuffer()))
  else if (typeof file.data === 'string') out.base64 = toBase64(new TextEncoder().encode(file.data))
  return out
}

async function serializable(request: HttpRequest): Promise<unknown> {
  const body = request.body
  if (!body || (!body.form && !body.file)) return request
  const form = body.form
    ? await Promise.all(body.form.map(async ([name, v]): Promise<[string, string | WireFile]> => [name, typeof v === 'string' ? v : await wireFile(v)]))
    : undefined
  const file = body.file ? await wireFile(body.file) : undefined
  return { ...request, body: { ...body, ...(form ? { form } : {}), ...(file ? { file } : {}) } }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || null
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
