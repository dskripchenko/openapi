# AsyncAPI

Ereignisgesteuerte APIs, beschrieben mit AsyncAPI 2.x (2.0–2.6) oder 3.0,
werden wie OpenAPI-Spezifikationen gelesen und gezeigt.

## Auf einer Seite

```vue
<script setup lang="ts">
import { AsyncApiReference } from '@dskripchenko/openapi/vue'
import '@dskripchenko/openapi/style.css'
</script>

<template>
  <AsyncApiReference :spec="yamlOrJsonText" locale="en" />
</template>
```

Die Seite zeigt die Beschreibung des Dokuments und die Server (Protokoll,
Adresse, Variablen), dann die Operationen, gruppiert nach Tag — oder nach
Kanal, wenn keine Operation Tags hat. Jede Operation zeigt, ob die Anwendung
**sendet** oder **empfängt**, die Adresse des Kanals mit hervorgehobenen
`{Parametern}`, die Parameter, jede Nachricht (Schemata von Kopfzeilen und
Nutzlast, Inhaltstyp, Korrelations-ID, ein Beispiel — aus dem Dokument oder
aus den Schemata erzeugt — und Bindings), die Antwort einer
Request/Reply-Operation (3.0) und die Bindings der Operation. Danach folgen
die Nachrichten und Schemata der Komponenten. Schemata werden wie in der
OpenAPI-Referenz dargestellt.

Eine Nutzlast in einer anderen Schemasprache (Avro, Protobuf, RAML…) wird so
gezeigt, wie sie geschrieben ist, mit ihrem Format.

| Prop       | Typ                      | Bedeutung                                          |
| ---------- | ------------------------ | -------------------------------------------------- |
| `spec`     | `string \| object`       | Das Dokument: YAML- oder JSON-Text oder ein geparstes Objekt |
| `locale`   | `string`                 | `en` oder `ru`; standardmäßig die Browsersprache   |
| `labels`   | `Partial<AsyncApiLabels>`| Ersetzte Texte                                     |
| `external` | `(url) => unknown`       | Lädt Dokumente, auf die `$ref`s per URL verweisen  |

Slots: `actions` (im Kopf) und `footer`.

## Im Code

```ts
import { loadAsyncApi, detectSpecKind } from '@dskripchenko/openapi'

detectSpecKind(parsed) // 'asyncapi' | 'openapi' | null
const spec = loadAsyncApi(text)
spec.operations // [{ id, action: 'send' | 'receive', channel, messages, reply, bindings, … }]
spec.channels // [{ id, address, parameters, messages, servers, … }]
spec.servers // [{ id, url, protocol, variables, … }]
```

Beide Versionen werden in eine Form gebracht. AsyncAPI 2.x beschreibt
Operationen aus Sicht des Clients; sie werden wie in 3.0 auf die Sicht der
Anwendung gedreht: Ein Kanal, den die Anwendung „abonniert“ (`subscribe`), ist
einer, auf dem sie **sendet**, `publish` ist **Empfang**. Traits von
Nachrichten und Operationen werden angewendet, `$ref`s aufgelöst, und eine
Nachricht, auf die mehrere Stellen verweisen, ist ein einziges Objekt.
`warnings` nennt, was nicht aufgelöst werden konnte.
