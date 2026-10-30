---
'@dskripchenko/openapi': minor
---

AsyncAPI: `loadAsyncApi` reads AsyncAPI 2.x and 3.0 into one shape — servers, channels with parameters, operations as send/receive from the application's side (2.x `publish`/`subscribe` turned around), messages with headers, payloads, examples and correlation ids, replies, bindings, traits applied — and `detectSpecKind` tells AsyncAPI and OpenAPI documents apart. `AsyncApiReference` in `@dskripchenko/openapi/vue` shows such a document as a reference page, with the schema view of the OpenAPI reference; payloads in other schema languages are shown as written.
