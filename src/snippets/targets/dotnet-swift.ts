import type { HttpRequest } from '../../core/types'
import {
  hasControlChars,
  contentDisposition,
  csString,
  encodeForm,
  mediaTypeOnly,
  prepare,
  swiftInner,
  swiftString,
  withoutHeaders,
} from '../common'

/* ------------------------------ C# ------------------------------ */

/** A raw string literal (C# 11) for multi-line text, else a quoted string. */
function csText(text: string, indent: string): string {
  if (!text.includes('\n') || hasControlChars(text)) return csString(text)
  const longest = Math.max(0, ...(text.match(/"+/g) ?? []).map((q) => q.length))
  const quotes = '"'.repeat(Math.max(3, longest + 1))
  const lines = text.split('\n').map((line) => (line ? indent + line : line))
  return quotes + '\n' + lines.join('\n') + '\n' + indent + quotes
}

const CS_METHODS: Record<string, string> = {
  GET: 'Get',
  POST: 'Post',
  PUT: 'Put',
  PATCH: 'Patch',
  DELETE: 'Delete',
  HEAD: 'Head',
  OPTIONS: 'Options',
  TRACE: 'Trace',
}

export function csharpHttpClient(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const usings = new Set(['System', 'System.Net.Http'])
  const method = CS_METHODS[req.method]
    ? 'HttpMethod.' + CS_METHODS[req.method]
    : 'new HttpMethod(' + csString(req.method) + ')'
  const lines = [
    'using var client = new HttpClient();',
    'using var request = new HttpRequestMessage(' + method + ', ' + csString(req.url) + ');',
  ]
  // Content-Type belongs to the content, not to the request headers.
  for (const [k, v] of withoutHeaders(req.headers, 'Content-Type')) {
    lines.push('request.Headers.Add(' + csString(k) + ', ' + csString(v) + ');')
  }

  switch (body.kind) {
    case 'json':
    case 'text': {
      usings.add('System.Text')
      const type = csString(mediaTypeOnly(req.contentType ?? body.mediaType))
      lines.push(
        'request.Content = new StringContent(' +
          csText(body.text, '    ') +
          ', Encoding.UTF8, ' +
          type +
          ');',
      )
      break
    }
    case 'file':
      usings.add('System.IO').add('System.Net.Http.Headers')
      lines.push(
        'request.Content = new ByteArrayContent(File.ReadAllBytes(' +
          csString(body.filename) +
          '));',
        'request.Content.Headers.ContentType = new MediaTypeHeaderValue(' +
          csString(mediaTypeOnly(req.contentType ?? body.mediaType)) +
          ');',
      )
      break
    case 'urlencoded':
      usings.add('System.Collections.Generic')
      lines.push('request.Content = new FormUrlEncodedContent(new[]', '{')
      for (const [k, v] of body.fields) {
        lines.push(
          '    new KeyValuePair<string, string>(' + csString(k) + ', ' + csString(v) + '),',
        )
      }
      lines.push('});')
      break
    case 'multipart': {
      lines.push('var content = new MultipartFormDataContent();')
      let n = 0
      for (const field of body.fields) {
        if ('value' in field) {
          lines.push(
            'content.Add(new StringContent(' +
              csString(field.value) +
              '), ' +
              csString(field.name) +
              ');',
          )
          continue
        }
        const { filename, contentType, data } = field.file
        const file = 'file' + ++n
        if (data !== undefined) {
          lines.push('var ' + file + ' = new StringContent(' + csString(data) + ');')
        } else {
          usings.add('System.IO')
          lines.push(
            'var ' +
              file +
              ' = new ByteArrayContent(File.ReadAllBytes(' +
              csString(filename) +
              '));',
          )
        }
        if (contentType) {
          usings.add('System.Net.Http.Headers')
          lines.push(
            file +
              '.Headers.ContentType = new MediaTypeHeaderValue(' +
              csString(contentType) +
              ');',
          )
        }
        lines.push(
          'content.Add(' + file + ', ' + csString(field.name) + ', ' + csString(filename) + ');',
        )
      }
      lines.push('request.Content = content;')
      break
    }
  }

  lines.push(
    '',
    'using var response = await client.SendAsync(request);',
    'Console.WriteLine(await response.Content.ReadAsStringAsync());',
  )
  const sorted = [...usings].sort()
  return [...sorted.map((u) => 'using ' + u + ';'), '', ...lines].join('\n')
}

/* ------------------------------ Swift ------------------------------ */

/** A multi-line string literal for multi-line text, else a quoted string. */
function swiftText(text: string): string {
  if (!text.includes('\n') || hasControlChars(text)) return swiftString(text)
  const escaped = text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""')
  const lines = escaped.split('\n').map((line) => (line ? '    ' + line : line))
  return '"""\n' + lines.join('\n') + '\n    """'
}

export function swiftUrlSession(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const lines = [
    'import Foundation',
    '',
    'var request = URLRequest(url: URL(string: ' + swiftString(req.url) + ')!)',
    'request.httpMethod = ' + swiftString(req.method),
  ]
  const seen = new Set<string>()
  for (const [k, v] of req.headers) {
    const fn = seen.has(k.toLowerCase()) ? 'addValue' : 'setValue'
    seen.add(k.toLowerCase())
    lines.push(
      'request.' + fn + '(' + swiftString(v) + ', forHTTPHeaderField: ' + swiftString(k) + ')',
    )
  }

  switch (body.kind) {
    case 'json':
    case 'text':
      lines.push('request.httpBody = ' + swiftText(body.text) + '.data(using: .utf8)')
      break
    case 'file':
      lines.push(
        'request.httpBody = try Data(contentsOf: URL(fileURLWithPath: ' +
          swiftString(body.filename) +
          '))',
      )
      break
    case 'urlencoded':
      lines.push(
        'request.httpBody = ' + swiftString(encodeForm(body.fields)) + '.data(using: .utf8)',
      )
      break
    case 'multipart': {
      const append = (inner: string) =>
        lines.push('body.append("' + inner + '".data(using: .utf8)!)')
      lines.push(
        '',
        'let boundary = "Boundary-\\(UUID().uuidString)"',
        'request.setValue("' +
          swiftInner(mediaTypeOnly(body.mediaType)) +
          '; boundary=\\(boundary)", forHTTPHeaderField: "Content-Type")',
        'var body = Data()',
      )
      for (const field of body.fields) {
        if ('value' in field) {
          append(
            '--\\(boundary)' +
              swiftInner(
                '\r\nContent-Disposition: ' +
                  contentDisposition(field.name) +
                  '\r\n\r\n' +
                  field.value +
                  '\r\n',
              ),
          )
          continue
        }
        const { filename, contentType, data } = field.file
        let head = '\r\nContent-Disposition: ' + contentDisposition(field.name, filename) + '\r\n'
        if (contentType) head += 'Content-Type: ' + contentType + '\r\n'
        append('--\\(boundary)' + swiftInner(head + '\r\n'))
        if (data !== undefined) append(swiftInner(data))
        else
          lines.push(
            'body.append(try Data(contentsOf: URL(fileURLWithPath: ' +
              swiftString(filename) +
              ')))',
          )
        append('\\r\\n')
      }
      append('--\\(boundary)--\\r\\n')
      lines.push('request.httpBody = body')
      break
    }
  }

  lines.push(
    '',
    'let (data, _) = try await URLSession.shared.data(for: request)',
    'print(String(decoding: data, as: UTF8.self))',
  )
  return lines.join('\n')
}
