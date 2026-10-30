# @dskripchenko/openapi

## 1.2.0

### Minor Changes

- ef98146: AsyncAPI: `loadAsyncApi` reads AsyncAPI 2.x and 3.0 into one shape — servers, channels with parameters, operations as send/receive from the application's side (2.x `publish`/`subscribe` turned around), messages with headers, payloads, examples and correlation ids, replies, bindings, traits applied — and `detectSpecKind` tells AsyncAPI and OpenAPI documents apart. `AsyncApiReference` in `@dskripchenko/openapi/vue` shows such a document as a reference page, with the schema view of the OpenAPI reference; payloads in other schema languages are shown as written.

## 1.1.3

### Patch Changes

- b7f42ec: **An embedded reference no longer pulls the page while it scrolls.** The navigation followed the section in view with `scrollIntoView`, which scrolls every scrolling ancestor, the host page among them: in a box on a longer page (a wiki macro, an article) whose top had scrolled past the window, each new section pulled the page back to show its link, and scrolling jerked back and forth. The navigation and the search hits now scroll only their own list.

## 1.1.2

### Patch Changes

- **PDF on iPhone and iPad: the operation, not the whole page.** WebKit on iOS and iPadOS ignores a frame's `print()` and prints the top page — the reference's header, a blank sheet and the whole interface over dozens of sheets. There the print view is now printed from the page itself: it sits in a shadow root (the host's styles stay out) and a print-only stylesheet hides the rest of the page while the dialog is open; the container and the stylesheet go away after printing. Desktop browsers keep the hidden frame. `printOperation` / `printDocument` take `mode: 'auto' | 'frame' | 'page'` (`auto` by default) and resolve with the frame or the page container (`HTMLElement`).
- **The icons are bundled.** The operation, reference and block components import their ~13 lucide icons directly and the build bundles them (the ISC notice is kept, ~9 KB unminified), instead of importing `@dskripchenko/ui/icons` at runtime: the package loads from an ESM CDN without `lucide-vue-next` in the import map.
- A token's expiry read "61 min" for a 60-minute token now and then: the time and the expiry were two clock readings.
- **Margins that survive the print dialog.** With "None" or "Minimum" margins (common in print dialogs on Windows) the dialog drops `@page`, and the text ran to the paper's edge. The margins are now split between `@page` and the print view's own padding, repeated on every sheet: about 14 mm at the sides as before, and 8 mm when the dialog drops `@page` (was 0).

## 1.1.1

### Patch Changes

- **Layout by the reference's own width.** The reference's breakpoints are container queries on `.oa-reference` (and the editor's on `.oa-editor`) instead of window media queries, so a reference in a column or a box of a host page lays out by that width: the side tabs fold under 1180 px, the drawer takes over under 860 px, and with several specs under 560 px the switcher and the search take a second header row. The spec switcher and the search are flexible (no more 200 px + 320 px minimum), the summary gives way before the title, and the search hits open under the whole header on a narrow width. A two-spec reference in a 358 px phone column was 666 px wide; it now fits. The navigation drawer opens inside the reference, under its header. New `--oa-viewport-h` sizes the sticky navigation for a reference that scrolls inside a box.
- **No more empty reference in a host page.** A spec of up to 40 operations renders every card at once; only larger specs build cards as they come near the viewport and skip rendering far ones (`content-visibility: auto`). Before, a small spec opened while off-screen — a lazily loaded reference, a spec switched from code, a full-page capture, a box scrolling on its own — showed blank cards under its tag heading. A host page's rules for bare `main`, `section`, `header`, `nav`, `footer` (`main { max-width; margin: 0 auto }`) no longer squeeze or shift the reference's columns.
- **`proxySend` is exported** from `@dskripchenko/openapi` and `@dskripchenko/openapi/vue`, not only from the standalone bundle: an app builds `send` for a proxy endpoint with the standalone's contract with `proxySend('/api-proxy')`.

## 1.1.0

### Minor Changes

- API blocks: a fenced ` ```openapi ` block in rich content — a few hand-written lines of YAML or JSON describing one or more requests — rendered as live API cards and edited through Preview / Source / Constructor tabs. See [docs/en/blocks.md](docs/en/blocks.md).

  - **Core:** the compact block format (one request, `requests: [...]` with a shared title, base URL and auth, or a whole OpenAPI / Swagger document as is); laravel-api's type shorthand (`string(email)!`, `integer[]`, `file`, `name!` properties); `parseBlock` with errors by line and column, `blockToDocument` (OpenAPI 3.1 with readable operationIds, servers from absolute URLs, security schemes from `auth`), `stringifyBlock` (YAML ⇄ JSON), `inferSchema` (a schema from an example), and the constructor's model `blockToModel` / `modelToBlock` that patches the data and keeps what the form cannot express.
  - **Vue:** `OpenApiBlock` (read-only cards, or editable tabs with a YAML / JSON switch and a constructor of method, URL, parameters, auth, body and responses on kit controls), `mountOpenApiBlock`, and `openApiBlockRenderer` — a block renderer with a live-island `mount` for host editors and markdown views. `blockEn` / `blockRu` strings.
  - **Standalone:** `DskOpenApi.renderBlocks(root?, options?)` turns `<pre><code class="language-openapi">` into read-only widgets; the `data-auto` script does it on load. `DskOpenApi.mountOpenApiBlock` too.

## 1.0.0

### Major Changes

- First release: Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 in YAML or JSON — read, validate, document, try, embed and edit. The core has no runtime dependencies; the Vue components are built on `@dskripchenko/ui`.

  **Core (`@dskripchenko/openapi`)**

  - YAML and JSON parsers with the source position of every value and errors by line and column; `loadSpec` / `parseSpec` / `stringifySpec`.
  - Normalization of 2.0 and 3.0 documents to the 3.1 shape; a `$ref` resolver with cycle detection and external documents through a host loader; operations indexed and grouped by tag.
  - Structural validation with line numbers (`validateDocument`).
  - Schemas: JSON and XML samples, a JSON Schema 2020-12 validator, short type labels.
  - Requests: `buildRequest` by `style` / `explode` with apiKey, http and OAuth2 credentials, form, multipart and binary bodies and undeclared `extra` parameters; `sendRequest` over `fetch` (textual bodies as text, others as a `Blob`, cancellable).
  - OAuth2: token requests for the client-credentials and password flows, PKCE, authorize URLs, callback parsing, code exchange, OpenID Connect discovery.
  - Code samples for 13 targets: cURL, JavaScript fetch, Node axios, PHP Guzzle, PHP Laravel Http, Python requests, Go, Java, C#, Kotlin, Swift, raw HTTP, PowerShell.
  - TypeScript declarations for an operation or a whole document, with response types named by status meaning (`{Op}Success`, `{Op}NotFound`, …).
  - Deep links: Scalar-compatible anchor resolution and the prefilled-link format (version 1).

  **`OpenApiReference`**

  - A sticky header with the title, a spec switcher, full-text search with keyboard navigation (`/`, Ctrl/Cmd+K) and YAML / JSON / `.d.ts` downloads; a settings drawer with the server, the authentication panel, downloads and "Print / PDF"; a footer; `#actions` and `#footer` slots.
  - Navigation by tag with scroll spy, a sliding drawer on narrow screens; operations as cards with "Try it", "Request samples" and "Types" tabs; named examples; folding code blocks.
  - Try-it: typed parameter inputs, a schema-driven JSON body form synced with the text, multipart and urlencoded forms with file uploads, binary bodies, own query / header / cookie rows, a "What will be sent" preview with masked credentials, cancel, and a response viewer with size, pretty / raw JSON, image previews and downloads; a replaceable transport (`send`) for a server-side proxy.
  - Authentication: apiKey, http and every OAuth2 flow — authorization code with PKCE and implicit in a popup, client credentials, password — with OpenID Connect discovery, chosen scopes, token expiry and opt-in persisted credentials (`persistCredentials`).
  - Several specs on one page, loaded on first open (`specs`, `v-model:active`); deep links (`#operation/{id}`, Scalar's forms too) and prefilled links that open an operation with its form filled; print / PDF of an operation or the whole spec through the browser's dialog.
  - English and Russian interface, overridable strings; light and dark themes from the kit; links from the spec limited to http(s), mailto and relative addresses.

  **More components**

  - `OpenApiOperation`: one operation embedded in other documentation, with a shared spec cache.
  - `OpenApiPage`: the reference as a whole page with theme (light / dark / system) and language switchers.
  - `OpenApiEditor`: visual forms for info, servers, tags, security schemes, paths, operations and schemas; the source with highlighting and problems by line; a preview with the reference's options; an `issues` event; `v-model` text that keeps its YAML or JSON format; conversion of Swagger 2.0 documents to OpenAPI 3.1.

  **Standalone bundle (`dist/standalone.js`, global `DskOpenApi`)**

  - `createApiReference(target, options)` with Scalar's `sources` shape, theme and language options; `mountOperation`, `autoMount` and `data-openapi-*` markup for embeds; a try-it proxy transport that carries files and binary responses as base64.
