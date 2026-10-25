import type { HttpRequest } from '../../core/types'
import {
  hasDuplicateKeys,
  JS_LITERAL,
  jsString,
  mergeHeaders,
  type Prepared,
  prepare,
  Raw,
  renderLiteral,
  renderPairs,
  withoutHeaders,
} from '../common'

const URLENCODED = 'application/x-www-form-urlencoded'

/** `new URLSearchParams({...})`, or the array form when names repeat. */
function urlSearchParams(fields: [string, string][], base: string): string {
  if (hasDuplicateKeys(fields)) {
    const items = fields.map(([k, v]) => new Raw('[' + jsString(k) + ', ' + jsString(v) + ']'))
    return 'new URLSearchParams(' + renderLiteral(items, JS_LITERAL, base) + ')'
  }
  return 'new URLSearchParams(' + renderPairs(fields, JS_LITERAL, base) + ')'
}

/** Drops Content-Type when the body object makes the client set the same value. */
function headersFor(req: Prepared, implied: string | undefined): [string, string][] {
  const drop = implied !== undefined && req.contentType?.toLowerCase() === implied
  return mergeHeaders(drop ? withoutHeaders(req.headers, 'Content-Type') : req.headers)
}

function headersProperty(headers: [string, string][]): string | undefined {
  return headers.length ? 'headers: ' + renderPairs(headers, JS_LITERAL, '  ') : undefined
}

export function javascriptFetch(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const pre: string[] = []
  let bodyExpr: string | undefined
  let implied: string | undefined

  switch (body.kind) {
    case 'json':
      bodyExpr =
        body.value !== undefined
          ? 'JSON.stringify(' + renderLiteral(body.value, JS_LITERAL, '  ') + ')'
          : jsString(body.text)
      break
    case 'text':
      bodyExpr = jsString(body.text)
      break
    case 'file':
      pre.push('const fileInput = document.querySelector(\'input[type="file"]\')', '')
      bodyExpr = 'fileInput.files[0]'
      break
    case 'urlencoded':
      bodyExpr = urlSearchParams(body.fields, '  ')
      implied = URLENCODED
      break
    case 'multipart': {
      let index = 0
      const needsInput = body.fields.some((f) => 'file' in f && f.file.data === undefined)
      if (needsInput) pre.push('const fileInput = document.querySelector(\'input[type="file"]\')')
      pre.push('const form = new FormData()')
      for (const field of body.fields) {
        if ('value' in field) {
          pre.push(`form.append(${jsString(field.name)}, ${jsString(field.value)})`)
        } else {
          const { filename, contentType, data } = field.file
          const blob =
            data !== undefined
              ? `new Blob([${jsString(data)}]${contentType ? `, { type: ${jsString(contentType)} }` : ''})`
              : `fileInput.files[${index++}]`
          pre.push(`form.append(${jsString(field.name)}, ${blob}, ${jsString(filename)})`)
        }
      }
      pre.push('')
      bodyExpr = 'form'
      break
    }
  }

  const options: string[] = []
  if (req.method !== 'GET') options.push('method: ' + jsString(req.method))
  const headers = headersProperty(headersFor(req, implied))
  if (headers) options.push(headers)
  if (bodyExpr !== undefined) options.push('body: ' + bodyExpr)

  const call = options.length
    ? `const response = await fetch(${jsString(req.url)}, {\n${options.map((o) => '  ' + o + ',').join('\n')}\n})`
    : `const response = await fetch(${jsString(req.url)})`
  return [...pre, call, '', 'console.log(await response.text())'].join('\n')
}

export function nodeAxios(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const imports = ["import axios from 'axios'"]
  const pre: string[] = []
  let data: string | undefined
  let implied: string | undefined

  switch (body.kind) {
    case 'json':
      if (body.value !== undefined) {
        data = renderLiteral(body.value, JS_LITERAL, '  ')
        implied = 'application/json'
      } else {
        data = jsString(body.text)
      }
      break
    case 'text':
      data = jsString(body.text)
      break
    case 'file':
      imports.push("import { readFile } from 'node:fs/promises'")
      data = 'await readFile(' + jsString(body.filename) + ')'
      break
    case 'urlencoded':
      data = urlSearchParams(body.fields, '  ')
      implied = URLENCODED
      break
    case 'multipart':
      if (body.fields.some((f) => 'file' in f && f.file.data === undefined)) {
        imports.push("import { openAsBlob } from 'node:fs'")
      }
      pre.push('const form = new FormData()')
      for (const field of body.fields) {
        if ('value' in field) {
          pre.push(`form.append(${jsString(field.name)}, ${jsString(field.value)})`)
        } else {
          const { filename, contentType, data: content } = field.file
          const type = contentType ? `{ type: ${jsString(contentType)} }` : undefined
          const blob =
            content !== undefined
              ? `new Blob([${jsString(content)}]${type ? ', ' + type : ''})`
              : `await openAsBlob(${jsString(filename)}${type ? ', ' + type : ''})`
          pre.push(`form.append(${jsString(field.name)}, ${blob}, ${jsString(filename)})`)
        }
      }
      pre.push('')
      data = 'form'
      break
  }

  const options = ['method: ' + jsString(req.method.toLowerCase()), 'url: ' + jsString(req.url)]
  const headers = headersProperty(headersFor(req, implied))
  if (headers) options.push(headers)
  if (data !== undefined) options.push('data: ' + data)

  return [
    ...imports,
    '',
    ...pre,
    'const response = await axios({',
    ...options.map((o) => '  ' + o + ','),
    '})',
    '',
    'console.log(response.data)',
  ].join('\n')
}
