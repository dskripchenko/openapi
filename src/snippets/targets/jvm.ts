import type { HttpRequest } from '../../core/types'
import {
  hasControlChars,
  contentDisposition,
  encodeForm,
  javaInner,
  javaString,
  kotlinString,
  prepare,
  withoutHeaders,
} from '../common'

/** Headers java.net.http refuses to set. */
const JAVA_RESTRICTED = ['Connection', 'Content-Length', 'Expect', 'Host', 'Upgrade']

/** A text block (Java 15+) for multi-line text, else a quoted string. */
function javaText(text: string, indent: string): string {
  const unsafe = !text.includes('\n') || hasControlChars(text) || /[ \t]$/m.test(text)
  if (unsafe) return javaString(text)
  const escaped = text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""')
  const lines = escaped.split('\n').map((line) => (line ? indent + line : line))
  // Closing on the last line: no trailing newline in the value.
  return '"""\n' + lines.join('\n') + '"""'
}

export function javaHttpClient(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const imports = new Set([
    'java.net.URI',
    'java.net.http.HttpClient',
    'java.net.http.HttpRequest',
    'java.net.http.HttpResponse',
  ])
  const I2 = '        '
  const pre: string[] = []
  let publisher: string | undefined
  let headers = withoutHeaders(req.headers, ...JAVA_RESTRICTED)

  switch (body.kind) {
    case 'json':
    case 'text':
      publisher =
        'HttpRequest.BodyPublishers.ofString(' + javaText(body.text, I2 + '        ') + ')'
      break
    case 'urlencoded':
      publisher = 'HttpRequest.BodyPublishers.ofString(' + javaString(encodeForm(body.fields)) + ')'
      break
    case 'multipart': {
      for (const i of ['java.io.ByteArrayOutputStream', 'java.nio.charset.StandardCharsets'])
        imports.add(i)
      const write = (expr: string) =>
        pre.push(I2 + 'body.write(' + expr + '.getBytes(StandardCharsets.UTF_8));')
      pre.push(
        I2 + 'String boundary = "----OpenApiFormBoundary" + System.currentTimeMillis();',
        I2 + 'ByteArrayOutputStream body = new ByteArrayOutputStream();',
      )
      for (const field of body.fields) {
        if ('value' in field) {
          const part =
            '\r\nContent-Disposition: ' +
            contentDisposition(field.name) +
            '\r\n\r\n' +
            field.value +
            '\r\n'
          write('("--" + boundary + "' + javaInner(part) + '")')
          continue
        }
        const { filename, contentType, data } = field.file
        let head = '\r\nContent-Disposition: ' + contentDisposition(field.name, filename) + '\r\n'
        if (contentType) head += 'Content-Type: ' + contentType + '\r\n'
        write('("--" + boundary + "' + javaInner(head + '\r\n') + '")')
        if (data !== undefined) {
          write(javaString(data))
        } else {
          imports.add('java.nio.file.Files').add('java.nio.file.Path')
          pre.push(I2 + 'body.write(Files.readAllBytes(Path.of(' + javaString(filename) + ')));')
        }
        write('"\\r\\n"')
      }
      write('("--" + boundary + "--\\r\\n")')
      publisher = 'HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())'
      headers = [...headers, ['Content-Type', '\0boundary']]
      break
    }
  }

  const builder = [
    I2 + 'HttpRequest request = HttpRequest.newBuilder()',
    I2 + '    .uri(URI.create(' + javaString(req.url) + '))',
  ]
  for (const [k, v] of headers) {
    const value = v === '\0boundary' ? '"multipart/form-data; boundary=" + boundary' : javaString(v)
    builder.push(I2 + '    .header(' + javaString(k) + ', ' + value + ')')
  }
  let method: string
  if (publisher === undefined && (req.method === 'GET' || req.method === 'DELETE'))
    method = '.' + req.method + '()'
  else if (publisher !== undefined && (req.method === 'POST' || req.method === 'PUT'))
    method = '.' + req.method + '(' + publisher + ')'
  else
    method =
      '.method(' +
      javaString(req.method) +
      ', ' +
      (publisher ?? 'HttpRequest.BodyPublishers.noBody()') +
      ')'
  builder.push(I2 + '    ' + method, I2 + '    .build();')

  const sorted = [...imports].sort()
  return [
    ...sorted.map((i) => 'import ' + i + ';'),
    '',
    'public class Main {',
    '    public static void main(String[] args) throws Exception {',
    I2 + 'HttpClient client = HttpClient.newHttpClient();',
    ...(pre.length ? [...pre, ''] : []),
    ...builder,
    '',
    I2 +
      'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    I2 + 'System.out.println(response.body());',
    '    }',
    '}',
  ].join('\n')
}

/** A trimIndent raw string for multi-line text, else a quoted string. */
function kotlinText(text: string, indent: string): string {
  const lines = text.split('\n')
  const unsafe =
    lines.length < 2 ||
    hasControlChars(text) ||
    !lines[0]!.trim() ||
    !lines[lines.length - 1]!.trim() ||
    lines.some((line) => line !== '' && !line.trim())
  if (unsafe) return kotlinString(text)
  // Raw strings have no escapes: `$` and `"""` go through ${'…'} templates.
  const escaped = lines.map((line) =>
    line
      ? indent + '    ' + line.replace(/\$/g, () => "${'$'}").replace(/"""/g, () => `""\${'"'}`)
      : line,
  )
  return '"""\n' + escaped.join('\n') + '\n' + indent + '""".trimIndent()'
}

const OKHTTP_BODY_METHODS: Record<string, string> = {
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
}

export function kotlinOkHttp(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const imports = new Set(['okhttp3.OkHttpClient', 'okhttp3.Request'])
  const I = '    '
  const pre: string[] = []
  let hasBody = true

  switch (body.kind) {
    case 'json':
    case 'text': {
      imports
        .add('okhttp3.MediaType.Companion.toMediaType')
        .add('okhttp3.RequestBody.Companion.toRequestBody')
      const type = kotlinString(req.contentType ?? body.mediaType)
      pre.push(
        I + 'val body = ' + kotlinText(body.text, I) + '.toRequestBody(' + type + '.toMediaType())',
      )
      break
    }
    case 'urlencoded':
      imports.add('okhttp3.FormBody')
      pre.push(I + 'val body = FormBody.Builder()')
      for (const [k, v] of body.fields)
        pre.push(I + '    .add(' + kotlinString(k) + ', ' + kotlinString(v) + ')')
      pre.push(I + '    .build()')
      break
    case 'multipart':
      imports.add('okhttp3.MultipartBody')
      pre.push(I + 'val body = MultipartBody.Builder()', I + '    .setType(MultipartBody.FORM)')
      for (const field of body.fields) {
        if ('value' in field) {
          pre.push(
            I +
              '    .addFormDataPart(' +
              kotlinString(field.name) +
              ', ' +
              kotlinString(field.value) +
              ')',
          )
          continue
        }
        const { filename, contentType, data } = field.file
        let mediaType = ''
        if (contentType) {
          imports.add('okhttp3.MediaType.Companion.toMediaType')
          mediaType = kotlinString(contentType) + '.toMediaType()'
        }
        let part: string
        if (data !== undefined) {
          imports.add('okhttp3.RequestBody.Companion.toRequestBody')
          part = kotlinString(data) + '.toRequestBody(' + mediaType + ')'
        } else {
          imports.add('java.io.File').add('okhttp3.RequestBody.Companion.asRequestBody')
          part = 'File(' + kotlinString(filename) + ').asRequestBody(' + mediaType + ')'
        }
        pre.push(
          I +
            '    .addFormDataPart(' +
            [kotlinString(field.name), kotlinString(filename), part].join(', ') +
            ')',
        )
      }
      pre.push(I + '    .build()')
      break
    case 'none':
      hasBody = false
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        // OkHttp requires a body for these methods.
        imports.add('okhttp3.RequestBody.Companion.toRequestBody')
        pre.push(I + 'val body = "".toRequestBody()')
        hasBody = true
      }
      break
  }

  const builder = [
    I + 'val request = Request.Builder()',
    I + '    .url(' + kotlinString(req.url) + ')',
  ]
  const bodyMethod = OKHTTP_BODY_METHODS[req.method]
  if (bodyMethod && hasBody) builder.push(I + '    .' + bodyMethod + '(body)')
  else if (req.method === 'DELETE') builder.push(I + '    .delete()')
  else if (req.method === 'HEAD' && !hasBody) builder.push(I + '    .head()')
  else if (req.method !== 'GET' || hasBody) {
    builder.push(
      I + '    .method(' + kotlinString(req.method) + ', ' + (hasBody ? 'body' : 'null') + ')',
    )
  }
  // The body's media type sets Content-Type.
  const headers = body.kind === 'none' ? req.headers : withoutHeaders(req.headers, 'Content-Type')
  for (const [k, v] of headers)
    builder.push(I + '    .addHeader(' + kotlinString(k) + ', ' + kotlinString(v) + ')')
  builder.push(I + '    .build()')

  const sorted = [...imports].sort()
  return [
    ...sorted.map((i) => 'import ' + i),
    '',
    'fun main() {',
    I + 'val client = OkHttpClient()',
    ...pre,
    ...builder,
    '',
    I + 'client.newCall(request).execute().use { response ->',
    I + '    println(response.body?.string())',
    I + '}',
    '}',
  ].join('\n')
}
