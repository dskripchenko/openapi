import type { HttpRequest } from '../../core/types'
import { contentDisposition, goString, prepare } from '../common'

const T = '\t'
const TT = '\t\t'

/** A raw string literal when possible (keeps JSON readable), else a quoted one. */
function goText(text: string): string {
  return text.includes('`') || text.includes('\r') ? goString(text) : '`' + text + '`'
}

const PANIC = [T + 'if err != nil {', TT + 'panic(err)', T + '}']

export function goNative(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const imports = new Set(['fmt', 'io', 'net/http'])
  const lines: string[] = []
  let bodyVar = 'nil'
  let multipart = false

  switch (body.kind) {
    case 'json':
    case 'text':
      imports.add('strings')
      lines.push(T + 'body := strings.NewReader(' + goText(body.text) + ')')
      bodyVar = 'body'
      break
    case 'urlencoded':
      imports.add('net/url').add('strings')
      lines.push(T + 'form := url.Values{}')
      for (const [k, v] of body.fields) lines.push(T + `form.Add(${goString(k)}, ${goString(v)})`)
      lines.push(T + 'body := strings.NewReader(form.Encode())')
      bodyVar = 'body'
      break
    case 'multipart':
      imports.add('bytes').add('mime/multipart')
      multipart = true
      lines.push(T + 'body := &bytes.Buffer{}', T + 'writer := multipart.NewWriter(body)')
      for (const field of body.fields) {
        if ('value' in field) {
          lines.push(T + `writer.WriteField(${goString(field.name)}, ${goString(field.value)})`)
          continue
        }
        const { filename, contentType, data } = field.file
        // One block per file keeps the variable names free for the next one.
        lines.push(T + '{')
        if (contentType) {
          imports.add('net/textproto')
          lines.push(
            TT + 'header := make(textproto.MIMEHeader)',
            TT +
              `header.Set("Content-Disposition", ${goString(contentDisposition(field.name, filename))})`,
            TT + `header.Set("Content-Type", ${goString(contentType)})`,
            TT + 'part, err := writer.CreatePart(header)',
          )
        } else {
          lines.push(
            TT +
              `part, err := writer.CreateFormFile(${goString(field.name)}, ${goString(filename)})`,
          )
        }
        lines.push(...PANIC.map((l) => T + l))
        if (data !== undefined) {
          lines.push(TT + `part.Write([]byte(${goString(data)}))`)
        } else {
          imports.add('os')
          lines.push(
            TT + `content, err := os.ReadFile(${goString(filename)})`,
            ...PANIC.map((l) => T + l),
          )
          lines.push(TT + 'part.Write(content)')
        }
        lines.push(T + '}')
      }
      lines.push(T + 'writer.Close()')
      bodyVar = 'body'
      break
  }

  if (lines.length) lines.push('')
  lines.push(
    T + `req, err := http.NewRequest(${goString(req.method)}, ${goString(req.url)}, ${bodyVar})`,
    ...PANIC,
  )
  const seen = new Set<string>()
  for (const [k, v] of req.headers) {
    // Add keeps repeated headers; Set reads better for the usual single value.
    const fn = seen.has(k.toLowerCase()) ? 'Add' : 'Set'
    seen.add(k.toLowerCase())
    lines.push(T + `req.Header.${fn}(${goString(k)}, ${goString(v)})`)
  }
  if (multipart) lines.push(T + 'req.Header.Set("Content-Type", writer.FormDataContentType())')
  lines.push(
    '',
    T + 'res, err := http.DefaultClient.Do(req)',
    ...PANIC,
    T + 'defer res.Body.Close()',
    '',
    T + 'data, err := io.ReadAll(res.Body)',
    ...PANIC,
    T + 'fmt.Println(string(data))',
  )

  const sorted = [...imports].sort()
  return [
    'package main',
    '',
    'import (',
    ...sorted.map((i) => T + '"' + i + '"'),
    ')',
    '',
    'func main() {',
    ...lines,
    '}',
  ].join('\n')
}
