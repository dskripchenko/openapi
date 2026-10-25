# Standalone page and OpenApiPage

Two ways to get a whole documentation page rather than a component inside
your app:

- **the standalone bundle** — one `<script>` on any HTML page, no build
  step, no Vue in your project;
- **`OpenApiPage`** — a Vue component: the reference with theme and language
  switchers in its header.

The standalone bundle is `OpenApiPage` packed with Vue, the kit and all the
styles. It also mounts single operations into other pages: see
[embedding](embed.md).

## The standalone bundle

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
    <script>
      DskOpenApi.createApiReference('#app', {
        sources: [
          { url: '/docs/v1.json', title: 'API v1', slug: 'v1' },
          { url: '/docs/admin.yaml', title: 'Admin API', slug: 'admin' },
        ],
      })
    </script>
  </body>
</html>
```

`dist/standalone.js` is a classic script (an IIFE) that defines the global
`DskOpenApi`. It carries Vue, `@dskripchenko/ui` and every stylesheet, and
adds the CSS to the page itself (once, even when the script is included
twice). The kit's base styles — box sizing, heading and paragraph margins,
the base font — are scoped to the package's own elements, so the rest of the
page keeps its look; a page holding a whole reference also gets
`body { margin: 0 }` and the kit's background. The same CSS is published as `dist/standalone.css` for a page that
prefers a `<link>`. In a bundler the two files are
`@dskripchenko/openapi/standalone` and `@dskripchenko/openapi/standalone.css`.

### createApiReference

```ts
DskOpenApi.createApiReference(target, options) // → { app, unmount, setTheme, setLocale }
```

`target` is a CSS selector or an element; when nothing matches, it throws.
The result:

| | |
|---|---|
| `app` | The Vue application. |
| `unmount()` | Removes the page. |
| `setTheme(theme)` | `'light'`, `'dark'` or `'system'`. |
| `setLocale(locale)` | `'en'`, `'ru'` or `'auto'`. |

Options:

| Option | Type | Default | |
|---|---|---|---|
| `sources` | `{ url?, content?, title?, slug? }[]` | — | The specs, one entry each. |
| `url` | `string` | — | One spec without `sources`: where to fetch it. |
| `content` | `string \| object` | — | One spec without `sources`: the spec itself. |
| `locale` | `'en' \| 'ru' \| 'auto'` | `'auto'` | `'auto'` follows the browser's language: Russian for any `ru*`, English otherwise. |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | `'system'` follows `prefers-color-scheme`, live. |
| `persistTheme` | `boolean` | `false` | Remember the theme the visitor picks (localStorage); the remembered one then wins over `theme`. |
| `proxy` | `string` | — | An endpoint that performs try-it requests; see [the proxy](#the-proxy). |
| `baseUrl` | `string` | the page origin | The base a relative server URL is resolved against. |
| `snippetTargets` | `SnippetTarget[]` | all 13 | The sample languages offered. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | The language shown first. |
| `tryIt` | `boolean` | `true` | `false` hides the try-it panels. |
| `title` | `string` | the open spec's title | The bar's title; also sets `document.title`. |
| `persistCredentials` | `boolean \| 'session' \| 'local'` | `false` | Keeps typed credentials in the browser; see the reference page. |
| `oauthRedirectUrl` | `string` | the page URL without query and hash | The OAuth redirect URI the identity provider must allow. |

A source:

- `url` — where the spec is fetched from, JSON or YAML, with same-origin
  cookies. It is fetched the first time the spec is opened.
- `content` — the spec itself, as text or an object. It wins over `url`.
- `title` — the label in the spec switcher; the spec's own title by default.
- `slug` — the spec's id, used in deep links (`#v1/operation/…`). Without it
  the id is the title slugified, else `api-1`, `api-2`, … by position.
  A repeated id gets `-2`, `-3`, … appended.

With one source there is no switcher and anchors carry no id; with several,
see [several specs](reference.md#several-specs). The page's language
switcher also sets `<html lang>`.

### The proxy

With `proxy`, try-it and the authentication panel's token and discovery
requests go through that endpoint instead of straight from the browser. The
contract:

- The page sends `POST {proxy}` with `Content-Type: application/json`,
  `Accept: application/json` and same-origin cookies. When the page has a
  `<meta name="csrf-token" content="…">` (Laravel's convention), its value
  goes in the `X-CSRF-TOKEN` header.
- The body is the `HttpRequest` as JSON:
  `{ method, url, headers: [name, value][], body?: { mediaType, text?, form?, file? } }`.
  `url` is absolute. A file — a form field, or the whole body (`file`) —
  arrives as `{ filename, contentType?, base64? }`, `base64` holding its
  bytes (absent when no file was chosen).
- The endpoint checks the URL against the hosts it allows, performs the
  request and answers `200` with the `HttpResponse` as JSON:
  `{ status, statusText, headers: [name, value][], body, bodyBase64?, duration?, error? }`.
  A binary answer — an image, a PDF — goes in `bodyBase64` with `body: ''`;
  the page then previews it or offers it for download, typed by the
  `Content-Type` header. `error` with `status: 0` says the API was not
  reached. A `body` that is not a string is shown as JSON.
- Any other answer — not 2xx, or not JSON — is shown as a failed request.
- "Cancel" aborts the call to the proxy.

The endpoint is yours to protect: allow only the hosts you mean to, and
require the same sign-in as the rest of your back office, or it is an open
relay. The proxy transport is also exported as `DskOpenApi.proxySend(url)`.

## Migrating from Scalar

The options follow the field names of Scalar's `createApiReference`:
`sources` with `url`, `content`, `title` and `slug`, or `url` / `content` at
the top level for a single spec. A page such as laravel-api's documentation
view, which does

```js
Scalar.createApiReference('#app', { sources: sources })
```

switches by loading the other script and calling the other global with the
same object:

```html
<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
<script>
  DskOpenApi.createApiReference('#app', { sources: sources })
</script>
```

Links built for the Scalar page keep working: `#{doc}/tag/{tag}/{METHOD}{path}`,
`#{doc}/tag/{tag}` and `#{doc}/model/{name}` open the same sections (see
[deep links](links.md#scalar-links)). Scalar options other than the ones
listed above are ignored.

## OpenApiPage

The same page inside a Vue app:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiPage, type PageTheme } from '@dskripchenko/openapi/vue'

const theme = ref<PageTheme>('system')
const locale = ref('auto')
</script>

<template>
  <OpenApiPage v-model:theme="theme" v-model:locale="locale" :specs="specs" persist-theme>
    <template #actions>
      <a href="/">Back to the site</a>
    </template>
  </OpenApiPage>
</template>
```

Props:

| Prop | Type | Default | |
|---|---|---|---|
| `theme` | `PageTheme` | `'system'` | `'light'`, `'dark'` or `'system'`; use `v-model:theme`. |
| `locale` | `string` | `'auto'` | `'en'`, `'ru'` or `'auto'`; use `v-model:locale`. |
| `title` | `string` | the open spec's title | The header's title. |
| `languages` | `string[]` | `['en', 'ru']` | The languages the switcher offers; with one, the switcher is hidden. |
| `persistTheme` | `boolean` | `false` | Keep the chosen theme in localStorage under `dsk-openapi-theme`; it then wins over `theme`. |
| `applyTheme` | `boolean` | `true` | Write the theme to `data-theme` on `<html>`, where the kit's themes read it. Turn off when the host themes the page itself. |

Every other attribute and listener — `spec`, `specs`, `send`, `tryIt`,
`labels`, `@loaded`, … — goes to the inner [`OpenApiReference`](reference.md)
unchanged; `class` and `style` stay on the page. `labels` also translates the
switchers.

The theme and language switchers sit at the right end of the reference's
header. The `#actions` slot puts extra controls before them. The content is
centered with a maximum width of `--oa-page-width` (1440px) and side padding
of `--oa-page-padding` (24px, 16px on narrow screens).

Exposed through a template ref: `reference` (the inner `OpenApiReference`),
`setTheme(theme)`, and `theme` — the theme actually shown, with `'system'`
resolved to `'light'` or `'dark'`.

`PageTheme`, `PAGE_THEMES` (`['light', 'dark', 'system']`) and
`resolveLocale(locale)` — which turns `'auto'` into `'en'` or `'ru'` from the
browser's language — are exported from `@dskripchenko/openapi/vue` as well.
