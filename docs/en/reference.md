# OpenApiReference

An API reference page for a Swagger 2.0, OpenAPI 3.0 or OpenAPI 3.1 spec —
or for several of them, with a switcher (see [several specs](#several-specs)).

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

**The header** stays at the top: the API's title, version and summary, a
spec switcher when there are [several specs](#several-specs), the
[search](#search), download buttons (YAML, JSON and TS), a settings button
and the `#actions` slot. The settings button shows the host of the server
requests go to, and a key icon — green once credentials are entered — when
the document has security schemes. It opens **the settings drawer** on the
right: the [server](#servers) and its variables, the
[authentication](#authentication) panel, the downloads, and "Print / PDF".

**The body** has the navigation on the left — the operations grouped by tag,
the webhooks and the schemas, with the item in view highlighted as the page
scrolls — and the document on the right: its title, version, summary,
description and links, then every operation as a card, and at the end the
schemas of `components.schemas`. **The footer** shows the title, version and
OpenAPI version, and the `#footer` slot.

**An operation card** has the method, path and summary, a button that copies
the link to it, and "PDF". On the left: the description, parameters, request
body, responses and callbacks; responses start folded, and one with only a
description is a plain row. On the right, three tabs: "Try it", "Request
samples" and [Types](types.md). Code blocks wrap long lines and fold long
blocks behind "Show all". Cards fade in as they come into view (not with
reduced motion).

Links from the spec — the contact, license and terms-of-service URLs of
`info`, an operation's `externalDocs`, an example's `externalValue` — are
shown only when they are `http(s)`, `mailto` or relative addresses; any other
link is left out.

Below 1240 px of width the side tabs move under the operation's description.
Below 900 px the navigation becomes a drawer that slides in from the left,
opened by a menu button in the header, and the header's download buttons
move to the settings drawer.

For a whole page with theme and language switchers, or a page without a
build step, see [standalone page and OpenApiPage](standalone.md). To show a
single operation inside other documentation, see [embedding](embed.md).

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `spec` | `SpecInput` | — | The spec: YAML or JSON text, a parsed object, or a function that returns a promise of either. |
| `specs` | `SpecSource[]` | — | Several specs on one page, in place of `spec`. See [several specs](#several-specs). |
| `active` | `string` | the first spec | The id of the open spec; use `v-model:active`. |
| `send` | `SendFn` | `fetch` from the page | Sends try-it requests. See [the proxy](#sending-through-your-server). |
| `tryIt` | `boolean` | `true` | `false` hides the try-it panels; the samples stay. |
| `locale` | `string` | — | `'en'` or `'ru'`. See [languages](#languages). |
| `labels` | `Partial<OpenApiLabels>` | `{}` | Overrides of single interface strings. |
| `snippetTargets` | `SnippetTarget[]` | all 13 | The languages offered for request samples. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | The language shown first. |
| `baseUrl` | `string` | the page origin | The base a relative server URL is resolved against. |
| `external` | `(url: string) => unknown \| undefined` | — | Loads external `$ref` documents. None are loaded without it. |
| `hashNavigation` | `boolean` | `true` | Write `location.hash` when an item is opened from the navigation. |
| `title` | `string` | the open spec's title | The header's title. |
| `persistCredentials` | `boolean \| 'session' \| 'local'` | `false` | Keep API keys and tokens between visits; see [keeping credentials](#keeping-credentials). |
| `oauthRedirectUrl` | `string` | the page URL | The OAuth redirect URI; see [OAuth2 and OpenID Connect](#oauth2-and-openid-connect). |

With a function, the spec is loaded when it is first shown; a spinner shows
meanwhile. The spec is loaded again when `spec` or `external` changes. Both
are compared by identity: pass a new object rather than changing the old one in place, and
keep the `external` function stable (define it once in `<script setup>`, not
inline in the template).

## Events

| Event | Payload | |
|---|---|---|
| `loaded` | `LoadedSpec`, `id: string` | After every successful load: the normalized document, its operations and groups (see [`loadSpec`](core.md#loading-a-spec)), and the spec's id. |
| `error` | `Error`, `id: string` | The spec could not be read: a `YamlError`, `JsonError` or `OpenApiError`, or the loader function's own error. The page shows the message in place of the reference. |
| `update:active` | `id: string` | Another spec was opened from the switcher, a deep link or `open`. |

With a single `spec` the id is `'spec'`.

## Exposed

Through a template ref:

| | |
|---|---|
| `go(anchor: string, options?: { tryIt?: boolean }): Promise<void>` | Scrolls to `'operation/{id}'`, `'schema/{name}'` or `'tag/{name}'` in the open spec — with `tryIt: true`, to the operation's try-it panel — marks it in the navigation and, with `hashNavigation`, writes the hash. |
| `open(id: string): Promise<void>` | Opens another spec of `specs`, loading it if needed. |
| `spec` | The `LoadedSpec` of the open spec, or `null` while it loads or when it could not be read. |
| `active` | The id of the open spec. |

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

## Slots

| Slot | |
|---|---|
| `#actions` | Controls at the right end of the header, after the settings button. |
| `#footer` | Content at the end of the footer. |

## Deep links

Every operation has the anchor `#operation/{id}`, every schema of
`components.schemas` the anchor `#schema/{name}`, and every tag `#tag/{name}`.
The id is the `operationId`; an operation without one (or whose
`operationId` is already taken) gets a slug of its method and path, such as
`get-pets-id` for `GET /pets/{id}`. Webhook operations get
`webhook-{method}-{name}`. An operation with several tags is shown in the
section of each tag; only its first copy carries the anchor, so a deep link
lands on that one.

When the page opens with one of these anchors in `location.hash`, and
whenever the hash changes to one later, the reference scrolls to it. With
`hashNavigation` (the default) a click in the navigation replaces the hash,
so the address can be copied and shared; each operation header also has a
button that copies the link to it. Turn it off when the reference sits inside
a page that uses the hash for its own routing:

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

Links built for Scalar (`#{doc}/tag/{tag}/{METHOD}{path}`, `#model/{name}`)
open the same sections, and a link can carry a filled try-it form. Both are
described in [deep links and prefilled links](links.md).

## Search

The search field in the header looks through the open spec:
operations (summary, path, operation id, method, tags, parameter names and
descriptions, the description, the property names of their bodies and
responses), tags (name and description), schemas (name, title, description,
property names) and the headings of the document's description. Every word
of the query has to match; results rank by where a word matched — a title or
path counts more than a description — and by how: the whole field, the start
of a word, or anywhere.

While typing, the navigation narrows to the matching items and a list of the
best results opens under the field, with the matched words marked. **↑** and
**↓** move through the list, **Enter** opens the chosen result, **Esc** closes
the list and, pressed again, clears the field. **/** (outside a text field)
and **Ctrl+K** / **⌘K** put the cursor into the search. With several specs
the search covers the open one.

## Examples

Where a media type has several named examples — in the request body and in
each response — they appear as chips above the example; the chosen one shows
its description, and an example given by `externalValue` is a link to it
(never fetched). Without examples, the request body shows a sample generated
from its schema.

In try-it, a body with several examples gets an "Example" select ("Generated
sample" first); choosing one replaces the body text. A parameter's named
examples appear as chips next to it, and clicking one with a simple value
puts it into the try-it field.

## Several specs

`specs` puts several specs — APIs, or versions of one — on one page:

```ts
interface SpecSource {
  id: string          // used in deep links and v-model:active
  name?: string       // shown in the switcher
  spec: SpecInput     // string | object | (() => Promise<string | object>)
}
```

Both types are exported from `@dskripchenko/openapi/vue`. With more than one
spec, a searchable select in the header switches between
them. It shows each spec's `name`, else the title of a spec already loaded,
else its id; its accessible name is the `specs` label.

A spec given as a function is loaded the first time it is opened — a spinner
shows meanwhile, and when the load fails the switcher stays above the error
so another spec can be chosen. A loaded spec is kept under its id, so switching
back is instant; with `external` set, the kept specs are dropped whenever the
sources change.

For example, the specs that a backend serves per API version, each fetched
only when the reader opens it:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference, type SpecSource } from '@dskripchenko/openapi/vue'

const specs: SpecSource[] = [
  { id: 'v1', name: 'API v1', spec: () => fetch('/api/doc/v1').then((r) => r.json()) },
  { id: 'admin', name: 'Admin API', spec: () => fetch('/api/doc/admin').then((r) => r.json()) },
]
const active = ref('v1')
</script>

<template>
  <OpenApiReference v-model:active="active" :specs="specs" locale="en" />
</template>
```

A kept spec is reused while its source stays the same. For a loader
function that means "still a function": a new function under the same id
reuses the result, so a `specs` array written inline in the template does not
fetch again on every render. Text and objects are compared by identity: a new
string or object under the same id is a new source and is loaded again.

What stays and what resets on a switch:

- the credentials typed into the authentication panel are kept per spec and
  come back when the reader returns to it;
- the server choice resets to the first server of the opened spec;
- the search field is cleared;
- the language chosen for samples stays.

With several specs, anchors carry the spec's id: `#{id}/operation/{opId}`,
`#{id}/schema/{name}` and `#{id}/tag/{name}`, and `#{id}` alone opens the
spec. Opening such an address — on load or by a hash change — opens that spec
first, then the section. `go` takes the anchor without the id and works in
the open spec; `open(id)` switches specs. A `specs` array with a single entry
behaves like `spec`: no switcher, no id in anchors.

## Try it

The "Try it" tab of each operation (webhooks excepted) is a form for the
request, "Send", and the response.

**Parameters** are grouped by location — Path, Query, Headers, Cookies — and
each gets the input its schema calls for:

- an `enum` (or `const`) — a select;
- a boolean — a switch when required, else a choice of true / false / not set;
- an integer or number — a number input with the schema's minimum, maximum
  and step (`multipleOf`);
- an array of scalars — tags, or a multi-select when the items have an `enum`;
- a `date` / `date-time` string — a date or date-and-time picker;
- an object, or an array of objects — a small JSON box;
- anything else — a text input.

The parameter's description is a hint under the input. The fields start with
the parameter's `example` or `default`, or — for required ones — a value
sampled from the schema. "+ Add query parameter", "+ Add header" and
"+ Add cookie" add rows the spec does not declare; an own header named like a
generated one — `Content-Type`, `Accept`, `Authorization`, … (case does not
matter) — replaces it.

**The body** depends on the media type:

- **JSON** with a schema — a form generated from it, with a "Form" / "JSON"
  switch: nested objects fold, arrays add and remove items, maps
  (`additionalProperties`) are name/value rows, a nullable value has a null
  toggle, and `oneOf` / `anyOf` offer a variant select. The form and the text
  stay in sync; "Form" is unavailable while the text does not fit the schema.
- **XML** — text. Unless the spec gives the example as XML text, the body is
  written from the schema, with its `xml` names and attributes.
- **`multipart/form-data`** and **`application/x-www-form-urlencoded`** with
  an object schema — a field per property (`readOnly` ones excepted). In
  multipart, a property of `format: binary` (or with a `contentMediaType`)
  gets a file picker, and an array of such takes several files; the accepted
  types come from the `encoding` or the schema.
- **A binary body** — `application/octet-stream`, images, audio, video, PDF,
  a `format: binary` schema — a single file picker; the file is the whole
  body.
- **Other text** — a text area, sent as typed.

A body with several examples gets an "Example" select (see
[examples](#examples)).

**"What will be sent"** sums the request up in one line — method, URL and
the number of headers — and opens into the full URL with a copy button and
the final headers, credentials masked (`Bearer ••••abcd`); "+ Add header" is
there too.

While the request is in flight, "Send" shows "Sending…" and a "Cancel"
button appears; cancelling aborts the request (see the `signal`
[below](#sending-through-your-server)), drops a late answer and says
"Cancelled".

**The response** shows the status, the time, the size, the headers and the
body. A JSON body is pretty-printed, with a "Pretty" / "Raw" toggle. A
non-textual body (`HttpResponse.blob`) is an image preview for `image/*` and
a "Download" link otherwise, named from `Content-Disposition` or
`response.{subtype}`. When the request does not reach the server — a network
error, or the browser blocking a cross-origin request — the panel says so
with the browser's message.

The "Request samples" tab prints the same request that "Send" makes, with
the values typed, the files chosen (by name) and the credentials entered.
The language chosen in one operation is used by all of them.

"Copy link" under the form makes a link that opens this operation with the
form as it is, own rows included; see [prefilled links](links.md#prefilled-links).

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
type SendFn = (request: HttpRequest, options?: SendFnOptions) => Promise<HttpResponse>

interface SendFnOptions {
  signal?: AbortSignal                // aborted when the user presses "Cancel"
}

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // absolute, with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
    file?: { filename: string; contentType?: string; data?: Blob } // a binary body
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string                        // the body of a textual response
  blob?: Blob                         // the body of any other response
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

In the page, a function that posts the request to your backend as JSON:

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request, options) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
      signal: options?.signal,
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

Forward `options.signal` to your own `fetch`, as above, so "Cancel" also
stops the request to your backend. Files (`data` of form fields and of
`body.file`) are `Blob`s and do not survive `JSON.stringify`, and a JSON
answer carries no `blob`: to pass files and binary responses, encode them —
the standalone bundle's proxy sends file bytes as `base64` and reads a
binary answer from `bodyBase64`, then turns it back into a `Blob`.

The URL is always absolute: a relative server URL, and `/` for a document
without `servers`, is resolved against `baseUrl`. On the backend, the
endpoint reads the `HttpRequest`, checks that its URL points at a host you
allow, performs it and answers with an `HttpResponse`. In Node 20+ the core's
own `sendRequest` does the sending part:

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
headers the spec declares do reach the API.

`send` that throws is treated like a network error. The token and discovery
requests of the [authentication panel](#oauth2-and-openid-connect) go through
`send` too: a proxy has to let those hosts through as well. `send` is also
passed on by [`OpenApiEditor`](editor.md) to its preview. The standalone
bundle has a ready-made transport of this kind, with a fixed contract: see
[the proxy](standalone.md#the-proxy).

## Authentication

When the document declares `components.securitySchemes`, the settings drawer
has an "Authentication" section with a field for each scheme:

- **apiKey** — the key; it goes into the header, query parameter or cookie the
  scheme names;
- **http basic** — username and password;
- **http bearer** and other http schemes — the token, sent as
  `Authorization: Bearer …` (or with the scheme's name);
- **oauth2** and **openIdConnect** — the access token, sent as
  `Authorization: Bearer …`, typed in or obtained in the panel.

`mutualTLS` schemes are not shown: a browser cannot present a client
certificate from a script.

The values apply to every operation on the page — both to "Send" and to the
samples. For each operation the reference takes its `security` (or the
document's), and uses the first requirement whose schemes all have a value.
An operation with an empty requirement (`security: [{}]` or `security: []`)
is sent without credentials.

### OAuth2 and OpenID Connect

For an oauth2 scheme the panel offers the flows the scheme declares — a
switch when there are several: "Authorization code" (needs
`authorizationUrl` and `tokenUrl`), "Implicit" (`authorizationUrl`),
"Client credentials" and "Password" (`tokenUrl`). An openIdConnect scheme
reads its discovery document (`openIdConnectUrl`) when the settings drawer
opens, and offers the flows it supports, with `scopes_supported` as the
scopes.

Each flow lists its scopes as checkboxes, all ticked at first; the token is
requested for the ticked ones.

- **Client credentials** and **Password**: "Client ID", "Client secret" (and
  "Username" / "Password") and "Get token". The token request goes to the
  `tokenUrl` (RFC 6749 §4.4, §4.3); with a client secret the client
  authenticates with HTTP Basic, without one `client_id` goes into the form.
- **Authorization code** (with PKCE, S256) and **Implicit**: "Client ID"
  (and an optional "Client secret" for the code flow), the "Redirect URI",
  and "Authorize". A sign-in window opens at the identity provider; when it
  comes back, the reference checks the `state`, and for the code flow
  exchanges the code at the `tokenUrl`, with `client_secret` in the form when
  one was typed (a public client relies on PKCE alone).

The token fills the scheme's field. When the server says how long it lives
(`expires_in`), the panel shows "expires in N min", then "expired"; "Log out"
clears it.

Token, code-exchange and discovery requests go through `send`, like try-it.
With the default transport those endpoints must accept a cross-origin
request from the page; with a [proxy](#sending-through-your-server) they go
through your server and need no CORS. The sign-in window itself is a normal
browser window at the identity provider.

**The redirect URI** is `oauthRedirectUrl`, by default the page's own
address without query and fragment; it can be changed in the panel. The
identity provider must allow it. The sign-in result reaches the reference in
one of two ways, whichever comes first:

- the reference watches the window and reads the response once it lands back
  on the redirect URI (same origin as the page);
- the page at the redirect URI posts the response to the window that opened
  it and closes itself. An `OpenApiReference` does this on mount, so the
  documentation page itself works as the redirect URI. A dedicated redirect
  page calls `relayOAuthCallback()` from `@dskripchenko/openapi/vue`; it posts
  a message of type `OAUTH_MESSAGE` to a same-origin opener only.

The browser blocks windows not opened by a click; the panel reports a blocked
or closed window and a `state` that does not match. The same requests are
available outside the component: [`fetchOAuthToken`](core.md#oauth2-tokens),
`buildAuthorizeUrl`, `exchangeAuthorizationCode` and the rest.

### Keeping credentials

By default credentials live in memory for the page's lifetime. With
`persistCredentials` they are kept between visits:

| Value | Kept in |
|---|---|
| `false` | nowhere (default) |
| `true` or `'session'` | `sessionStorage` — until the tab is closed |
| `'local'` | `localStorage` — until removed |

They are stored per spec, under the key
`dsk-openapi:credentials:{specId}:{info.title}` (`specId` is `spec` with a
single spec). Kept: API keys, bearer tokens, OAuth and OpenID Connect access
tokens with their expiry (an expired one is not restored), and basic-auth
usernames. Never kept: basic-auth passwords, client IDs and secrets, and
password-flow passwords. With persistence on, the panel says "Saved in this
browser" and has a "Forget" button that clears the credentials of the open
spec, in memory and in storage.

## Servers

The settings drawer lists the document's `servers` and "Custom URL" for one
of your own, and shows the URL requests go to. Server variables get a field
each — a select when the variable has an `enum` — prefilled with their
`default`. An operation or path that declares its own `servers` uses its own
list, with the same position chosen. The header's settings button shows the
chosen server's host.

A relative server URL (`/v1`) is resolved against `baseUrl`, which defaults
to the origin of the page; a document without `servers` is called at `/` of
`baseUrl`. Set it when the reference is served from another origin than the
API:

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## Download and print

The header and the settings drawer download the open spec:

- **YAML** and **JSON** — the document as it was given, not the normalized
  3.1 copy, named `{title}-{version}.yaml` / `.json`;
- **TS** — the [TypeScript types](types.md) of the whole document, named
  `{title}-{version}.d.ts`.

Printing goes through the browser's own print dialog, where "Save as PDF" is
one of the printers:

- **"PDF"** on an operation card prints that operation;
- **"Print / PDF"** in the settings drawer prints the whole spec: the
  introduction, every operation on a page of its own, then the schemas.

The print view is laid out for paper — A4, light colours whatever the page's
theme, schemas fully expanded, the default examples, a request sample in the
chosen language and in cURL, the operation's address — and has no
interactive parts. Credentials are never printed: the security section names
the schemes, and the sample is built without them. It is rendered into a
hidden frame with its own stylesheet, so the host page is not restyled, and
its title — `{API} — {operation}` — is what browsers offer as the PDF's file
name. The dialog itself cannot be skipped: a browser does not let a page
save a PDF without it.

`printOperation(entry, ctx, { url? })` and `printDocument(ctx, { base? })`
from `@dskripchenko/openapi/vue` do the same from code; they take the
reference context (see [the context](#the-context)). `url` is the address
printed with the operation, `base` the page the operation anchors are
appended to.

## Request samples

The samples select offers the languages of `snippetTargets`, in the order
given; `defaultSnippet` is the one shown first, and when it is not in the
list, the first of the list is. To offer only a few:

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

### All strings

The keys of `OpenApiLabels` with their English text. In `expiresIn`,
`headerCount` and `itemCount`, `{n}` stands for the number. [`OpenApiPage`](standalone.md#openapipage)
uses `theme`, `themeLight`, `themeDark`, `themeSystem` and `language` for its
switchers.

| Key | English |
|---|---|
| `search` | Search |
| `operations` | Operations |
| `schemas` | Schemas |
| `webhooks` | Webhooks |
| `servers` | Server |
| `authentication` | Authentication |
| `noAuth` | No authentication |
| `parameters` | Parameters |
| `requestBody` | Request body |
| `responses` | Responses |
| `headers` | Headers |
| `required` | required |
| `deprecated` | deprecated |
| `default` | Default |
| `example` | Example |
| `examples` | Examples |
| `schema` | Schema |
| `enum` | Allowed values |
| `noBody` | No body |
| `samples` | Request samples |
| `tryIt` | Try it |
| `send` | Send |
| `sending` | Sending… |
| `response` | Response |
| `status` | Status |
| `time` | Time |
| `body` | Body |
| `clear` | Clear |
| `invalidJson` | The body is not valid JSON; it is sent as typed. |
| `networkError` | The request did not reach the server |
| `token` | Token |
| `username` | Username |
| `password` | Password |
| `getToken` | Get token |
| `clientId` | Client ID |
| `clientSecret` | Client secret |
| `scopes` | Scopes |
| `loadError` | The specification could not be read |
| `issues` | Problems in the specification |
| `callbacks` | Callbacks |
| `links` | Links |
| `externalDocs` | More |
| `terms` | Terms of service |
| `specs` | API |
| `noResults` | Nothing found |
| `version` | Version |
| `copy` | Copy |
| `show` | Show |
| `hide` | Hide |
| `settings` | Server and authentication |
| `customServer` | Another URL… |
| `addHeader` | Add header |
| `addQueryParam` | Add query parameter |
| `addCookie` | Add cookie |
| `copyLink` | Copy link |
| `linkCopied` | Copied |
| `includeCredentials` | Include credentials |
| `credentialsWarning` | The link will carry your keys and passwords: anyone who gets it can use them. |
| `prefilled` | Form filled from a link — check the values before sending |
| `theme` | Theme |
| `themeLight` | Light |
| `themeDark` | Dark |
| `themeSystem` | System |
| `language` | Language |
| `generatedSample` | Generated sample |
| `externalExample` | Open the example |
| `useExample` | Put into try-it |
| `searchResults` | Search results |
| `tag` | Tag |
| `section` | Section |
| `authorize` | Authorize |
| `redirectUri` | Redirect URI |
| `redirectHint` | The identity provider must allow this redirect URI. |
| `flowAuthorizationCode` | Authorization code |
| `flowImplicit` | Implicit |
| `flowClientCredentials` | Client credentials |
| `flowPassword` | Password |
| `logOut` | Log out |
| `forget` | Forget |
| `savedInBrowser` | Saved in this browser |
| `expiresIn` | expires in {n} min |
| `tokenExpired` | expired |
| `popupBlocked` | The browser blocked the sign-in window. Allow pop-ups for this page and try again. |
| `popupClosed` | The sign-in window was closed before it finished. |
| `stateMismatch` | The sign-in response does not match the request. Try again. |
| `formView` | Form |
| `rawJson` | Raw JSON |
| `file` | File |
| `cancel` | Cancel |
| `cancelled` | Cancelled |
| `pretty` | Pretty |
| `raw` | Raw |
| `download` | Download |
| `downloadSpec` | Download spec |
| `copyOperationLink` | Copy link to this operation |
| `operationLinkCopied` | Link copied |
| `locPath` | Path |
| `locQuery` | Query |
| `locHeader` | Headers |
| `locCookie` | Cookies |
| `add` | Add |
| `addItem` | Add item |
| `remove` | Remove |
| `name` | Name |
| `value` | Value |
| `jsonView` | JSON |
| `notSet` | not set |
| `nullValue` | null |
| `variant` | Variant |
| `willBeSent` | What will be sent |
| `headerCount` | headers: {n} |
| `itemCount` | items: {n} |
| `copyUrl` | Copy URL |
| `urlCopied` | Copied |
| `request` | Request |
| `types` | Types |
| `copyTypeName` | Copy the type name |
| `typeNameCopied` | Copied |
| `downloadTypes` | Download TypeScript types |
| `openInReference` | Open in reference |
| `operationNotFound` | Operation not found |
| `pdf` | PDF |
| `printOperation` | Print or save as PDF |
| `printDocument` | Print / PDF |
| `security` | Security |
| `noSecurity` | No authentication |
| `description` | Description |
| `type` | Type |
| `location` | In |
| `operationId` | Operation ID |
| `tags` | Tags |
| `seeAbove` | see above |
| `requestSample` | Request sample |
| `generatedOn` | Generated |

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

The reference's header, navigation and side tabs are sticky. Under a fixed
site header, set `--oa-sticky-top` to that header's height: everything sticks
below it, and anchors scroll to the same offset:

```css
:root {
  --oa-sticky-top: 64px;
}
```

The reference's own header is `--oa-header-h` (56px) tall. The other
variables — navigation width, gaps, method colours — are listed in
[theming](theming.md).

## The context

`useReference` and `referenceKey` give the state the parts of the reference
share: the spec, the labels, the chosen server, the credentials and the
transport (`ReferenceContext`, `ServerState`). They are exported for building
custom parts inside the reference; they read the context that
`OpenApiReference` provides and cannot be used outside it.
