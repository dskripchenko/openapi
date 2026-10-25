# Core API

Everything on this page is exported from `@dskripchenko/openapi`. The core
has no dependencies and does not touch the DOM, so it runs the same in a
browser, in Node 20+ and in a build script.

## Loading a spec

```ts
import { loadSpec } from '@dskripchenko/openapi'

const spec = loadSpec(text)
```

`loadSpec(input, options?)` takes YAML or JSON text, or an already parsed
object, and returns a `LoadedSpec`:

| Field | |
|---|---|
| `source` | `{ family, version, raw, format? }` — the input as it was: `family` is `'swagger2'`, `'openapi30'` or `'openapi31'`, `version` the declared version, `raw` the parsed object, `format` `'yaml'` or `'json'` when text was given. |
| `document` | The document normalized to OpenAPI 3.1 (see [normalization](#normalization)). |
| `resolver` | Resolves `$ref`s of `document` (see [references](#references)). |
| `operations` | Every operation of `paths` and `webhooks`, in document order (`OperationEntry[]`). |
| `groups` | The operations grouped by tag (`OperationGroup[]`). |
| `tagGroups` | Groups of tags from `x-tagGroups`, when the document has them. |
| `warnings` | Notes from normalization, such as a missing `info`. |
| `positions` | Source positions of `raw` (when text was given). |

The only option is `external`, a loader for external references, described
under [references](#references).

`loadSpec` throws `YamlError` or `JsonError` when the text cannot be read,
and `OpenApiError` when the value is not a Swagger 2.0 or OpenAPI 3.x
document. Versions above 3.1 (3.2) are read as 3.1.

```ts
import { loadSpec, JsonError, OpenApiError, YamlError } from '@dskripchenko/openapi'

try {
  loadSpec(text)
} catch (error) {
  if (error instanceof YamlError || error instanceof JsonError) {
    error.line     // 1-based
    error.column   // 1-based
    error.reason   // the message without the position
  } else if (error instanceof OpenApiError) {
    error.message  // 'Not an OpenAPI document: neither "openapi" nor "swagger" field found'
  }
}
```

`loadDocument(raw, { positions?, format?, external? })` does the same for an
object you parsed yourself, keeping the positions you pass.

### Operations

An `OperationEntry` has:

| Field | |
|---|---|
| `id` | The `operationId`, or a slug of the method and path (`get-pets-id`); unique within the document. |
| `method` | `'get'`, `'post'`, … (lower case). |
| `path` | The path template, or the webhook's name. |
| `operation`, `pathItem` | The objects from the document. |
| `tags` | The operation's tags, `['default']` when it has none. |
| `parameters` | Path-level and operation-level parameters merged (the operation's win), dereferenced. |
| `deprecated` | `boolean`. |
| `webhook` | The webhook's name, for operations of `webhooks`. |

An `OperationGroup` is `{ name, displayName, description?, tag?, operations }`.
`displayName` is the tag's `x-displayName`, or its name. Declared tags come
first in their order, then tags met only on operations; an operation with
several tags is in each of their groups.

`listOperations(document, resolver)` and `groupByTag(document, operations)`
are the two steps on their own; `DEFAULT_TAG` is `'default'`.

## Parsers

```ts
import { parseSpec, parseYaml, parseJson, detectFormat } from '@dskripchenko/openapi'

const { value, positions, format } = parseSpec(text)   // format detected
const yaml = parseYaml(text)                           // { value, positions }
const json = parseJson(text)                           // { value, positions }
detectFormat('  {"openapi": "3.1.0"}')                 // 'json'
```

`detectFormat` says `'json'` when the first character other than whitespace
is `{` or `[`, `'yaml'` otherwise. `parseSpec(text, format?)` uses it unless
you name the format.

Both parsers return `positions`: a `Map` from a JSON Pointer to the place in
the text where the value starts, `{ line, column }`, both 1-based. An object
member points at its key, an array item at the item, the root (`''`) at 1:1.

```ts
const { positions } = parseYaml(text)
positions.get('/paths/~1pets~1{id}/get')   // { line: 9, column: 5 }
```

**YAML.** The parser covers what specs use: block mappings and sequences,
flow collections `{}` and `[]`, plain, single- and double-quoted scalars with
escapes, block scalars `|` and `>` with chomping (`-`, `+`) and indentation
indicators, comments, `---` and `...`, anchors `&a`, aliases `*a` and the
merge key `<<`. Scalars follow the core schema: `null`, `true`/`false`,
decimal, hex (`0x`) and octal (`0o`) integers, floats, `.inf` and `.nan`.
Tags are ignored, except `!!str`, which keeps a scalar a string. One document
per text. A syntax error throws `YamlError`.

**JSON.** Strict RFC 8259. A UTF-8 BOM is accepted. Unlike `JSON.parse`, a
duplicate key is an error, since in a spec it is always a mistake. A syntax
error throws `JsonError`.

### Writing

```ts
import { stringifySpec, stringifyYaml, stringifyJson } from '@dskripchenko/openapi'

stringifySpec(value, 'yaml')                 // YAML, 2-space indent
stringifySpec(value, 'json')                 // JSON, 2-space indent
stringifyYaml(value, { indent: 4, lineWidth: 0 })
stringifyJson(value, 2)
```

`stringifyYaml` is deterministic: key order is kept, a scalar is quoted only
when without quotes it would read back as something else, and multi-line
strings are written as `|` blocks. `indent` is 1–8 spaces (default 2);
single-line strings longer than `lineWidth` (default 80) are folded at
spaces as `>-` blocks, and `lineWidth: 0` turns folding off. Comments of a
parsed text are not kept: the parser does not record them.

## Normalization

```ts
import { normalize, detectVersion } from '@dskripchenko/openapi'

detectVersion(raw)                    // { family: 'swagger2', version: '2.0' }
const { document, warnings } = normalize(raw)
document.openapi                      // '3.1.0'
```

`normalize` brings any supported document to the OpenAPI 3.1 shape. It does
not change its input; the result shares nothing with it.

From **Swagger 2.0**:

- `host`, `basePath` and `schemes` become `servers`;
- a `body` parameter and `consumes` / `produces` become `requestBody` and
  response `content`;
- `formData` parameters become an `application/x-www-form-urlencoded` or
  `multipart/form-data` body;
- `definitions` become `components.schemas`, `securityDefinitions`
  `components.securitySchemes`, and every `$ref` is rewritten to match.

From **OpenAPI 3.0**:

- `nullable: true` becomes a type with `'null'` (`type: [string, 'null']`);
- boolean `exclusiveMinimum` / `exclusiveMaximum` become the numeric form;
- a schema's `example` is kept as well.

`upgradeSchema30(schema)` applies the 3.0 → 3.1 schema rules to a single
schema and returns the result. It works on the object it is given; pass a
copy to keep the original.

## References

```ts
import { createResolver } from '@dskripchenko/openapi'

const resolver = createResolver(document, { external })

resolver.get('#/components/schemas/Pet')          // one step
resolver.deref({ $ref: '#/components/schemas/Pet' }) // the whole chain
resolver.isCircular('#/components/schemas/Node')  // true for a self-referencing schema
```

- `get(ref)` returns what the reference points to, or `undefined`.
- `deref(value)` follows a chain of references to a concrete value and
  returns a value that is not a reference unchanged; a broken or circular
  chain gives `undefined`.
- `isCircular(ref)` tells whether the structure behind `ref` leads back to it.

`loadSpec` creates the resolver for you as `spec.resolver`.

**External references** (`common.yaml#/Pet`) are resolved only through the
`external` option: a synchronous function that receives the URL part of the
reference as written and returns the parsed document, or `undefined`. Its
result is cached per URL; an exception counts as `undefined`. Without
`external` nothing outside the document is loaded:

```ts
const common = parseSpec(commonText).value
const spec = loadSpec(text, { external: (url) => (url === 'common.yaml' ? common : undefined) })
```

## Validation

```ts
import { parseSpec, validateDocument } from '@dskripchenko/openapi'

const { value, positions } = parseSpec(text)
const issues = validateDocument(value, { positions })
// [{ pointer: '/paths/~1a~1{id}/get', message: 'Path parameter "id" of "/a/{id}" is not defined',
//    severity: 'error', line: 6, column: 5 }]
```

`validateDocument(raw, { positions? })` checks the raw document — 2.0, 3.0
or 3.1, before normalization — and returns `DocumentIssue[]`:
`{ pointer, message, severity: 'error' | 'warning', line?, column? }`. With
`positions` from the parser every issue gets its line. It never throws; an
object that is not a spec gives one error.

It checks the structure a renderer relies on, not every rule of the
specification: required fields (`info.title`, `info.version`, `paths`,
`responses`, a response's `description`, a parameter's `name` and `in`),
paths starting with `/`, path parameters that are declared and required,
duplicate parameters and `operationId`s, status codes, server variables,
the fields each security scheme type needs, tags used but not declared,
references that do not resolve, and unknown top-level fields.

## Schemas

The schema functions take a `resolve` function, `(ref: string) => Schema |
undefined`, to follow `$ref`s. With a loaded spec:

```ts
import { loadSpec, sampleSchema, sampleXml, validateValue, describeSchema, type Schema } from '@dskripchenko/openapi'

const spec = loadSpec(text)
const resolve = (ref: string) => spec.resolver.get(ref) as Schema | undefined
const pet: Schema = { $ref: '#/components/schemas/Pet' }
```

### Samples

```ts
sampleSchema(pet, { resolve, mode: 'response' })  // { id: 0, name: 'Rex', tag: 'string' }
sampleSchema(pet, { resolve, mode: 'request' })   // { name: 'Rex', tag: 'string' } — readOnly id left out
sampleXml(pet, { resolve })                       // '<?xml version="1.0" encoding="UTF-8"?>\n<Pet>…</Pet>'
```

`sampleSchema(schema, options?)` builds an example value. It takes, in order,
`example`, the first of `examples`, `default`, `const`, the first `enum`
value, and otherwise generates one by type. Strings with a known `format`
get a fixed value (`FORMAT_SAMPLES`: `date-time`, `date`, `time`, `email`,
`uuid`, `uri`, `hostname`, `ipv4`, `ipv6`, `byte`, `binary`, `password` and
more); `minLength`, `pattern`, numeric ranges and `minItems` are respected.
`allOf` is merged, `oneOf` and `anyOf` take their first branch.

Options: `mode` — `'request'` leaves out `readOnly` properties, `'response'`
leaves out `writeOnly` ones; `maxDepth` — the nesting limit, deeper levels
become `{}` or `[]` (default 8); `preferExamples` — use `example` / `examples`
(default `true`). A schema that refers to itself produces `{}` where the
cycle closes. The result is deterministic: the same schema always gives the
same sample.

`sampleXml(schema, options?)` writes the sample as an XML document, following
the schema's `xml` hints (`name`, `attribute`, `wrapped`, namespaces). The
root element is named by `xml.name`, the referenced schema's name, or `root`.

### Validating a value

```ts
validateValue({ name: 5 }, pet, { resolve })
// [{ path: '', message: "must have required property 'id'", keyword: 'required' },
//  { path: '/name', message: 'must be string', keyword: 'type' }]
```

`validateValue(value, schema, { resolve?, mode? })` checks a value against
JSON Schema 2020-12 as OpenAPI 3.1 uses it, tolerating 3.0's `nullable` and
boolean exclusive bounds. It returns every `ValidationIssue` —
`{ path, message, keyword }`, `path` being a JSON Pointer into the value — and
an empty list when the value is valid. With `mode: 'request'` a `readOnly`
property is an error, with `'response'` a `writeOnly` one.

### Describing a type

```ts
describeSchema(pet)                                       // 'Pet'
describeSchema({ type: 'array', items: pet })             // 'array<Pet>'
describeSchema({ type: ['string', 'null'], format: 'uuid' }) // 'string<uuid> | null'
```

`describeSchema(schema, { resolve? })` gives the short type label the
reference shows next to a field: `string<uuid>`, `array<Pet>`,
`oneOf: Cat | Dog`, `string | null` and so on.

## Requests

`HttpRequest` is the shape the samples print and try-it sends:
`{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`.

### Building a request

```ts
import { buildRequest, serverUrl } from '@dskripchenko/openapi'

const op = spec.operations.find((o) => o.id === 'uploadPhoto')!
const request = buildRequest({
  method: op.method,
  path: op.path,                                    // '/pets/{id}/photo'
  server: serverUrl(spec.document.servers![0]!),    // 'https://api.example.com'
  parameters: op.parameters,
  values: { path: { id: 42 }, query: { size: 'large' } },
  body: {
    mediaType: 'multipart/form-data',
    value: { caption: 'Rex at the beach', photo: { filename: 'rex.png', contentType: 'image/png' } },
  },
  security: [{ scheme: { type: 'apiKey', name: 'X-API-Key', in: 'header' }, value: 'secret' }],
})
```

`buildRequest(input)` takes:

| Field | |
|---|---|
| `method`, `path` | The method and the path template. |
| `server` | The base URL, already resolved with `serverUrl`; may be relative. |
| `parameters` | The operation's dereferenced parameters (`OperationEntry.parameters`). |
| `values` | Values by location and name: `{ path?, query?, header?, cookie? }`. |
| `body` | `{ mediaType, value, encoding? }` — an object for structured media types, or the text as typed. |
| `security` | `AppliedSecurity[]`: `{ scheme, value }` — a key or token, or `{ username, password }` for basic. |

It follows the specification's rules:

- parameters are serialized by `style` and `explode` — path `simple`, `label`,
  `matrix`; query `form`, `spaceDelimited`, `pipeDelimited`, `deepObject`;
  header `simple`; cookie `form` — and parameters with `content` are written
  as that media type;
- a path placeholder without a value stays as `{name}`;
- empty optional values are left out; an empty string is kept only with
  `allowEmptyValue`;
- header parameters named `Accept`, `Content-Type` and `Authorization` are
  ignored, as the specification requires;
- cookies, from parameters and API keys, go into one `Cookie` header;
- `Content-Type` is set from the body's media type, except for multipart,
  where the HTTP client adds it with the boundary;
- a JSON body is serialized, a urlencoded body is encoded by its `encoding`,
  and a multipart body keeps file fields as `{ filename, contentType?, data? }`
  (`data` is a `Blob` or a string); objects in multipart fields become JSON,
  arrays repeat the field.

### Parameters and servers on their own

```ts
import { serializeParam, serverUrl, joinUrl } from '@dskripchenko/openapi'

serializeParam({ name: 'ids', in: 'query', style: 'form', explode: false }, [1, 2, 3])
// { in: 'query', name: 'ids', pairs: [['ids', '1,2,3']] }
serializeParam({ name: 'filter', in: 'query', style: 'deepObject', explode: true }, { color: 'red' })
// { in: 'query', name: 'filter', pairs: [['filter[color]', 'red']] }
serializeParam({ name: 'id', in: 'path', style: 'matrix' }, 5)
// { in: 'path', name: 'id', value: ';id=5' }

serverUrl({ url: 'https://{region}.example.com', variables: { region: { default: 'eu' } } }, { region: 'us' })
// 'https://us.example.com'
joinUrl('https://api.example.com/v1/', '/pets')   // 'https://api.example.com/v1/pets'
```

`serializeParam(param, value)` returns path and header values ready to use
and query and cookie pairs already percent-encoded; `undefined` means "leave
the parameter out". `serializeValue(location, name, value, { style, explode,
allowReserved, raw })` is the same without a parameter object, and
`defaultStyle(location)` gives the default style of a location.
`serverUrl(server, variables?)` fills server variables (given values, then
defaults); `joinUrl(base, path)` puts exactly one slash between them and keeps
a relative base relative.

`applySecurity(list)` turns `AppliedSecurity[]` into
`{ headers, query, cookies }`, and `basicAuth(username, password)` gives the
`Basic …` header value. The small encoders the builder uses are exported
too: `encodeComponent`, `encodeCookie`, `base64Utf8`, `baseMediaType`,
`isJsonMediaType`, `isFormUrlEncoded`, `isMultipart`.

### Sending

```ts
import { sendRequest } from '@dskripchenko/openapi'

const response = await sendRequest(request, { credentials: 'same-origin' })
response.status     // 0 when there was no response
response.error      // the reason in that case: network, CORS
response.body       // the body as text
response.duration   // milliseconds
```

`sendRequest(request, { fetch?, signal?, credentials? })` sends with `fetch`
(the global one unless you pass another) and reads the body as text. It never
throws: a failure before a response comes back as `status: 0` with `error`
set. `credentials` defaults to `'same-origin'`, so cookies are never sent to
a foreign API. For a multipart body it removes `Content-Type` so that `fetch`
sets it with the boundary. In a browser, headers the browser forbids
(`Cookie`, `Host`, `Origin`, …) are dropped by the browser itself.

`toFetchBody(request)` gives the `fetch` body on its own: `FormData` for
multipart, `URLSearchParams` for urlencoded forms, the text otherwise.

`SendFn` — `(request: HttpRequest) => Promise<HttpResponse>` — is the type of
the transport the reference accepts; see
[sending through your server](reference.md#sending-through-your-server).

### OAuth2 tokens

```ts
import { fetchOAuthToken } from '@dskripchenko/openapi'

const token = await fetchOAuthToken('clientCredentials', {
  tokenUrl: 'https://auth.example.com/token',
  clientId: 'my-client',
  clientSecret: 'my-secret',
  scopes: ['pets:read'],
})
token.accessToken   // string
token.tokenType     // 'Bearer', when the server says so
token.expiresIn     // seconds, when the server says so
```

`fetchOAuthToken(flow, options)` requests a token with the
`client_credentials` (RFC 6749 §4.4) or `password` (§4.3, with `username` and
`password` in the options) grant. With a client secret the client
authenticates with HTTP Basic; without one `client_id` goes into the form.
Options also take `fetch` and `signal`. On failure it rejects with an error
carrying the server's `error_description` or `error`, or the HTTP status.

## Code samples

```ts
import { generateSnippet, SNIPPET_TARGETS } from '@dskripchenko/openapi'

generateSnippet('python-requests', request)
SNIPPET_TARGETS   // [{ id: 'curl', label: 'cURL', language: 'bash' }, …]
```

`generateSnippet(target, request)` prints an `HttpRequest` as runnable code;
an unknown target throws. The 13 targets are listed in
[code samples](snippets.md).

## Types

The document types (`OpenApiDocument`, `Operation`, `Parameter`, `Schema`,
`SecurityScheme` and the rest), the HTTP types (`HttpRequest`,
`HttpResponse`, `FormValue`), `Position` and `PositionMap` are exported as
types. `HTTP_METHODS` is the list of the eight methods of a path item. The
document types are deliberately loose: every object accepts `x-*`
extensions, and a `$ref` may stand where an object is expected.
