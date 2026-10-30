# AsyncAPI

Event-driven APIs described with AsyncAPI 2.x (2.0–2.6) or 3.0 are read and
shown the same way as OpenAPI specs.

## On a page

```vue
<script setup lang="ts">
import { AsyncApiReference } from '@dskripchenko/openapi/vue'
import '@dskripchenko/openapi/style.css'
</script>

<template>
  <AsyncApiReference :spec="yamlOrJsonText" locale="en" />
</template>
```

The page shows the document's description and servers (protocol, address,
variables), then the operations, grouped by tag — or by channel when no
operation has tags. Each operation shows whether the application **sends**
or **receives**, the channel's address with its `{parameters}` marked, the
parameters, every message (headers and payload schemas, content type,
correlation id, an example — the document's own or one made from the
schemas — and bindings), the reply of a request/reply operation (3.0) and
the operation's bindings. Then come the messages and schemas of the
components. Schemas use the same view as the OpenAPI reference.

A payload in another schema language (Avro, Protobuf, RAML…) is shown as
written, with its format.

| Prop       | Type                     | Meaning                                         |
| ---------- | ------------------------ | ----------------------------------------------- |
| `spec`     | `string \| object`       | The document: YAML or JSON text, or a parsed object |
| `locale`   | `string`                 | `en` or `ru`; the browser's language by default |
| `labels`   | `Partial<AsyncApiLabels>`| Overrides of the texts                          |
| `external` | `(url) => unknown`       | Loads documents that `$ref`s point to by URL    |

Slots: `actions` (the header) and `footer`.

## In code

```ts
import { loadAsyncApi, detectSpecKind } from '@dskripchenko/openapi'

detectSpecKind(parsed) // 'asyncapi' | 'openapi' | null
const spec = loadAsyncApi(text)
spec.operations // [{ id, action: 'send' | 'receive', channel, messages, reply, bindings, … }]
spec.channels // [{ id, address, parameters, messages, servers, … }]
spec.servers // [{ id, url, protocol, variables, … }]
```

Both versions are read into one shape. AsyncAPI 2.x describes operations
from the client's side; they are turned around to the application's, as in
3.0: a channel the application `subscribe`s to is one it **sends** on,
`publish` is **receive**. Message and operation traits are applied, `$ref`s
are followed, and a message referred to from several places is one object.
`warnings` lists what could not be resolved.
