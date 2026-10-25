# @dskripchenko/openapi

## Unreleased

### Minor Changes

- API blocks: a fenced ```` ```openapi ```` block in rich content — a few hand-written lines of YAML or JSON describing one or more requests — rendered as live API cards and edited through Preview / Source / Constructor tabs. See [docs/en/blocks.md](docs/en/blocks.md).

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
