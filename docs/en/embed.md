# Embedding an operation

A single operation can be shown inside other documentation — a guide, a
changelog, a wiki page — as a compact card: the method, path and summary, a
small toolbar, and the operation as the reference shows it, with parameters,
body, responses, request samples, types and try-it. There is no header,
navigation or footer.

## In Vue: OpenApiOperation

```vue
<script setup lang="ts">
import { OpenApiOperation } from '@dskripchenko/openapi/vue'

const spec = () => fetch('/docs/v1.json').then((r) => r.json())
</script>

<template>
  <OpenApiOperation :spec="spec" operation="createOrder" reference-url="/docs" spec-id="v1" locale="en" />
</template>
```

`operation` names the operation in any of these ways:

- its id — the `operationId`, or the slug the reference gives an operation
  without one (`get-pets-id`);
- `METHOD /path` — `POST /orders`; a path with a server's base path in front
  (`POST /api/v1/orders`) is found too;
- an anchor — `operation/{id}` (with or without a spec segment and `#`) or
  Scalar's `tag/{tag}/{METHOD}{path}`.

When the spec has no such operation, the card says "Operation not found" and
shows the name.

Props:

| Prop | Type | Default | |
|---|---|---|---|
| `spec` | `SpecInput` | — | The spec: text, a parsed object, or a function returning a promise of either. Required. |
| `operation` | `string` | — | The operation, as above. Required. |
| `referenceUrl` | `string` | — | The address of the full reference. Set, the card has an "Open in reference" link to the operation there. |
| `specId` | `string` | — | The spec's id in that reference (its `specs` id, the standalone `slug`): the link's anchor gets it in front, and stored credentials are shared with the reference under the same key. |
| `send`, `tryIt`, `locale`, `labels`, `snippetTargets`, `defaultSnippet`, `baseUrl`, `external`, `persistCredentials`, `oauthRedirectUrl` | | | As on [`OpenApiReference`](reference.md#props). |

Events: `loaded(spec)` and `error(error)`. Exposed: `spec` (the
`LoadedSpec`), `entry` (the `OperationEntry`) and `print()`.

The toolbar has the settings button — the server host and the key icon, as
in the reference's header — which opens a drawer with the server and the
authentication panel; "PDF", which prints the operation (see
[download and print](reference.md#download-and-print)), with the reference
link as its address when `referenceUrl` is set; and "Open in reference".

Several embeds of the same spec input — the same text, the same object, the
same loader function — load it once, and a failed load is tried again by the
next embed. Pass one loader function to all of them rather than a new arrow
each:

```ts
export const v1 = () => fetch('/docs/v1.json').then((r) => r.json())
```

`findOperation(spec, name)` — the lookup the card uses — is exported from
`@dskripchenko/openapi/vue` as well.

## Without a build: the standalone bundle

The [standalone bundle](standalone.md) mounts embeds too. The simplest way
is markup and one script with `data-auto`:

```html
<div data-openapi-operation="createOrder" data-openapi-src="/docs/v1.json"></div>

<p>… the guide continues …</p>

<div data-openapi-operation="GET /orders/{id}" data-openapi-src="/docs/v1.json"></div>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

With `data-auto` on its tag, the script mounts every
`[data-openapi-operation]` element once the document is parsed. Embeds of
the same URL fetch it once. Attributes:

| Attribute | |
|---|---|
| `data-openapi-operation` | The operation, as above. Required. |
| `data-openapi-src` | The spec's URL. |
| `data-openapi-theme` | `light`, `dark` or `system`. |
| `data-openapi-locale` | `en`, `ru` or `auto`. |
| `data-openapi-proxy` | A try-it proxy; see [the proxy](standalone.md#the-proxy). |
| `data-openapi-try-it` | `false` hides try-it. |
| `data-openapi-reference` | The full reference's address, for "Open in reference". |
| `data-openapi-slug` | The spec's id in that reference. |

Elements added later are mounted by calling `DskOpenApi.autoMount(root?)`
again — it skips the ones already mounted (they carry
`data-openapi-mounted`) and returns the new embeds; a broken element is
logged and does not stop the rest.

From a script:

```js
const embed = DskOpenApi.mountOperation('#order-create', {
  source: '/docs/v1.json',
  operation: 'createOrder',
  referenceUrl: '/docs',
  theme: 'system',
  locale: 'auto',
})
embed.setLocale('ru')
embed.unmount()
```

`mountOperation(target, options)` takes a selector or an element and returns
`{ app, unmount(), setTheme(theme), setLocale(locale) }`. Options:

| Option | |
|---|---|
| `operation` | The operation, as above. Required. |
| `source` | The spec's URL, or a source as in `createApiReference` — `{ url?, content?, slug? }`, `content` winning over `url`; `slug` is the spec's id in the reference. |
| `theme` | `'light'`, `'dark'` or `'system'`; see below. |
| `locale` | `'en'`, `'ru'` or `'auto'` (default): `auto` takes the page's `<html lang>`, else the browser's language. The card's `lang` attribute is set to it; the page's own `lang` is left alone. |
| `proxy`, `tryIt`, `referenceUrl`, `baseUrl`, `snippetTargets`, `defaultSnippet`, `persistCredentials`, `oauthRedirectUrl` | As in the tables above and in [`createApiReference`](standalone.md#createapireference). |

## Theme in someone else's page

The kit's themes key off `<html data-theme>`. An embed therefore leaves the
theme to the host page unless one is given: with `theme` (or
`data-openapi-theme`), it writes `data-theme` on `<html>` — for the whole
page — and `system` follows `prefers-color-scheme` live. When the page sets
no `data-theme` at all, the kit's light colours apply to
`:root:not([data-theme])` as custom properties only, which change nothing
the host page itself uses.

The standalone bundle's base styles — box sizing, margins of headings and
paragraphs, the base font — are scoped to the package's own elements and
the kit's overlays, so the host page's text, headings and images stay as
they are. Only a whole reference page (`createApiReference`) also takes the
body's margin and background.
