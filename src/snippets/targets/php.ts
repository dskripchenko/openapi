import type { HttpRequest } from '../../core/types'
import {
  encodeForm,
  hasDuplicateKeys,
  indentLines,
  mergeHeaders,
  type MultipartField,
  Ordered,
  PHP_LITERAL,
  phpString,
  prepare,
  Raw,
  renderLiteral,
  withoutHeaders,
} from '../common'

const URLENCODED = 'application/x-www-form-urlencoded'

/**
 * A multi-line text as a flexible nowdoc (PHP 7.3+), falling back to a
 * quoted string when the text could end the nowdoc early or mixes tabs in.
 */
function phpText(text: string): string {
  const safe =
    text.includes('\n') &&
    !/^[ \t]*BODY\b/m.test(text) &&
    !/^\t/m.test(text) &&
    !text.includes('\r')
  if (!safe) return phpString(text)
  const lines = text.split('\n').map((line) => (line ? '    ' + line : line))
  return "<<<'BODY'\n" + lines.join('\n') + '\n    BODY'
}

function fopen(filename: string): Raw {
  return new Raw('fopen(' + phpString(filename) + ", 'r')")
}

function guzzleMultipart(fields: MultipartField[]): Ordered[] {
  return fields.map((field) => {
    if ('value' in field) {
      return new Ordered([
        ['name', field.name],
        ['contents', field.value],
      ])
    }
    const { filename, contentType, data } = field.file
    const entries: [string, unknown][] = [
      ['name', field.name],
      ['contents', data !== undefined ? data : fopen(filename)],
      ['filename', filename],
    ]
    if (contentType) entries.push(['headers', new Ordered([['Content-Type', contentType]])])
    return new Ordered(entries)
  })
}

export function phpGuzzle(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const options: [string, unknown][] = []
  let implied: string | undefined
  let bodyOption: [string, unknown] | undefined

  switch (body.kind) {
    case 'json':
      // The `json` option sets Content-Type only when the request has none.
      if (body.value !== undefined) {
        bodyOption = ['json', body.value]
        implied = 'application/json'
      } else {
        bodyOption = ['body', new Raw(phpText(body.text))]
      }
      break
    case 'text':
      bodyOption = ['body', new Raw(phpText(body.text))]
      break
    case 'file':
      bodyOption = ['body', fopen(body.filename)]
      break
    case 'urlencoded':
      // form_params goes through http_build_query: repeated names need the raw body.
      if (hasDuplicateKeys(body.fields)) {
        bodyOption = ['body', encodeForm(body.fields)]
      } else {
        bodyOption = ['form_params', new Ordered(body.fields)]
        implied = URLENCODED
      }
      break
    case 'multipart':
      bodyOption = ['multipart', guzzleMultipart(body.fields)]
      break
  }

  const drop = implied !== undefined && req.contentType?.toLowerCase() === implied
  const headers = mergeHeaders(drop ? withoutHeaders(req.headers, 'Content-Type') : req.headers)
  if (headers.length) options.push(['headers', new Ordered(headers)])
  if (bodyOption) options.push(bodyOption)

  const args = phpString(req.method) + ', ' + phpString(req.url)
  const call = options.length
    ? '$response = $client->request(' +
      args +
      ', ' +
      renderLiteral(new Ordered(options), PHP_LITERAL) +
      ');'
    : '$response = $client->request(' + args + ');'

  return [
    '<?php',
    '',
    "require __DIR__ . '/vendor/autoload.php';",
    '',
    'use GuzzleHttp\\Client;',
    '',
    '$client = new Client();',
    '',
    call,
    '',
    'echo $response->getBody();',
  ].join('\n')
}

/** Short chains stay on one line; longer ones put each call after the first on its own line. */
function laravelChain(calls: string[]): string {
  if (calls.length <= 2) return calls.join('->')
  const [first, ...rest] = calls
  return first + rest.map((call) => '\n    ->' + indentLines(call, '    ').trimStart()).join('')
}

const LARAVEL_DATA_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const LARAVEL_METHODS = new Set(['GET', 'HEAD', ...LARAVEL_DATA_METHODS])

export function phpLaravel(request: HttpRequest): string {
  const req = prepare(request)
  const { body } = req
  const canData = LARAVEL_DATA_METHODS.has(req.method)
  const chain: string[] = []
  let headers = req.headers
  let data: string | undefined

  // Bearer tokens read better as withToken().
  const auth = headers.filter(([k]) => k.toLowerCase() === 'authorization')
  const bearer = auth.length === 1 ? /^Bearer (.+)$/.exec(auth[0]![1]) : null
  if (bearer) headers = withoutHeaders(headers, 'Authorization')

  const withBody = (text: string, contentType: string) => {
    chain.push('withBody(' + phpText(text) + ', ' + phpString(contentType) + ')')
    headers = withoutHeaders(headers, 'Content-Type')
  }

  switch (body.kind) {
    case 'json': {
      const structured = typeof body.value === 'object' && body.value !== null
      if (canData && structured) {
        data = renderLiteral(body.value, PHP_LITERAL)
        if (req.contentType?.toLowerCase() === 'application/json')
          headers = withoutHeaders(headers, 'Content-Type')
      } else {
        withBody(body.text, req.contentType ?? body.mediaType)
      }
      break
    }
    case 'text':
      withBody(body.text, req.contentType ?? body.mediaType)
      break
    case 'file':
      chain.push(
        'withBody(file_get_contents(' +
          phpString(body.filename) +
          '), ' +
          phpString(req.contentType ?? body.mediaType) +
          ')',
      )
      headers = withoutHeaders(headers, 'Content-Type')
      break
    case 'urlencoded':
      if (canData && !hasDuplicateKeys(body.fields)) {
        chain.push('asForm()')
        data = renderLiteral(new Ordered(body.fields), PHP_LITERAL)
        headers = withoutHeaders(headers, 'Content-Type')
      } else {
        withBody(encodeForm(body.fields), req.contentType ?? URLENCODED)
      }
      break
    case 'multipart': {
      const texts: [string, string][] = []
      for (const field of body.fields) {
        if ('value' in field) {
          texts.push([field.name, field.value])
          continue
        }
        const { filename, contentType, data: content } = field.file
        const args = [
          phpString(field.name),
          content !== undefined ? phpString(content) : fopen(filename).code,
          phpString(filename),
        ]
        if (contentType)
          args.push('[' + phpString('Content-Type') + ' => ' + phpString(contentType) + ']')
        chain.push('attach(' + args.join(', ') + ')')
      }
      if (!body.fields.some((f) => 'file' in f)) chain.push('asMultipart()')
      if (texts.length && canData) {
        // Repeated names need the explicit name/contents form.
        const value = hasDuplicateKeys(texts)
          ? texts.map(
              ([name, contents]) =>
                new Ordered([
                  ['name', name],
                  ['contents', contents],
                ]),
            )
          : new Ordered(texts)
        data = renderLiteral(value, PHP_LITERAL)
      }
      break
    }
  }

  const merged = mergeHeaders(headers)
  if (merged.length)
    chain.unshift('withHeaders(' + renderLiteral(new Ordered(merged), PHP_LITERAL) + ')')
  if (bearer) chain.splice(merged.length ? 1 : 0, 0, 'withToken(' + phpString(bearer[1]!) + ')')

  const url = phpString(req.url)
  if (LARAVEL_METHODS.has(req.method)) {
    chain.push(req.method.toLowerCase() + '(' + url + (data !== undefined ? ', ' + data : '') + ')')
  } else {
    chain.push('send(' + phpString(req.method) + ', ' + url + ')')
  }

  return [
    '<?php',
    '',
    'use Illuminate\\Support\\Facades\\Http;',
    '',
    '$response = Http::' + laravelChain(chain) + ';',
    '',
    'echo $response->body();',
  ].join('\n')
}
