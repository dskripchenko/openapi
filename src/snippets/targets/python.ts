import type { HttpRequest } from '../../core/types'
import {
  hasDuplicateKeys,
  mergeHeaders,
  Ordered,
  prepare,
  PYTHON_LITERAL,
  pyString,
  Raw,
  renderLiteral,
  withoutHeaders,
} from '../common'

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

/** A str body; non-Latin-1 text is encoded explicitly (http.client sends str as Latin-1). */
function pyText(text: string): string {
  return (
    pyString(text) +
    (Array.from(text).some((c) => c.codePointAt(0)! > 0xff) ? ".encode('utf-8')" : '')
  )
}

/** A dict, or a list of tuples when names repeat. */
function pairsLiteral(pairs: [string, unknown][]): string {
  if (!hasDuplicateKeys(pairs)) return renderLiteral(new Ordered(pairs), PYTHON_LITERAL, '    ')
  const tuples = pairs.map(
    ([k, v]) => new Raw('(' + pyString(k) + ', ' + renderLiteral(v, PYTHON_LITERAL) + ')'),
  )
  return renderLiteral(tuples, PYTHON_LITERAL, '    ')
}

export function pythonRequests(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const args: string[] = []
  let implied: string | undefined

  switch (body.kind) {
    case 'json':
      // requests sets Content-Type for json= only when the headers have none.
      if (body.value !== undefined) {
        args.push('json=' + renderLiteral(body.value, PYTHON_LITERAL, '    '))
        implied = 'application/json'
      } else {
        args.push('data=' + pyText(body.text))
      }
      break
    case 'text':
      args.push('data=' + pyText(body.text))
      break
    case 'urlencoded':
      args.push('data=' + pairsLiteral(body.fields))
      implied = 'application/x-www-form-urlencoded'
      break
    case 'multipart': {
      const data: [string, unknown][] = []
      const files: [string, unknown][] = []
      for (const field of body.fields) {
        if ('value' in field) {
          data.push([field.name, field.value])
          continue
        }
        const { filename, contentType, data: content } = field.file
        const parts = [
          pyString(filename),
          content !== undefined ? pyString(content) : 'open(' + pyString(filename) + ", 'rb')",
        ]
        if (contentType) parts.push(pyString(contentType))
        files.push([field.name, new Raw('(' + parts.join(', ') + ')')])
      }
      if (files.length) {
        if (data.length) args.push('data=' + pairsLiteral(data))
        args.push('files=' + pairsLiteral(files))
      } else {
        // Text-only multipart: (None, value) tuples make requests send multipart.
        const fields = data.map(([k, v]): [string, unknown] => [
          k,
          new Raw('(None, ' + pyString(String(v)) + ')'),
        ])
        args.push('files=' + pairsLiteral(fields))
      }
      break
    }
  }

  const drop = implied !== undefined && req.contentType?.toLowerCase() === implied
  const headers = mergeHeaders(drop ? withoutHeaders(req.headers, 'Content-Type') : req.headers)
  if (headers.length)
    args.unshift('headers=' + renderLiteral(new Ordered(headers), PYTHON_LITERAL, '    '))

  const fn = METHODS.has(req.method) ? 'requests.' + req.method.toLowerCase() : 'requests.request'
  const positional = METHODS.has(req.method)
    ? [pyString(req.url)]
    : [pyString(req.method), pyString(req.url)]
  const call = args.length
    ? `response = ${fn}(\n${[...positional, ...args].map((a) => '    ' + a + ',').join('\n')}\n)`
    : `response = ${fn}(${positional.join(', ')})`

  return ['import requests', '', call, '', 'print(response.text)'].join('\n')
}
