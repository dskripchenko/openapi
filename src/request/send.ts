import type { HttpRequest, HttpResponse } from '../core/types'
import { isFormUrlEncoded, isMultipart } from './encode'

/** The transport try-it uses; a host may replace it with a proxy. */
export type SendFn = (request: HttpRequest) => Promise<HttpResponse>

export interface SendOptions {
  fetch?: typeof fetch
  signal?: AbortSignal
  /** Defaults to `'same-origin'`: cookies are never sent to a foreign API. */
  credentials?: RequestCredentials
}

function now(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance
  return perf ? perf.now() : Date.now()
}

/** Turns `HttpRequest.body` into a fetch body. */
export function toFetchBody(request: HttpRequest): BodyInit | undefined {
  const body = request.body
  if (!body) return undefined
  if (body.form && isMultipart(body.mediaType)) {
    const data = new FormData()
    for (const [name, value] of body.form) {
      if (typeof value === 'string') {
        data.append(name, value)
      } else {
        const blob =
          value.data instanceof Blob
            ? value.data
            : new Blob(
                value.data === undefined ? [] : [value.data],
                value.contentType ? { type: value.contentType } : {},
              )
        data.append(name, blob, value.filename)
      }
    }
    return data
  }
  if (body.form && (isFormUrlEncoded(body.mediaType) || !body.text)) {
    return new URLSearchParams(
      body.form.map(([k, v]): [string, string] => [k, typeof v === 'string' ? v : v.filename]),
    )
  }
  return body.text ?? ''
}

/**
 * Sends the request with `fetch` and reads the body as text. Never throws:
 * network and CORS failures come back as `status: 0` with `error` set.
 *
 * Headers that browsers forbid (`Cookie`, `Host`, `Origin`, …) are passed to
 * fetch but silently dropped by the browser; a host-provided proxy
 * {@link SendFn} can forward them. For multipart bodies the `Content-Type`
 * header is removed so fetch sets it with the boundary.
 */
export async function sendRequest(
  request: HttpRequest,
  options: SendOptions = {},
): Promise<HttpResponse> {
  const start = now()
  const doFetch = options.fetch ?? globalThis.fetch
  try {
    const multipart = request.body?.form !== undefined && isMultipart(request.body.mediaType)
    const headers = request.headers.filter(
      ([name]) => !(multipart && name.toLowerCase() === 'content-type'),
    )
    const method = request.method.toUpperCase()
    const init: RequestInit = {
      method,
      headers,
      credentials: options.credentials ?? 'same-origin',
    }
    if (options.signal) init.signal = options.signal
    if (method !== 'GET' && method !== 'HEAD') {
      const body = toFetchBody(request)
      if (body !== undefined) init.body = body
    }
    const response = await doFetch(request.url, init)
    const responseHeaders: [string, string][] = []
    response.headers.forEach((value, name) => responseHeaders.push([name, value]))
    const text = await response.text()
    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: text,
      duration: now() - start,
    }
  } catch (error) {
    return {
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      duration: now() - start,
      error: error instanceof Error ? error.message || error.name : String(error),
    }
  }
}
