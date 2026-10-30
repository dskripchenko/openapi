# @dskripchenko/openapi

[![CI](https://github.com/dskripchenko/openapi/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/openapi/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/openapi.svg)](https://www.npmjs.com/package/@dskripchenko/openapi)
[![license](https://img.shields.io/npm/l/@dskripchenko/openapi.svg)](LICENSE)

Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 specs in YAML or JSON: read them,
validate them, show them as an API reference with "Try it" and code samples,
and edit them in a visual editor. AsyncAPI 2.x and 3.0 documents of
event-driven APIs are read and shown too. The core has **no runtime dependencies**;
the Vue components are built on
[`@dskripchenko/ui`](https://github.com/dskripchenko/ui).

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/openapi/style.css'
import spec from './openapi.yaml?raw'
</script>

<template>
  <OpenApiReference :spec="spec" locale="en" />
</template>
```

Several APIs or versions on one page, each fetched when the reader opens it:

```vue
<script setup lang="ts">
import { OpenApiReference, type SpecSource } from '@dskripchenko/openapi/vue'

const specs: SpecSource[] = [
  { id: 'v1', name: 'API v1', spec: () => fetch('/api/doc/v1').then((r) => r.json()) },
  { id: 'admin', name: 'Admin API', spec: () => fetch('/api/doc/admin').then((r) => r.json()) },
]
</script>

<template>
  <OpenApiReference :specs="specs" locale="en" />
</template>
```

Or, without a build step, one script on any page — the same `sources` shape
as Scalar's `createApiReference`:

```html
<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
<script>
  DskOpenApi.createApiReference('#app', {
    sources: [{ url: '/openapi.json', title: 'API', slug: 'api' }],
  })
</script>
```

One operation inside a guide, from the same script:

```html
<div data-openapi-operation="createOrder" data-openapi-src="/openapi.json"></div>
<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

An API block in a guide, a wiki or a WYSIWYG editor — a fenced `openapi`
block of a few hand-written lines that renders as a live card with try-it,
and edits through Preview / Source / Constructor tabs:

````markdown
```openapi
method: POST
url: https://api.example.com/v1/users/{id}
auth: bearer
params:
  path: { id: integer }
body:
  example: { name: Ann }
responses:
  200: { description: The updated user, example: { id: 7, name: Ann } }
  404: Not found
```
````

## What is inside

- **`@dskripchenko/openapi`** — the core, plain TypeScript without the DOM:
  YAML and JSON parsers that keep the line of every value, normalization of
  2.0 and 3.0 documents to the 3.1 shape, `$ref` resolution, structural
  validation with line numbers, schema samples (JSON and XML), a JSON Schema
  validator, request building by `style` / `explode` and security schemes,
  code samples in 13 languages, TypeScript declarations for operations and
  whole documents, OAuth2 helpers (PKCE, token requests, OpenID Connect
  discovery), the deep-link and prefilled-link formats, and the compact
  API-block format (`parseBlock`, `inferSchema`, the constructor's model).
- **`@dskripchenko/openapi/vue`** — the components:
  - `OpenApiReference` — a sticky header with full-text search (`/`,
    Ctrl/Cmd+K) and downloads (YAML, JSON, `.d.ts`), a settings drawer with
    the server and the authentication panel, navigation with scroll spy,
    operations as cards with "Try it", "Request samples" and "Types" tabs,
    named examples, print / PDF;
    try-it with typed parameter inputs, a schema-driven JSON body form, file
    uploads, own headers, a "What will be sent" preview, cancel and a
    response viewer (images, downloads); every OAuth2 flow (authorization
    code with PKCE and implicit in a popup, client credentials, password,
    OpenID Connect discovery) and opt-in remembered credentials; deep links
    (Scalar's too) and prefilled links; several specs on one page;
  - `OpenApiOperation` — one operation embedded in other documentation;
  - `OpenApiBlock` — an API block of rich content: live cards, and when
    editable the source (YAML ⇄ JSON) and a constructor form;
    `mountOpenApiBlock` and `openApiBlockRenderer` for editors and markdown
    views that render fenced blocks;
  - `OpenApiPage` — the reference as a whole page, with light / dark /
    system theme and language switchers;
  - `OpenApiEditor` — visual forms for info, servers, tags, security
    schemes, paths, operations and schemas, the source with problems by
    line, and a preview. `v-model` is the text, and its format is kept.
- **`dist/standalone.js`** — the page and the embed with Vue, the kit and the
  styles in one script (global `DskOpenApi`), for pages without a build
  step: a drop-in for Scalar's `createApiReference`, `mountOperation` and
  `data-openapi-operation` markup, `renderBlocks` for ```` ```openapi ````
  blocks in rendered markdown, and an optional try-it proxy.

The components follow the kit's light and dark themes; the interface ships in
English and Russian.

## Documentation

| | English | Русский | Deutsch | 中文 |
|---|---|---|---|---|
| Getting started | [en](docs/en/getting-started.md) | [ru](docs/ru/getting-started.md) | [de](docs/de/getting-started.md) | [zh](docs/zh/getting-started.md) |
| OpenApiReference | [en](docs/en/reference.md) | [ru](docs/ru/reference.md) | [de](docs/de/reference.md) | [zh](docs/zh/reference.md) |
| Standalone page and OpenApiPage | [en](docs/en/standalone.md) | [ru](docs/ru/standalone.md) | [de](docs/de/standalone.md) | [zh](docs/zh/standalone.md) |
| Deep links and prefilled links | [en](docs/en/links.md) | [ru](docs/ru/links.md) | [de](docs/de/links.md) | [zh](docs/zh/links.md) |
| Embedding an operation | [en](docs/en/embed.md) | [ru](docs/ru/embed.md) | [de](docs/de/embed.md) | [zh](docs/zh/embed.md) |
| API blocks | [en](docs/en/blocks.md) | [ru](docs/ru/blocks.md) | [de](docs/de/blocks.md) | [zh](docs/zh/blocks.md) |
| TypeScript types | [en](docs/en/types.md) | [ru](docs/ru/types.md) | [de](docs/de/types.md) | [zh](docs/zh/types.md) |
| AsyncAPI | [en](docs/en/asyncapi.md) | [ru](docs/ru/asyncapi.md) | [de](docs/de/asyncapi.md) | [zh](docs/zh/asyncapi.md) |
| OpenApiEditor | [en](docs/en/editor.md) | [ru](docs/ru/editor.md) | [de](docs/de/editor.md) | [zh](docs/zh/editor.md) |
| Core API | [en](docs/en/core.md) | [ru](docs/ru/core.md) | [de](docs/de/core.md) | [zh](docs/zh/core.md) |
| Code samples | [en](docs/en/snippets.md) | [ru](docs/ru/snippets.md) | [de](docs/de/snippets.md) | [zh](docs/zh/snippets.md) |
| Theming | [en](docs/en/theming.md) | [ru](docs/ru/theming.md) | [de](docs/de/theming.md) | [zh](docs/zh/theming.md) |

## Install

```bash
npm install @dskripchenko/openapi
# for the Vue components:
npm install vue @dskripchenko/ui
```

Vue 3.4+ and `@dskripchenko/ui` 1.13+ are optional peer dependencies: the
core does not need them. Node 20 or newer for server-side use; any current
browser.

## License

[MIT](LICENSE). Security issues: see [SECURITY.md](SECURITY.md).
