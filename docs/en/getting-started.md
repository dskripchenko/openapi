# Getting started

## Install

```bash
npm install @dskripchenko/openapi
```

The package has two entry points:

- `@dskripchenko/openapi` — the core: parsing, normalization, validation,
  schema samples, request building and code samples. Plain TypeScript with no
  dependencies; it runs in a browser, in Node 20+ and in a build script.
- `@dskripchenko/openapi/vue` — the `OpenApiReference` and `OpenApiEditor`
  components. They need Vue 3.4+ and [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.13+, declared as optional peer dependencies:

```bash
npm install vue @dskripchenko/ui
```

Both entry points are ES modules with a CommonJS build beside them and their
own type definitions. If you only use the core, you do not need Vue or the kit.

## Styles

The components use the kit's design tokens and components, so the kit's
stylesheet goes first, then the package's own:

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'

import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/openapi/style.css'

createApp(App).mount('#app')
```

`all.css` is the kit's tokens, themes, reset, base typography and component
styles in one file. If you import the kit's styles one by one, the tokens,
themes and component styles (`tokens.css`, `themes.css`, `index.css`) are the
ones the components need.

## An API reference

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
import spec from './openapi.yaml?raw'
</script>

<template>
  <OpenApiReference :spec="spec" locale="en" />
</template>
```

`spec` is YAML or JSON text, or an already parsed object. Swagger 2.0,
OpenAPI 3.0 and OpenAPI 3.1 are accepted; the format and the version are
detected. The page shows a navigation with a search, every operation grouped
by tag, the schemas, request samples in 13 languages and a "Try it" panel.

The `?raw` import above is a Vite feature. To load the spec at run time,
fetch it as text and render the component once it is there:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const spec = ref<string | null>(null)
onMounted(async () => {
  spec.value = await (await fetch('/openapi.yaml')).text()
})
</script>

<template>
  <OpenApiReference v-if="spec" :spec="spec" locale="en" />
</template>
```

A spec that cannot be read shows an error box in place of the page, and the
component emits `error`. `spec` may also be a function returning a promise of
the text or object; the reference then loads it itself. Several specs — APIs
or versions — go on one page through `specs`, with a switcher in the
navigation. See [the reference](reference.md) for every prop.

## An editor

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiEditor } from '@dskripchenko/openapi/vue'

const text = ref(`openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths: {}
`)
</script>

<template>
  <OpenApiEditor v-model="text" locale="en" />
</template>
```

`v-model` is the text of the document. The editor has three views — visual
forms, the source, and a preview — and keeps the text in the format it came
in: a YAML document stays YAML. See [the editor](editor.md).

## Without Vue

The core works on its own:

```ts
import { loadSpec, buildRequest, serverUrl, generateSnippet } from '@dskripchenko/openapi'

const spec = loadSpec(text)               // YAML or JSON text, or an object

for (const op of spec.operations) {
  console.log(op.method.toUpperCase(), op.path, op.id)
}

const op = spec.operations.find((o) => o.id === 'getPet')!
const request = buildRequest({
  method: op.method,
  path: op.path,
  server: serverUrl(spec.document.servers![0]!),
  parameters: op.parameters,
  values: { path: { id: 42 } },
})

console.log(generateSnippet('curl', request))
// curl 'https://api.example.com/v1/pets/42'
```

`loadSpec` throws `YamlError` or `JsonError` for text that cannot be read and
`OpenApiError` for a document that is not a Swagger or OpenAPI spec. The
returned `document` is always in the OpenAPI 3.1 shape, whatever the version
of the input. See [the core API](core.md).

## Next

- [OpenApiReference](reference.md) — props, try-it, a server-side proxy,
  authentication, servers, languages
- [OpenApiEditor](editor.md) — the three views, what the forms cover, Swagger
  2.0 documents
- [Core API](core.md) — every function of `@dskripchenko/openapi`
- [Code samples](snippets.md) — the 13 targets and what they need to run
- [Theming](theming.md) — the dark theme and the `--oa-*` variables
