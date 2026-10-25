import type { FormValue, HttpRequest, HttpResponse } from '../core/types'
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
 *    `{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`.
 *    `url` is absolute. File fields of a form arrive as
 *    `{ filename, contentType? }` — the file's data is not sent.
 *  - The endpoint checks the URL against the hosts it allows, performs the
 *    request and answers 200 with the `HttpResponse` as JSON:
 *    `{ status, statusText, headers: [name, value][], body: string, duration?, error? }`.
 *    `error` with `status: 0` reports that the API was not reached.
 *  - Any other answer (not 2xx, not JSON) is shown as a failed request.
 */
export function proxySend(url: string, fetchFn: typeof fetch = (...a) => globalThis.fetch(...a)): SendFn {
  return async (request: HttpRequest): Promise<HttpResponse> => {
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
        body: JSON.stringify(serializable(request)),
      })
      if (!response.ok) return failed(`The proxy answered ${response.status} ${response.statusText}`.trim())
      const data = (await response.json()) as Partial<HttpResponse>
      if (typeof data !== 'object' || data === null || typeof data.status !== 'number') return failed('The proxy answered without a response')
      return {
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

/** The request without file contents: a Blob does not survive JSON. */
function serializable(request: HttpRequest): HttpRequest {
  if (!request.body?.form) return request
  const form = request.body.form.map(([name, v]): [string, FormValue] =>
    typeof v === 'string' ? [name, v] : [name, v.contentType ? { filename: v.filename, contentType: v.contentType } : { filename: v.filename }],
  )
  return { ...request, body: { ...request.body, form } }
}

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || null
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
