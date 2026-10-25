# OpenApiReference

An API reference page for a Swagger 2.0, OpenAPI 3.0 or OpenAPI 3.1 spec.

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

The page has two columns. On the left, a navigation: a search field, the
operations grouped by tag, the webhooks and the schemas. On the right, the
document: its title, version and description, the server and credentials
panels, then every operation with its parameters, request body, responses
(as schema trees with examples), callbacks, request samples and a "Try it"
panel, and at the end the schemas of `components.schemas`.

Below 1100 px of width the samples and try-it move under the operation's
description; below 760 px the navigation moves above the document.

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `spec` | `string \| object` | — | The spec: YAML or JSON text, or a parsed object. Required. |
| `send` | `SendFn` | `fetch` from the page | Sends try-it requests. See [the proxy](#sending-through-your-server). |
| `tryIt` | `boolean` | `true` | `false` hides the try-it panels; the samples stay. |
| `locale` | `string` | — | `'en'` or `'ru'`. See [languages](#languages). |
| `labels` | `Partial<OpenApiLabels>` | `{}` | Overrides of single interface strings. |
| `snippetTargets` | `SnippetTarget[]` | all 13 | The languages offered for request samples. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | The language shown first. |
| `baseUrl` | `string` | the page origin | The base a relative server URL is resolved against. |
| `external` | `(url: string) => unknown \| undefined` | — | Loads external `$ref` documents. None are loaded without it. |
| `hashNavigation` | `boolean` | `true` | Write `location.hash` when an item is opened from the navigation. |

The spec is loaded again when `spec` or `external` changes. Both are compared
by identity: pass a new object rather than changing the old one in place, and
keep the `external` function stable (define it once in `<script setup>`, not
inline in the template).

## Events

| Event | Payload | |
|---|---|---|
| `loaded` | `LoadedSpec` | After every successful load: the normalized document, its operations and groups (see [`loadSpec`](core.md#loading-a-spec)). |
| `error` | `Error` | The spec could not be read: a `YamlError`, `JsonError` or `OpenApiError`. The page shows the message in place of the reference. |

## Exposed

Through a template ref:

| | |
|---|---|
| `go(anchor: string): Promise<void>` | Scrolls to `'operation/{id}'` or `'schema/{name}'`, marks it in the navigation and, with `hashNavigation`, writes the hash. |
| `spec` | The current `LoadedSpec`, or `null` when the spec could not be read. |

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const reference = ref<InstanceType<typeof OpenApiReference> | null>(null)
const openPets = () => reference.value?.go('operation/listPets')
</script>

<template>
  <button @click="openPets">List pets</button>
  <OpenApiReference ref="reference" :spec="text" />
</template>
```

## Deep links

Every operation has the anchor `#operation/{id}` and every schema of
`components.schemas` the anchor `#schema/{name}`. The id is the
`operationId`; an operation without one (or whose `operationId` is already
taken) gets a slug of its method and path, such as `get-pets-id` for
`GET /pets/{id}`. Webhook operations get `webhook-{method}-{name}`.

When the page opens with one of these anchors in `location.hash`, the
reference scrolls to it. With `hashNavigation` (the default) a click in the
navigation replaces the hash, so the address can be copied and shared. Turn
it off when the reference sits inside a page that uses the hash for its own
routing:

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

## Try it

Each operation (webhooks excepted) has a "Try it" panel: a field per
parameter, grouped by `path`, `query`, `header` and `cookie`, a text area for
the body with a media type selector, and "Send". The fields start with the
parameter's `example`, `default`, or — for required parameters — a value
sampled from the schema; the body starts with the media type's example or a
sample generated from its schema.

What is typed is read according to the parameter's schema: numbers and
booleans are converted, arrays and objects are read as JSON (an array may
also be typed as `a, b, c`). The body is sent as typed; for a JSON media type
an invalid body shows a warning but is still sent. For
`application/x-www-form-urlencoded` and `multipart/form-data` bodies, type
the fields as a JSON object. The text area has no file picker: a file field of
a multipart body is sent without content.

The request samples next to the panel print the same request that "Send"
makes, with the values typed and the credentials entered. The language
chosen in one operation is used by all of them.

The response shows the status, the time, the headers and the body; a JSON
body is pretty-printed. When the request does not reach the server — a
network error, or the browser blocking a cross-origin request — the panel
says so with the browser's message.

### Credentials and cookies

By default the request is sent with the page's `fetch` and
`credentials: 'same-origin'`: the browser attaches the page's cookies only to
requests to the page's own origin, never to a foreign API.

Two browser rules apply to the default transport. A cross-origin API must
allow the page's origin (CORS), or the browser blocks the response. And the
browser drops headers it forbids scripts to set — `Cookie`, `Host`, `Origin`
and others — even when the spec declares them.

### Sending through your server

Pass `send` to route try-it through your own backend. It receives the
request the panel built and returns the response:

```ts
type SendFn = (request: HttpRequest) => Promise<HttpResponse>

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

In the page, a function that posts the request to your backend as JSON:

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`Proxy answered ${response.status}`)
    return (await response.json()) as HttpResponse
  } catch (error) {
    return {
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      duration: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

```vue
<OpenApiReference :spec="text" :send="send" />
```

The URL is absolute when the document has servers (a relative server URL is
resolved against `baseUrl`); for a document without `servers` it is the bare
path. On the backend, the endpoint reads the `HttpRequest`, checks that its URL
points at a host you allow, performs it and answers with an `HttpResponse`.
In Node 20+ the core's own `sendRequest` does the sending part:

```ts
import { sendRequest, type HttpRequest, type HttpResponse } from '@dskripchenko/openapi'

const ALLOWED_HOSTS = new Set(['api.example.com'])

export async function proxy(request: HttpRequest): Promise<HttpResponse> {
  const host = new URL(request.url).host
  if (!ALLOWED_HOSTS.has(host)) {
    return { status: 0, statusText: '', headers: [], body: '', duration: 0, error: `Host ${host} is not allowed` }
  }
  return sendRequest(request)
}
```

Protect the endpoint as you protect the rest of your back office: a proxy that
calls any host on behalf of anyone is an open relay. A server is not bound by
the browser's forbidden-header list, so through it the `Cookie` and other
headers the spec declares do reach the API. File fields arrive as
`{ filename, contentType }` without data, since the panel has none to send.

`send` that throws is treated like a network error. `send` is also passed on
by [`OpenApiEditor`](editor.md) to its preview.

## Authentication

When the document declares `components.securitySchemes`, the head of the page
has an "Authentication" panel with a field for each scheme:

- **apiKey** — the key; it goes into the header, query parameter or cookie the
  scheme names;
- **http basic** — username and password;
- **http bearer** and other http schemes — the token, sent as
  `Authorization: Bearer …` (or with the scheme's name);
- **oauth2** and **openIdConnect** — the access token, sent as
  `Authorization: Bearer …`.

`mutualTLS` schemes are not shown: a browser cannot present a client
certificate from a script.

The values apply to every operation on the page — both to "Send" and to the
samples. For each operation the reference takes its `security` (or the
document's), and uses the first requirement whose schemes all have a value.
An operation with an empty requirement (`security: [{}]` or `security: []`)
is sent without credentials.

### Fetching an OAuth2 token

For an oauth2 scheme with a `clientCredentials` or `password` flow that has a
`tokenUrl`, the panel also has "Client ID", "Client secret" (and, for
`password`, "Username" and "Password") fields and a "Get token" button. The
button posts a token request to the `tokenUrl` (RFC 6749 §4.3 and §4.4) with
every scope the flow declares; the access token that comes back fills the
scheme's token field. With a client secret the client authenticates with
HTTP Basic; without one, `client_id` goes into the form. When the scheme has
both flows, `clientCredentials` is used.

The token request is made with the page's `fetch`, not through `send`, so
the token endpoint has to accept a cross-origin request from the page. For
the `implicit` and `authorizationCode` flows, obtain a token elsewhere and
paste it into the token field. The same request is available outside the
component as [`fetchOAuthToken`](core.md#oauth2-tokens).

## Servers

When the document has `servers`, the "Server" panel lists them, plus "…" for
a URL of your own. Server variables get a field each — a select when the
variable has an `enum` — prefilled with their `default`. An operation or path
that declares its own `servers` uses its own list, with the same position
chosen.

A relative server URL (`/v1`) is resolved against `baseUrl`, which defaults
to the origin of the page. Set it when the reference is served from another
origin than the API:

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## Request samples

The samples select offers the languages of `snippetTargets`, in the package's
own order; `defaultSnippet` is the one shown first. To offer only a few:

```vue
<OpenApiReference
  :spec="text"
  :snippet-targets="['curl', 'javascript-fetch', 'php-laravel', 'python-requests']"
  default-snippet="php-laravel"
/>
```

The ids and what each target needs to run are listed in
[code samples](snippets.md).

## Languages

`locale` picks the interface strings: English (`'en'`) and Russian (`'ru'`)
ship with the package. Without `locale` the strings are English. `labels`
overrides single strings on top:

```vue
<OpenApiReference :spec="text" locale="en" :labels="{ tryIt: 'Run', send: 'Run request' }" />
```

For another language, pass a complete dictionary as `labels`. The type is
`OpenApiLabels`, and `en` is the English one to start from:

```ts
import { en, type OpenApiLabels } from '@dskripchenko/openapi/vue'

const de: OpenApiLabels = { ...en, search: 'Suche', tryIt: 'Ausprobieren', send: 'Senden' /* … */ }
```

```vue
<OpenApiReference :spec="text" :labels="de" />
```

`en`, `ru` and `LOCALES` (`{ en, ru }`) are exported from
`@dskripchenko/openapi/vue`.

### The kit's own strings

The kit components inside the reference — selects, code blocks, inputs —
have strings of their own: the copy button, the search inside a select and
the like. With
`locale="en"` or `locale="ru"` the reference wraps itself in the kit's
`UidLocaleProvider` with the matching kit locale. Without `locale` (or with
any other value) it adds no provider, and the kit components follow the
host's `UidLocaleProvider`; with none, the kit's default is Russian. A page
in another language therefore sets its own provider around the reference:

```vue
<UidLocaleProvider :locale="kitLocale"> <!-- a kit locale object -->
  <OpenApiReference :spec="text" :labels="de" />
</UidLocaleProvider>
```

## External references

A `$ref` to another file (`common.yaml#/components/schemas/Error`) is
resolved only through the `external` prop. Without it such a reference stays
unresolved and is shown as its name. The function receives the URL part of
the reference exactly as written (`common.yaml`), synchronously, and returns
the parsed document, or `undefined` when it does not have it. Each URL is
asked once per load.

Since the call is synchronous, load the files first:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { parseSpec } from '@dskripchenko/openapi'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const text = ref<string | null>(null)
const files = new Map<string, unknown>()
const external = (url: string) => files.get(url)

onMounted(async () => {
  for (const name of ['common.yaml']) {
    files.set(name, parseSpec(await (await fetch(`/specs/${name}`)).text()).value)
  }
  text.value = await (await fetch('/specs/openapi.yaml')).text()
})
</script>

<template>
  <OpenApiReference v-if="text" :spec="text" :external="external" />
</template>
```

References inside an external document that point into the same document
(`#/Pet`) are resolved within it. Nothing is ever fetched by the package
itself.

## Layout under a fixed header

The navigation and the samples column are sticky. Under a fixed site header,
set `--oa-sticky-top` to the header's height so they stop below it; anchors
scroll to the same offset:

```css
:root {
  --oa-sticky-top: 64px;
}
```

The other variables — navigation width, gaps, method colours — are listed in
[theming](theming.md).

## OaSchema and the context

`OaSchema` (the schema tree) and `useReference`/`referenceKey` (the shared
state: spec, labels, chosen server, credentials, transport) are exported for
building custom parts inside the reference. They read the context that
`OpenApiReference` provides and cannot be used outside it.
