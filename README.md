# @dskripchenko/openapi

[![CI](https://github.com/dskripchenko/openapi/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/openapi/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/openapi.svg)](https://www.npmjs.com/package/@dskripchenko/openapi)
[![license](https://img.shields.io/npm/l/@dskripchenko/openapi.svg)](LICENSE)

Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 specs in YAML or JSON: read them,
validate them, show them as an API reference with "Try it" and code samples,
and edit them in a visual editor. The core has **no runtime dependencies**;
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

## What is inside

- **`@dskripchenko/openapi`** — the core, plain TypeScript without the DOM:
  YAML and JSON parsers that keep the line of every value, normalization of
  2.0 and 3.0 documents to the 3.1 shape, `$ref` resolution, structural
  validation with line numbers, schema samples (JSON and XML), a JSON Schema
  validator, request building by `style` / `explode` and security schemes,
  and code samples in 13 languages.
- **`@dskripchenko/openapi/vue`** — two components:
  - `OpenApiReference` — navigation with search, operations by tag, schema
    trees, examples, request samples, a try-it panel with credentials and
    OAuth2 token fetching, webhooks, deep links `#operation/{id}` and
    `#schema/{name}`;
  - `OpenApiEditor` — visual forms for info, servers, tags, security
    schemes, paths, operations and schemas, the source with problems by
    line, and a preview. `v-model` is the text, and its format is kept.

Both follow the kit's light and dark themes; the interface ships in English
and Russian.

## Documentation

| | English | Русский | Deutsch | 中文 |
|---|---|---|---|---|
| Getting started | [en](docs/en/getting-started.md) | [ru](docs/ru/getting-started.md) | [de](docs/de/getting-started.md) | [zh](docs/zh/getting-started.md) |
| OpenApiReference | [en](docs/en/reference.md) | [ru](docs/ru/reference.md) | [de](docs/de/reference.md) | [zh](docs/zh/reference.md) |
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
