# Erste Schritte

## Installation

```bash
npm install @dskripchenko/openapi
```

Das Paket hat zwei Einstiegspunkte:

- `@dskripchenko/openapi` — der Kern: Parsen, Normalisierung, Validierung,
  Schemabeispiele, Aufbau von Anfragen und Codebeispiele. Reines TypeScript
  ohne Abhängigkeiten; es läuft im Browser, in Node 20+ und in einem
  Build-Skript.
- `@dskripchenko/openapi/vue` — die Komponenten `OpenApiReference` und
  `OpenApiEditor`. Sie benötigen Vue 3.4+ und
  [`@dskripchenko/ui`](https://github.com/dskripchenko/ui) 1.13+, die als
  optionale Peer-Abhängigkeiten deklariert sind:

```bash
npm install vue @dskripchenko/ui
```

Beide Einstiegspunkte sind ES-Module mit einem CommonJS-Build daneben und
eigenen Typdefinitionen. Wer nur den Kern verwendet, braucht weder Vue noch
das Kit.

## Styles

Die Komponenten verwenden die Design-Tokens und Komponenten des Kits; daher
kommt zuerst das Stylesheet des Kits, dann das des Pakets:

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'

import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/openapi/style.css'

createApp(App).mount('#app')
```

`all.css` enthält Tokens, Themes, Reset, Grundtypografie und
Komponenten-Styles des Kits in einer Datei. Wenn Sie die Styles des Kits
einzeln importieren, brauchen die Komponenten die Tokens, die Themes und die
Komponenten-Styles (`tokens.css`, `themes.css`, `index.css`).

## Eine API-Referenz

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
import spec from './openapi.yaml?raw'
</script>

<template>
  <OpenApiReference :spec="spec" locale="en" />
</template>
```

`spec` ist YAML- oder JSON-Text oder ein bereits geparstes Objekt.
Akzeptiert werden Swagger 2.0, OpenAPI 3.0 und OpenAPI 3.1; Format und
Version werden erkannt. Die Seite zeigt eine Navigation mit Suche, alle
Operationen nach Tags gruppiert, die Schemas, Anfragebeispiele in 13 Sprachen
und ein „Try it“-Panel.

Der `?raw`-Import oben ist ein Vite-Feature. Um die Spezifikation zur
Laufzeit zu laden, holen Sie sie als Text und rendern die Komponente, sobald
er da ist:

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

Eine Spezifikation, die sich nicht lesen lässt, zeigt statt der Seite einen
Fehlerkasten, und die Komponente löst `error` aus. Alle Props stehen unter
[der Referenz](reference.md).

## Ein Editor

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

`v-model` ist der Text des Dokuments. Der Editor hat drei Ansichten —
visuelle Formulare, den Quelltext und eine Vorschau — und behält das Format
des Textes bei: Ein YAML-Dokument bleibt YAML. Siehe [den Editor](editor.md).

## Ohne Vue

Der Kern funktioniert auch allein:

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

`loadSpec` wirft `YamlError` oder `JsonError` bei Text, der sich nicht lesen
lässt, und `OpenApiError` bei einem Dokument, das keine Swagger- oder
OpenAPI-Spezifikation ist. Das zurückgegebene `document` hat immer die Form
von OpenAPI 3.1, unabhängig von der Version der Eingabe. Siehe
[die Kern-API](core.md).

## Weiter

- [OpenApiReference](reference.md) — Props, Try-it, ein serverseitiger
  Proxy, Authentifizierung, Server, Sprachen
- [OpenApiEditor](editor.md) — die drei Ansichten, was die Formulare abdecken,
  Swagger-2.0-Dokumente
- [Kern-API](core.md) — alle Funktionen von `@dskripchenko/openapi`
- [Codebeispiele](snippets.md) — die 13 Ziele und was sie zum Ausführen
  brauchen
- [Theming](theming.md) — das dunkle Theme und die `--oa-*`-Variablen
