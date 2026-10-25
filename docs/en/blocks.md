# API blocks

An API block is a fenced code block with the language `openapi` inside rich
content — a WYSIWYG editor, a markdown page, any HTML page. Its YAML or JSON
describes one or more HTTP requests. Rendered, it becomes a live API widget —
the [embed](embed.md)'s compact card: method and path, parameters, body,
responses, try-it that really sends, request samples, TypeScript types and
PDF. Editable, it has three tabs: **Preview**, **Source** and
**Constructor** — a form of the requests. Source and Constructor are two
views of one text: editing one updates the other.

````markdown
```openapi
method: POST
url: https://api.example.com/v1/users/{id}
summary: Update a user
auth: bearer
params:
  path: { id: integer }
body:
  example: { name: Ann, age: 31 }
responses:
  200: { description: The updated user, example: { id: 7, name: Ann } }
  404: Not found
```
````

## The format

A block holds one request, several requests, or a whole OpenAPI document.
YAML and JSON both work; the first character decides (`{` is JSON).

### One request

| Key | | |
|---|---|---|
| `url` | required | An absolute URL (`https://api.example.com/v1/users/{id}`) or a path (`/users/{id}`). `{name}` is a path parameter; a query string (`?page=1`) gives query parameters with those examples. |
| `method` | `GET` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`, in any case. |
| `summary` | | The card's title. |
| `description` | | Markdown. |
| `auth` | | See [auth](#auth). |
| `params` | | `path`, `query`, `header`, `cookie` — each a map of name → parameter. |
| `body` | | See [body](#body-and-responses). |
| `responses` | `200: OK` | Status (`200`, `4XX`, `default`) → a description, or an object. |
| `operationId`, `tags`, `deprecated` | | As in OpenAPI. `operationId` defaults to the method and the path: `POST /v1/users/{id}` → `postV1UsersById`. |
| `title`, `version` | | The document's title (the summary by default) and version. |
| `baseUrl`, `servers` | | See [several requests](#several-requests). |
| `x-…` | | Kept on the operation. |

An unknown key is an error with a hint (`Unknown key "respones" — did you
mean "responses"?`), at its line.

### Types

A parameter, a header or a schema property is a type in shorthand — the
same as laravel-api's: `type(format)! Description`.

| Shorthand | Means |
|---|---|
| `string`, `integer`, `number`, `boolean`, `object`, `array` | The type. |
| `string(email)`, `integer(int64)`, `string(date-time)` | With a format. |
| `string[]`, `integer[][]` | Arrays. |
| `file` | A file upload: `string(binary)`. |
| `integer!` | Required (path parameters always are). |
| `integer! The user's id` | Text after the first space is the description. |

Or an object — parameter fields (`description`, `required`, `deprecated`,
`example`, `style`, `explode`, `schema`) next to schema fields (`type`, which
may be shorthand, `format`, `enum`, `default`, `minimum`, …):

```yaml
params:
  query:
    sort: { type: string, enum: [name, date], description: Order, example: name }
    page: { type: integer!, minimum: 1 }
```

A path parameter in the URL that `params.path` does not declare is a string.

### Body and responses

```yaml
body:
  type: json            # default; also form, multipart, text, xml, binary, or a media type
  example: { name: Ann }
  schema: { ... }       # optional: inferred from the example when absent
  description: The new user
  required: true        # default
responses:
  200:
    description: OK     # the status's reason phrase by default
    type: json
    example: { id: 7 }
    headers: { X-Rate-Limit: integer Calls left }
  404: Not found        # a description alone
  default:              # empty: "Error"
```

A `schema` is JSON Schema, with the shorthand allowed inside it: a property
may be a shorthand string, a property name ending in `!` is required, and
`items` may be shorthand too.

```yaml
schema:
  type: object
  properties:
    name: string!
    email: string(email) Where receipts go
    tags!: { type: array, items: string }
```

Without a schema the example gives one (`inferSchema`): types by JSON kind,
integers apart from other numbers, `date-time`, `date`, `uuid`, `email` and
`uri` formats, array items merged from every element.

### Auth

| `auth` | Security scheme |
|---|---|
| `bearer` | HTTP bearer; `{ type: bearer, format: JWT }` adds the format. |
| `basic` | HTTP basic. |
| `apiKey` | An API key in the `X-API-Key` header; `{ type: apiKey, in: header \| query \| cookie, name: X-Key }`. |
| `{ type: oauth2, flow, authorizationUrl, tokenUrl, scopes }` | OAuth 2.0. `flow` is `authorizationCode`, `clientCredentials`, `password` or `implicit`; without it the URLs decide. `scopes` is a list or a map of name → description. |
| `{ type: openIdConnect, url }` | OpenID Connect discovery. |
| `none` | No auth — it overrides a shared one. |

The card's settings drawer then asks for the credentials, as the reference
does.

### Several requests

```yaml
title: Orders
baseUrl: https://api.example.com/v2
auth: bearer              # the default for every request
requests:
  - url: /orders?page=1
    summary: List orders
  - method: POST
    url: /orders
    summary: Create an order
    body: { type: form, example: { item: book, qty: 2 } }
  - url: https://files.example.com/upload
    method: PUT
    auth: none
```

Shared keys: `title`, `description` (markdown, above the cards), `version`,
`baseUrl` (paths resolve against it; it becomes the server), `servers` (a
list of URLs or `{ url, description }`), `auth` and `x-…`. Without a base URL
the host of the first absolute URL is the server; a request on another host
gets its own.

### A whole document

A block with an `openapi` or `swagger` key is an OpenAPI 3.x or Swagger 2.0
document, taken as is: every operation becomes a card. The constructor does
not edit these; the source does.

## Core API

From `@dskripchenko/openapi`:

```ts
import { parseBlock, stringifyBlock, blockToDocument, inferSchema } from '@dskripchenko/openapi'

const r = parseBlock(text)
if (r.ok) {
  r.document // OpenAPI 3.1
  r.kind     // 'requests' | 'document'
  r.format   // 'yaml' | 'json'
  r.data     // the parsed text
} else {
  r.error    // { message, line?, column?, pointer? }
}
stringifyBlock(r.data, 'json')   // YAML ↔ JSON
```

- `parseBlock(text)` never throws. Syntax errors and shape errors both come
  with the line and column.
- `blockToDocument(data)` converts parsed compact data; it throws
  `BlockError` (with `pointer`).
- `inferSchema(value)` — a JSON Schema from an example.
- `parseShorthand`, `formatShorthand`, `expandSchema` — the type shorthand.
- `blockToModel(data, format)` / `modelToBlock(model, base, format)` — the
  constructor's form model and the way back. The way back patches `base`:
  fields the form did not change keep their value exactly as written (the
  shorthand or the object form, `enum`, response headers, `x-` keys…), so
  `modelToBlock(blockToModel(data), data).data` equals `data`. Texts that do
  not read (an example that is not JSON) leave the old value and come back in
  `errors`. `syncOrigins(model)` after writing, `syncPathParams(request)`
  after a URL change.

## In Vue: OpenApiBlock

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiBlock } from '@dskripchenko/openapi/vue'

const source = ref('url: https://api.example.com/health\nsummary: Health check\n')
</script>

<template>
  <OpenApiBlock v-model:source="source" editable locale="en" />
</template>
```

| Prop | Type | Default | |
|---|---|---|---|
| `source` | `string` | — | The block's text. Edits come out as `update:source`, in the text's format. |
| `editable` | `boolean` | `false` | Preview / Source / Constructor tabs; read-only is the preview alone. |
| `tab` | `'preview' \| 'source' \| 'constructor'` | `'preview'` | The tab an editable block opens with. |
| `locale` | `string` | — | `en` or `ru`. |
| `labels` | `Partial<OpenApiLabels>` | | The cards' strings. |
| `blockLabels` | `Partial<BlockLabels>` | | The widget's own strings (`blockEn`, `blockRu`). |
| `debounce` | `number` | `300` | Milliseconds from the last constructor edit to `update:source`. |
| `send`, `tryIt`, `snippetTargets`, `defaultSnippet`, `baseUrl`, `persistCredentials`, `oauthRedirectUrl` | | | As on [`OpenApiOperation`](embed.md). |

Exposed: `tab`, `text`, `parsed` and `flush()` (writes pending constructor
edits now). The Source tab's YAML / JSON switch converts the text (YAML
comments do not survive a conversion or a constructor edit); a parse error is
shown with its line. The constructor changes only what you change in it:
whatever it cannot express stays in the source as written.

### Mounting without a template

```ts
import { mountOpenApiBlock } from '@dskripchenko/openapi/vue'

const handle = mountOpenApiBlock(el, {
  source,
  editable: true,
  onChange: (next) => save(next),
  appContext: app._context, // optional: the host's provides (kit theme, i18n) reach the widget
})
handle.update(newSource) // an outside change; the open tab stays
handle.destroy()
```

## The block renderer contract

Editors and markdown views that render fenced blocks by language take a
**block renderer**. `openApiBlockRenderer(options?)` returns one for
` ```openapi `:

```ts
type BlockRenderer = (code: string, ctx: { language: string; index: number }) => BlockRenderResult | Promise<BlockRenderResult>

interface BlockRenderResult {
  html?: string
  error?: string
  /** A live island: called with the island element; returns a handle. */
  mount?: (el: HTMLElement, ctx: BlockMountContext) => BlockMountHandle | (() => void) | void
}

interface BlockMountContext {
  code: string
  language: string
  /** False in read-only views. */
  editable: boolean
  /** Replaces the block's code (editable only); the host does not re-render the island for this change. */
  setCode(code: string): void
}

interface BlockMountHandle { update?(code: string): void; destroy?(): void }
```

The renderer always returns `{ mount }`, even for a block that does not read:
the widget shows the error itself, and an editable one lets the user fix it
in Source or Constructor. `mount` mounts the widget editable where
`ctx.editable` is, hands its edits to `ctx.setCode`, and its `update(code)`
takes outside changes (undo, redo) without losing the open tab.

```ts
import { openApiBlockRenderer } from '@dskripchenko/openapi/vue'

const renderers = { openapi: openApiBlockRenderer({ locale: 'en', appContext: app._context }) }
```

The types are exported from `@dskripchenko/openapi/vue` too.

## Without a build: renderBlocks

The [standalone bundle](standalone.md) renders blocks in any page. A markdown
renderer turns ` ```openapi ` into `<pre><code class="language-openapi">`;
`language-openapi-yaml` and `language-openapi-json` are found too.

```html
<pre><code class="language-openapi">url: https://api.example.com/health
summary: Health check
</code></pre>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

With `data-auto` the script renders every such block once the document is
parsed (and mounts the `[data-openapi-operation]` embeds); the tag's
`data-openapi-theme`, `data-openapi-locale` and `data-openapi-proxy` apply to
the blocks. From a script:

```js
const blocks = DskOpenApi.renderBlocks('#article', { locale: 'auto', theme: 'system', proxy: '/try-it-proxy' })
blocks[0].element // the widget's element, in place of the <pre>
blocks[0].destroy()
```

`renderBlocks(root?, options?)` takes a node or a selector (the document by
default) and returns the blocks it rendered: `{ element, update(source),
destroy() }`. A rendered block is no longer a code element, so calling it
again after adding content renders only the new ones. Options: `theme`,
`locale` (`en`, `ru`, `auto`), `proxy`, and the widget's `tryIt`, `labels`,
`blockLabels`, `snippetTargets`, `defaultSnippet`, `baseUrl`,
`persistCredentials`, `oauthRedirectUrl`. Blocks are read-only here;
`DskOpenApi.mountOpenApiBlock(el, options)` mounts an editable one.
