# @dskripchenko/openapi

## 1.0.0

### Major Changes

- First release: Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 in YAML or JSON, with no runtime dependencies in the core.
  - Core (`@dskripchenko/openapi`): YAML and JSON parsers with source positions and errors by line; normalization of 2.0 and 3.0 documents to the 3.1 shape; a `$ref` resolver with cycle detection and external documents through a host loader; operations indexed and grouped by tag; structural validation with line numbers; schema samples in JSON and XML, a JSON Schema 2020-12 validator and short type labels; request building by `style` / `explode` with apiKey, http and OAuth2 credentials; `sendRequest` over `fetch` and `fetchOAuthToken` for the client-credentials and password flows; code samples for 13 targets (cURL, JavaScript fetch, Node axios, PHP Guzzle, PHP Laravel Http, Python requests, Go, Java, C#, Kotlin, Swift, raw HTTP, PowerShell).
  - `OpenApiReference` (`@dskripchenko/openapi/vue`): navigation with search, operations by tag, schema trees, examples, request samples, a try-it panel with a replaceable transport (`send`) for a server-side proxy, an authentication panel, servers with variables, webhooks and callbacks, deep links `#operation/{id}` and `#schema/{name}`, English and Russian interface.
  - `OpenApiEditor`: visual forms for info, servers, tags, security schemes, paths, operations and schemas; the source with highlighting and problems by line; a preview; `v-model` text that keeps its YAML or JSON format; conversion of Swagger 2.0 documents to OpenAPI 3.1.
