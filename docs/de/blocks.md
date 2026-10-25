# API-Blöcke

Ein API-Block ist ein Codeblock mit der Sprache `openapi` in Rich Content —
einem WYSIWYG-Editor, einer Markdown-Seite, einer beliebigen HTML-Seite. Sein
YAML oder JSON beschreibt eine oder mehrere HTTP-Anfragen. Gerendert wird er
zu einem lebendigen API-Widget — der kompakten Karte der
[Einbettung](embed.md): Methode und Pfad, Parameter, Body, Antworten, ein
Try-it, das wirklich sendet, Anfragebeispiele, TypeScript-Typen und PDF.
Bearbeitbar hat er drei Tabs: **Vorschau**, **Quelltext** und
**Konstruktor** — ein Formular der Anfragen. Quelltext und Konstruktor sind
zwei Ansichten desselben Textes: eine Änderung in einem ist sofort im
anderen.

````markdown
```openapi
method: POST
url: https://api.example.com/v1/users/{id}
summary: Update a user
auth: bearer
params:
  path: { id: integer }
body:
  example: { name: Ann, age: 31 }
responses:
  200: { description: The updated user, example: { id: 7, name: Ann } }
  404: Not found
```
````

Die Oberfläche des Widgets gibt es auf Englisch und Russisch (`locale`);
eigene Texte über `blockLabels`.

## Das Format

Ein Block enthält eine Anfrage, mehrere Anfragen oder ein ganzes
OpenAPI-Dokument. YAML und JSON funktionieren beide; das erste Zeichen
entscheidet (`{` ist JSON).

### Eine Anfrage

| Schlüssel | | |
|---|---|---|
| `url` | Pflicht | Eine absolute URL (`https://api.example.com/v1/users/{id}`) oder ein Pfad (`/users/{id}`). `{name}` ist ein Pfadparameter; ein Query-String (`?page=1`) ergibt Query-Parameter mit diesen Beispielen. |
| `method` | `GET` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`, beliebige Schreibweise. |
| `summary` | | Der Titel der Karte. |
| `description` | | Markdown. |
| `auth` | | Siehe [Authentifizierung](#authentifizierung). |
| `params` | | `path`, `query`, `header`, `cookie` — jeweils Name → Parameter. |
| `body` | | Siehe [Body und Antworten](#body-und-antworten). |
| `responses` | `200: OK` | Status (`200`, `4XX`, `default`) → eine Beschreibung oder ein Objekt. |
| `operationId`, `tags`, `deprecated` | | Wie in OpenAPI. `operationId` entsteht standardmäßig aus Methode und Pfad: `POST /v1/users/{id}` → `postV1UsersById`. |
| `title`, `version` | | Titel des Dokuments (standardmäßig die Summary) und Version. |
| `baseUrl`, `servers` | | Siehe [mehrere Anfragen](#mehrere-anfragen). |
| `x-…` | | Bleiben an der Operation. |

Ein unbekannter Schlüssel ist ein Fehler mit Hinweis (`Unknown key
"respones" — did you mean "responses"?`) in seiner Zeile.

### Typen

Ein Parameter, ein Header oder eine Schema-Eigenschaft ist ein Typ in
Kurzschreibweise — wie in laravel-api: `type(format)! Beschreibung`.

| Kurzform | Bedeutung |
|---|---|
| `string`, `integer`, `number`, `boolean`, `object`, `array` | Der Typ. |
| `string(email)`, `integer(int64)`, `string(date-time)` | Mit Format. |
| `string[]`, `integer[][]` | Arrays. |
| `file` | Ein Datei-Upload: `string(binary)`. |
| `integer!` | Pflicht (Pfadparameter sind es immer). |
| `integer! The user's id` | Text nach dem ersten Leerzeichen ist die Beschreibung. |

Oder ein Objekt — Parameterfelder (`description`, `required`, `deprecated`,
`example`, `style`, `explode`, `schema`) neben Schemafeldern (`type`, auch als
Kurzform, `format`, `enum`, `default`, `minimum`, …):

```yaml
params:
  query:
    sort: { type: string, enum: [name, date], description: Order, example: name }
    page: { type: integer!, minimum: 1 }
```

Ein Pfadparameter der URL, den `params.path` nicht deklariert, ist ein String.

### Body und Antworten

```yaml
body:
  type: json            # Standard; auch form, multipart, text, xml, binary oder ein Media Type
  example: { name: Ann }
  schema: { ... }       # optional: ohne wird es aus dem Beispiel abgeleitet
  description: The new user
  required: true        # Standard
responses:
  200:
    description: OK     # standardmäßig die Statusphrase
    type: json
    example: { id: 7 }
    headers: { X-Rate-Limit: integer Calls left }
  404: Not found        # nur eine Beschreibung
  default:              # leer: "Error"
```

Ein `schema` ist JSON Schema, in dem die Kurzschreibweise ebenfalls gilt:
eine Eigenschaft darf ein Typ-String sein, ein Eigenschaftsname mit `!` am
Ende ist Pflicht, `items` darf ebenfalls Kurzform sein.

```yaml
schema:
  type: object
  properties:
    name: string!
    email: string(email) Where receipts go
    tags!: { type: array, items: string }
```

Ohne Schema liefert das Beispiel eines (`inferSchema`): Typen nach JSON-Art,
Ganzzahlen getrennt von anderen Zahlen, die Formate `date-time`, `date`,
`uuid`, `email` und `uri`, Array-Elemente aus allen Elementen
zusammengeführt.

### Authentifizierung

| `auth` | Security Scheme |
|---|---|
| `bearer` | HTTP Bearer; `{ type: bearer, format: JWT }` fügt das Format hinzu. |
| `basic` | HTTP Basic. |
| `apiKey` | Ein API-Schlüssel im Header `X-API-Key`; `{ type: apiKey, in: header \| query \| cookie, name: X-Key }`. |
| `{ type: oauth2, flow, authorizationUrl, tokenUrl, scopes }` | OAuth 2.0. `flow` ist `authorizationCode`, `clientCredentials`, `password` oder `implicit`; ohne ihn entscheiden die URLs. `scopes` ist eine Liste oder Name → Beschreibung. |
| `{ type: openIdConnect, url }` | OpenID Connect Discovery. |
| `none` | Keine Authentifizierung — überschreibt eine gemeinsame. |

Die Zugangsdaten fragt die Karte in ihrem Einstellungs-Drawer ab, wie die
Referenz.

### Mehrere Anfragen

```yaml
title: Orders
baseUrl: https://api.example.com/v2
auth: bearer              # Standard für jede Anfrage
requests:
  - url: /orders?page=1
    summary: List orders
  - method: POST
    url: /orders
    summary: Create an order
    body: { type: form, example: { item: book, qty: 2 } }
  - url: https://files.example.com/upload
    method: PUT
    auth: none
```

Gemeinsame Schlüssel: `title`, `description` (Markdown über den Karten),
`version`, `baseUrl` (Pfade werden dagegen aufgelöst; er wird zum Server),
`servers` (eine Liste von URLs oder `{ url, description }`), `auth` und `x-…`.
Ohne Basis-URL ist der Host der ersten absoluten URL der Server; eine Anfrage
an einen anderen Host bekommt einen eigenen.

### Ein ganzes Dokument

Ein Block mit einem `openapi`- oder `swagger`-Schlüssel ist ein OpenAPI-3.x-
oder Swagger-2.0-Dokument und wird unverändert übernommen: jede Operation
wird zur Karte. Der Konstruktor bearbeitet solche Blöcke nicht, der
Quelltext schon.

## Core-API

Aus `@dskripchenko/openapi`:

```ts
import { parseBlock, stringifyBlock, blockToDocument, inferSchema } from '@dskripchenko/openapi'

const r = parseBlock(text)
if (r.ok) {
  r.document // OpenAPI 3.1
  r.kind     // 'requests' | 'document'
  r.format   // 'yaml' | 'json'
  r.data     // der geparste Text
} else {
  r.error    // { message, line?, column?, pointer? }
}
stringifyBlock(r.data, 'json')   // YAML ↔ JSON
```

- `parseBlock(text)` wirft nie. Syntax- und Formfehler kommen beide mit Zeile
  und Spalte.
- `blockToDocument(data)` wandelt geparste kompakte Daten um; wirft
  `BlockError` (mit `pointer`).
- `inferSchema(value)` — ein JSON Schema aus einem Beispiel.
- `parseShorthand`, `formatShorthand`, `expandSchema` — die Kurzschreibweise.
- `blockToModel(data, format)` / `modelToBlock(model, base, format)` — das
  Formularmodell des Konstruktors und der Rückweg. Der Rückweg patcht `base`:
  Felder, die das Formular nicht geändert hat, behalten ihren Wert genau wie
  geschrieben (Kurz- oder Objektform, `enum`, Antwort-Header, `x-`-Schlüssel…),
  also ist `modelToBlock(blockToModel(data), data).data` gleich `data`. Texte,
  die sich nicht lesen lassen (ein Beispiel, das kein JSON ist), lassen den
  alten Wert und erscheinen in `errors`. `syncOrigins(model)` nach dem
  Schreiben, `syncPathParams(request)` nach einer URL-Änderung.

## In Vue: OpenApiBlock

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiBlock } from '@dskripchenko/openapi/vue'

const source = ref('url: https://api.example.com/health\nsummary: Health check\n')
</script>

<template>
  <OpenApiBlock v-model:source="source" editable locale="en" />
</template>
```

| Prop | Typ | Standard | |
|---|---|---|---|
| `source` | `string` | — | Der Text des Blocks. Änderungen kommen als `update:source`, im Format des Textes. |
| `editable` | `boolean` | `false` | Tabs Vorschau / Quelltext / Konstruktor; schreibgeschützt nur die Vorschau. |
| `tab` | `'preview' \| 'source' \| 'constructor'` | `'preview'` | Der Tab, mit dem ein bearbeitbarer Block öffnet. |
| `locale` | `string` | — | `en` oder `ru`. |
| `labels` | `Partial<OpenApiLabels>` | | Die Texte der Karten. |
| `blockLabels` | `Partial<BlockLabels>` | | Die eigenen Texte des Widgets (`blockEn`, `blockRu`). |
| `debounce` | `number` | `300` | Millisekunden von der letzten Konstruktor-Änderung bis `update:source`. |
| `send`, `tryIt`, `snippetTargets`, `defaultSnippet`, `baseUrl`, `persistCredentials`, `oauthRedirectUrl` | | | Wie bei [`OpenApiOperation`](embed.md). |

Exponiert: `tab`, `text`, `parsed` und `flush()` (schreibt ausstehende
Konstruktor-Änderungen sofort). Der YAML/JSON-Schalter im Quelltext-Tab
konvertiert den Text (YAML-Kommentare überleben weder eine Konvertierung noch
eine Konstruktor-Änderung); ein Parse-Fehler wird mit seiner Zeile gezeigt.
Der Konstruktor ändert nur, was man in ihm ändert: was er nicht ausdrücken
kann, bleibt im Quelltext wie geschrieben.

### Ohne Template mounten

```ts
import { mountOpenApiBlock } from '@dskripchenko/openapi/vue'

const handle = mountOpenApiBlock(el, {
  source,
  editable: true,
  onChange: (next) => save(next),
  appContext: app._context, // optional: die Provides des Hosts (Kit-Theme, i18n) erreichen das Widget
})
handle.update(newSource) // eine Änderung von außen; der offene Tab bleibt
handle.destroy()
```

## Der Block-Renderer-Vertrag

Editoren und Markdown-Ansichten, die Codeblöcke nach Sprache rendern, nehmen
einen **Block-Renderer**. `openApiBlockRenderer(options?)` liefert einen für
` ```openapi `:

```ts
type BlockRenderer = (code: string, ctx: { language: string; index: number }) => BlockRenderResult | Promise<BlockRenderResult>

interface BlockRenderResult {
  html?: string
  error?: string
  /** Eine lebendige Insel: mit dem Insel-Element aufgerufen; liefert ein Handle. */
  mount?: (el: HTMLElement, ctx: BlockMountContext) => BlockMountHandle | (() => void) | void
}

interface BlockMountContext {
  code: string
  language: string
  /** false in schreibgeschützten Ansichten. */
  editable: boolean
  /** Ersetzt den Code des Blocks (nur bearbeitbar); der Host rendert die Insel dafür nicht neu. */
  setCode(code: string): void
}

interface BlockMountHandle { update?(code: string): void; destroy?(): void }
```

Der Renderer liefert immer `{ mount }`, auch für einen Block, der sich nicht
lesen lässt: das Widget zeigt den Fehler selbst, und ein bearbeitbares lässt
ihn im Quelltext oder Konstruktor beheben. `mount` mountet das Widget
bearbeitbar, wo `ctx.editable` es ist, gibt Änderungen an `ctx.setCode`, und
sein `update(code)` übernimmt Änderungen von außen (Undo, Redo), ohne den
offenen Tab zu verlieren.

```ts
import { openApiBlockRenderer } from '@dskripchenko/openapi/vue'

const renderers = { openapi: openApiBlockRenderer({ locale: 'en', appContext: app._context }) }
```

Die Typen werden ebenfalls aus `@dskripchenko/openapi/vue` exportiert.

## Ohne Build: renderBlocks

Das [Standalone-Bundle](standalone.md) rendert Blöcke auf jeder Seite. Ein
Markdown-Renderer macht aus ` ```openapi ` ein
`<pre><code class="language-openapi">`; `language-openapi-yaml` und
`language-openapi-json` werden auch gefunden.

```html
<pre><code class="language-openapi">url: https://api.example.com/health
summary: Health check
</code></pre>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

Mit `data-auto` rendert das Skript alle solchen Blöcke, sobald das Dokument
geparst ist (und mountet die `[data-openapi-operation]`-Einbettungen); die
Attribute `data-openapi-theme`, `data-openapi-locale` und
`data-openapi-proxy` des Tags gelten auch für die Blöcke. Aus einem Skript:

```js
const blocks = DskOpenApi.renderBlocks('#article', { locale: 'auto', theme: 'system', proxy: '/try-it-proxy' })
blocks[0].element // das Element des Widgets anstelle des <pre>
blocks[0].destroy()
```

`renderBlocks(root?, options?)` nimmt einen Knoten oder Selektor
(standardmäßig das Dokument) und liefert die gerenderten Blöcke:
`{ element, update(source), destroy() }`. Ein gerenderter Block ist kein
Codeelement mehr, also rendert ein erneuter Aufruf nach neuem Inhalt nur die
neuen. Optionen: `theme`, `locale` (`en`, `ru`, `auto`), `proxy` sowie die
Widget-Optionen `tryIt`, `labels`, `blockLabels`, `snippetTargets`,
`defaultSnippet`, `baseUrl`, `persistCredentials`, `oauthRedirectUrl`. Hier
sind Blöcke schreibgeschützt; `DskOpenApi.mountOpenApiBlock(el, options)`
mountet einen bearbeitbaren.
