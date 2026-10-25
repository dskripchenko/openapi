import type { HttpRequest } from '../../core/types'
import {
  contentDisposition,
  encodeForm,
  hasDuplicateKeys,
  mergeHeaders,
  mediaTypeOnly,
  prepare,
  psQuote,
  shellQuote,
  withoutHeaders,
} from '../common'

const URLENCODED = 'application/x-www-form-urlencoded'

/** curl's `-F name=@file` needs quotes around file names with `;`, `,`, `"` or spaces. */
function curlFileName(name: string): string {
  return /[;,"\\\s]/.test(name) ? '"' + name.replace(/[\\"]/g, (c) => '\\' + c) + '"' : name
}

export function curl(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const first =
    req.method === 'HEAD' && body.kind === 'none'
      ? 'curl --head'
      : req.method === 'GET' && body.kind === 'none'
        ? 'curl'
        : 'curl -X ' + req.method
  const args: string[] = []

  let headers = req.headers
  if (body.kind === 'urlencoded' && req.contentType?.toLowerCase() === URLENCODED) {
    headers = withoutHeaders(headers, 'Content-Type')
  }
  for (const [k, v] of headers) args.push('-H ' + shellQuote(k + ': ' + v))

  switch (body.kind) {
    case 'json':
    case 'text':
      args.push('--data-raw ' + shellQuote(body.text))
      break
    case 'urlencoded':
      for (const [k, v] of body.fields) {
        // curl encodes the value only; the name is passed as given.
        const name = encodeForm([[k, '']]).slice(0, -1)
        args.push('--data-urlencode ' + shellQuote(name + '=' + v))
      }
      break
    case 'multipart':
      for (const field of body.fields) {
        if ('value' in field) {
          args.push('--form-string ' + shellQuote(field.name + '=' + field.value))
        } else {
          const type = field.file.contentType ? ';type=' + field.file.contentType : ''
          args.push(
            '-F ' + shellQuote(field.name + '=@' + curlFileName(field.file.filename) + type),
          )
        }
      }
      break
  }

  const lines = [first + ' ' + shellQuote(req.url)]
  for (const arg of args) lines.push('  ' + arg)
  return lines.join(' \\\n')
}

const PS_METHODS: Record<string, string> = {
  GET: 'Get',
  POST: 'Post',
  PUT: 'Put',
  PATCH: 'Patch',
  DELETE: 'Delete',
  HEAD: 'Head',
  OPTIONS: 'Options',
  TRACE: 'Trace',
  MERGE: 'Merge',
}

/** A here-string when the text spans lines and allows it, else a single-quoted string. */
function psText(text: string): string {
  if (text.includes('\n') && !/^'@/m.test(text) && !text.includes('\r'))
    return "@'\n" + text + "\n'@"
  return psQuote(text)
}

export function powershell(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const pre: string[] = []
  const params: string[] = ['Uri = ' + psQuote(req.url)]
  const method = PS_METHODS[req.method]
  params.push(method ? 'Method = ' + psQuote(method) : 'CustomMethod = ' + psQuote(req.method))

  // Content-Type goes to -ContentType; Windows PowerShell rejects it in -Headers.
  const headers = mergeHeaders(withoutHeaders(req.headers, 'Content-Type'))
  if (headers.length) {
    params.push('Headers = @{')
    for (const [k, v] of headers) params.push('    ' + psQuote(k) + ' = ' + psQuote(v))
    params.push('}')
  }

  switch (body.kind) {
    case 'json':
    case 'text':
      pre.push('$body = ' + psText(body.text))
      params.push('ContentType = ' + psQuote(req.contentType ?? body.mediaType))
      params.push('Body = $body')
      break
    case 'urlencoded':
      params.push('ContentType = ' + psQuote(req.contentType ?? body.mediaType))
      if (hasDuplicateKeys(body.fields)) {
        params.push('Body = ' + psQuote(encodeForm(body.fields)))
      } else {
        params.push('Body = @{')
        for (const [k, v] of body.fields) params.push('    ' + psQuote(k) + ' = ' + psQuote(v))
        params.push('}')
      }
      break
    case 'multipart': {
      // -Form (PowerShell 7+) builds multipart/form-data; repeated names become arrays.
      const groups = new Map<string, string[]>()
      for (const field of body.fields) {
        const value =
          'value' in field
            ? psQuote(field.value)
            : '(Get-Item -LiteralPath ' + psQuote(field.file.filename) + ')'
        groups.set(field.name, [...(groups.get(field.name) ?? []), value])
      }
      params.push('Form = @{')
      for (const [name, values] of groups) {
        const value = values.length === 1 ? values[0]! : '@(' + values.join(', ') + ')'
        params.push('    ' + psQuote(name) + ' = ' + value)
      }
      params.push('}')
      break
    }
  }

  const lines = [
    ...pre,
    '$params = @{',
    ...params.map((p) => '    ' + p),
    '}',
    '$response = Invoke-RestMethod @params',
    '$response',
  ]
  return lines.join('\n')
}

/** Splits an absolute URL into host and request target; relative URLs have no host. */
function splitUrl(url: string): { host?: string; target: string } {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^#]*)/i.exec(url)
  if (!match) return { target: url || '/' }
  const host = (match[1] ?? '').replace(/^[^@]*@/, '')
  const rest = match[2] ?? ''
  return { host, target: rest.startsWith('/') ? rest : '/' + rest }
}

const BOUNDARY = '----OpenApiFormBoundary7MA4YWxkTrZu0gW'

export function httpRaw(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const { host, target } = splitUrl(req.url)
  const lines = [req.method + ' ' + target + ' HTTP/1.1']
  if (host && !req.headers.some(([k]) => k.toLowerCase() === 'host')) lines.push('Host: ' + host)
  for (const [k, v] of req.headers) lines.push(k + ': ' + v)

  let text: string | undefined
  switch (body.kind) {
    case 'json':
    case 'text':
      text = body.text
      break
    case 'urlencoded':
      text = encodeForm(body.fields)
      break
    case 'multipart': {
      lines.push('Content-Type: ' + mediaTypeOnly(body.mediaType) + '; boundary=' + BOUNDARY)
      const parts: string[] = []
      for (const field of body.fields) {
        parts.push('--' + BOUNDARY)
        if ('value' in field) {
          parts.push('Content-Disposition: ' + contentDisposition(field.name), '', field.value)
        } else {
          parts.push('Content-Disposition: ' + contentDisposition(field.name, field.file.filename))
          if (field.file.contentType) parts.push('Content-Type: ' + field.file.contentType)
          parts.push('', field.file.data ?? '<contents of ' + field.file.filename + '>')
        }
      }
      parts.push('--' + BOUNDARY + '--')
      text = parts.join('\n')
      break
    }
  }
  if (text !== undefined) lines.push('', text)
  return lines.join('\n')
}
