# OpenApiReference

Eine API-Referenzseite für eine Spezifikation in Swagger 2.0, OpenAPI 3.0
oder OpenAPI 3.1.

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

Die Seite hat zwei Spalten. Links eine Navigation: ein Suchfeld, die
Operationen nach Tags gruppiert, die Webhooks und die Schemas. Rechts das
Dokument: Titel, Version und Beschreibung, die Panels für Server und
Anmeldedaten, dann jede Operation mit ihren Parametern, dem Request-Body, den
Antworten (als Schemabäume mit Beispielen), Callbacks, Anfragebeispielen und
einem „Try it“-Panel, und am Ende die Schemas aus `components.schemas`.

Unter 1100 px Breite rücken Beispiele und Try-it unter die Beschreibung der
Operation; unter 760 px rückt die Navigation über das Dokument.

## Props

| Prop | Typ | Standard | |
|---|---|---|---|
| `spec` | `string \| object` | — | Die Spezifikation: YAML- oder JSON-Text oder ein geparstes Objekt. Pflicht. |
| `send` | `SendFn` | `fetch` der Seite | Sendet Try-it-Anfragen. Siehe [den Proxy](#senden-über-ihren-server). |
| `tryIt` | `boolean` | `true` | `false` blendet die Try-it-Panels aus; die Beispiele bleiben. |
| `locale` | `string` | — | `'en'` oder `'ru'`. Siehe [Sprachen](#sprachen). |
| `labels` | `Partial<OpenApiLabels>` | `{}` | Überschreibt einzelne Texte der Oberfläche. |
| `snippetTargets` | `SnippetTarget[]` | alle 13 | Die für Anfragebeispiele angebotenen Sprachen. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | Die zuerst gezeigte Sprache. |
| `baseUrl` | `string` | der Origin der Seite | Die Basis, gegen die eine relative Server-URL aufgelöst wird. |
| `external` | `(url: string) => unknown \| undefined` | — | Lädt externe `$ref`-Dokumente. Ohne diese Funktion wird keines geladen. |
| `hashNavigation` | `boolean` | `true` | `location.hash` schreiben, wenn ein Eintrag aus der Navigation geöffnet wird. |

Die Spezifikation wird neu geladen, wenn sich `spec` oder `external` ändert.
Beide werden nach Identität verglichen: Übergeben Sie ein neues Objekt, statt
das alte an Ort und Stelle zu ändern, und halten Sie die Funktion `external`
stabil (einmal in `<script setup>` definieren, nicht inline im Template).

## Events

| Event | Payload | |
|---|---|---|
| `loaded` | `LoadedSpec` | Nach jedem erfolgreichen Laden: das normalisierte Dokument, seine Operationen und Gruppen (siehe [`loadSpec`](core.md#eine-spezifikation-laden)). |
| `error` | `Error` | Die Spezifikation ließ sich nicht lesen: ein `YamlError`, `JsonError` oder `OpenApiError`. Die Seite zeigt die Meldung anstelle der Referenz. |

## Exponiert

Über eine Template-Ref:

| | |
|---|---|
| `go(anchor: string): Promise<void>` | Scrollt zu `'operation/{id}'` oder `'schema/{name}'`, markiert den Eintrag in der Navigation und schreibt mit `hashNavigation` den Hash. |
| `spec` | Die aktuelle `LoadedSpec` oder `null`, wenn die Spezifikation sich nicht lesen ließ. |

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const reference = ref<InstanceType<typeof OpenApiReference> | null>(null)
const openPets = () => reference.value?.go('operation/listPets')
</script>

<template>
  <button @click="openPets">List pets</button>
  <OpenApiReference ref="reference" :spec="text" />
</template>
```

## Deep Links

Jede Operation hat den Anker `#operation/{id}` und jedes Schema aus
`components.schemas` den Anker `#schema/{name}`. Die id ist die
`operationId`; eine Operation ohne sie (oder deren `operationId` schon
vergeben ist) bekommt einen Slug aus Methode und Pfad, etwa `get-pets-id` für
`GET /pets/{id}`. Webhook-Operationen bekommen `webhook-{method}-{name}`.

Öffnet sich die Seite mit einem dieser Anker in `location.hash`, scrollt die
Referenz dorthin. Mit `hashNavigation` (der Standard) ersetzt ein Klick in
der Navigation den Hash, sodass sich die Adresse kopieren und weitergeben
lässt. Schalten Sie es ab, wenn die Referenz in einer Seite sitzt, die den
Hash für ihr eigenes Routing verwendet:

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

## Try it

Jede Operation (außer Webhooks) hat ein „Try it“-Panel: ein Feld pro
Parameter, gruppiert nach `path`, `query`, `header` und `cookie`, ein
Textfeld für den Body mit einer Auswahl des Media Types und „Send“. Die
Felder beginnen mit dem `example` oder `default` des Parameters oder — bei
Pflichtparametern — mit einem aus dem Schema erzeugten Wert; der Body beginnt
mit dem Beispiel des Media Types oder einem aus seinem Schema erzeugten
Beispiel.

Eingaben werden nach dem Schema des Parameters gelesen: Zahlen und
Wahrheitswerte werden umgewandelt, Arrays und Objekte als JSON gelesen (ein
Array lässt sich auch als `a, b, c` eingeben). Der Body wird so gesendet, wie
er eingegeben wurde; bei einem JSON-Media-Type zeigt ein ungültiger Body eine
Warnung, wird aber trotzdem gesendet. Für Bodys vom Typ
`application/x-www-form-urlencoded` und `multipart/form-data` geben Sie die
Felder als JSON-Objekt ein. Das Textfeld hat keine Dateiauswahl: Ein
Dateifeld eines Multipart-Bodys wird ohne Inhalt gesendet.

Die Anfragebeispiele neben dem Panel zeigen dieselbe Anfrage, die „Send“
abschickt, mit den eingegebenen Werten und Anmeldedaten. Die in einer
Operation gewählte Sprache gilt für alle.

Die Antwort zeigt Status, Dauer, Header und Body; ein JSON-Body wird
formatiert. Erreicht die Anfrage den Server nicht — ein Netzwerkfehler oder
der Browser blockiert eine Cross-Origin-Anfrage —, meldet das Panel dies mit
der Meldung des Browsers.

### Anmeldedaten und Cookies

Standardmäßig wird die Anfrage mit dem `fetch` der Seite und
`credentials: 'same-origin'` gesendet: Der Browser hängt die Cookies der Seite
nur an Anfragen an den eigenen Origin der Seite an, nie an eine fremde API.

Für den Standardtransport gelten zwei Browserregeln. Eine Cross-Origin-API
muss den Origin der Seite zulassen (CORS), sonst blockiert der Browser die
Antwort. Und der Browser verwirft Header, die Skripte nicht setzen dürfen —
`Cookie`, `Host`, `Origin` und andere —, auch wenn die Spezifikation sie
deklariert.

### Senden über Ihren Server

Übergeben Sie `send`, um Try-it über Ihr eigenes Backend zu leiten. Die
Funktion erhält die vom Panel gebaute Anfrage und gibt die Antwort zurück:

```ts
type SendFn = (request: HttpRequest) => Promise<HttpResponse>

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

In der Seite eine Funktion, die die Anfrage als JSON an Ihr Backend schickt:

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`Proxy answered ${response.status}`)
    return (await response.json()) as HttpResponse
  } catch (error) {
    return {
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      duration: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

```vue
<OpenApiReference :spec="text" :send="send" />
```

Die URL ist absolut, wenn das Dokument Server hat (eine relative Server-URL
wird gegen `baseUrl` aufgelöst); bei einem Dokument ohne `servers` ist sie der
bloße Pfad. Im Backend liest der Endpunkt den `HttpRequest`, prüft, dass seine
URL auf einen von Ihnen erlaubten Host zeigt, führt ihn aus und antwortet mit
einer `HttpResponse`. In Node 20+ übernimmt das `sendRequest` des Kerns das
Senden:

```ts
import { sendRequest, type HttpRequest, type HttpResponse } from '@dskripchenko/openapi'

const ALLOWED_HOSTS = new Set(['api.example.com'])

export async function proxy(request: HttpRequest): Promise<HttpResponse> {
  const host = new URL(request.url).host
  if (!ALLOWED_HOSTS.has(host)) {
    return { status: 0, statusText: '', headers: [], body: '', duration: 0, error: `Host ${host} is not allowed` }
  }
  return sendRequest(request)
}
```

Schützen Sie den Endpunkt so, wie Sie den Rest Ihres Backoffice schützen: Ein
Proxy, der jeden Host im Auftrag von jedem aufruft, ist ein offenes Relay. Ein
Server ist nicht an die Liste der im Browser verbotenen Header gebunden; über
ihn erreichen `Cookie` und andere von der Spezifikation deklarierte Header
also die API. Dateifelder kommen als `{ filename, contentType }` ohne Daten
an, da das Panel keine zu senden hat.

Ein `send`, das eine Ausnahme wirft, wird wie ein Netzwerkfehler behandelt.
`send` wird außerdem von [`OpenApiEditor`](editor.md) an seine Vorschau
weitergegeben.

## Authentifizierung

Deklariert das Dokument `components.securitySchemes`, hat der Kopf der Seite
ein Panel „Authentication“ mit einem Feld für jedes Schema:

- **apiKey** — der Schlüssel; er geht in den Header, Query-Parameter oder
  Cookie, den das Schema nennt;
- **http basic** — Benutzername und Passwort;
- **http bearer** und andere http-Schemas — das Token, gesendet als
  `Authorization: Bearer …` (oder mit dem Namen des Schemas);
- **oauth2** und **openIdConnect** — das Access-Token, gesendet als
  `Authorization: Bearer …`.

`mutualTLS`-Schemas werden nicht angezeigt: Ein Browser kann aus einem Skript
kein Client-Zertifikat vorlegen.

Die Werte gelten für jede Operation der Seite — sowohl für „Send“ als auch
für die Beispiele. Für jede Operation nimmt die Referenz deren `security`
(oder die des Dokuments) und verwendet die erste Anforderung, für deren
Schemas alle ein Wert vorliegt. Eine Operation mit leerer Anforderung
(`security: [{}]` oder `security: []`) wird ohne Anmeldedaten gesendet.

### Ein OAuth2-Token abrufen

Für ein oauth2-Schema mit einem `clientCredentials`- oder `password`-Flow,
der eine `tokenUrl` hat, enthält das Panel zusätzlich die Felder
„Client ID“, „Client secret“ (und für `password` „Username“ und „Password“)
sowie eine Schaltfläche „Get token“. Sie schickt eine Token-Anfrage an die
`tokenUrl` (RFC 6749 §4.3 und §4.4) mit allen Scopes, die der Flow
deklariert; das zurückgegebene Access-Token füllt das Token-Feld des Schemas.
Mit einem Client Secret authentifiziert sich der Client per HTTP Basic; ohne
eines geht `client_id` ins Formular. Hat das Schema beide Flows, wird
`clientCredentials` verwendet.

Die Token-Anfrage läuft über das `fetch` der Seite, nicht über `send`; der
Token-Endpunkt muss also eine Cross-Origin-Anfrage der Seite akzeptieren. Für
die Flows `implicit` und `authorizationCode` besorgen Sie ein Token anderswo
und fügen es in das Token-Feld ein. Dieselbe Anfrage steht außerhalb der
Komponente als [`fetchOAuthToken`](core.md#oauth2-tokens) zur Verfügung.

## Server

Hat das Dokument `servers`, listet das Panel „Server“ sie auf, dazu „…“ für
eine eigene URL. Servervariablen bekommen je ein Feld — eine Auswahl, wenn
die Variable ein `enum` hat —, vorbelegt mit ihrem `default`. Eine Operation
oder ein Pfad mit eigenen `servers` verwendet die eigene Liste, mit derselben
gewählten Position.

Eine relative Server-URL (`/v1`) wird gegen `baseUrl` aufgelöst, standardmäßig
den Origin der Seite. Setzen Sie es, wenn die Referenz von einem anderen
Origin als die API ausgeliefert wird:

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## Anfragebeispiele

Die Auswahl der Beispiele bietet die Sprachen aus `snippetTargets` in der
Reihenfolge des Pakets an; `defaultSnippet` wird zuerst gezeigt. Um nur einige
anzubieten:

```vue
<OpenApiReference
  :spec="text"
  :snippet-targets="['curl', 'javascript-fetch', 'php-laravel', 'python-requests']"
  default-snippet="php-laravel"
/>
```

Die ids und was jedes Ziel zum Ausführen braucht, stehen unter
[Codebeispiele](snippets.md).

## Sprachen

`locale` wählt die Texte der Oberfläche: Englisch (`'en'`) und Russisch
(`'ru'`) liefert das Paket mit. Ohne `locale` sind die Texte englisch.
`labels` überschreibt darüber einzelne Texte:

```vue
<OpenApiReference :spec="text" locale="en" :labels="{ tryIt: 'Run', send: 'Run request' }" />
```

Für eine andere Sprache übergeben Sie ein vollständiges Wörterbuch als
`labels`. Der Typ ist `OpenApiLabels`, und `en` ist das englische als
Ausgangspunkt:

```ts
import { en, type OpenApiLabels } from '@dskripchenko/openapi/vue'

const de: OpenApiLabels = { ...en, search: 'Suche', tryIt: 'Ausprobieren', send: 'Senden' /* … */ }
```

```vue
<OpenApiReference :spec="text" :labels="de" />
```

`en`, `ru` und `LOCALES` (`{ en, ru }`) werden aus
`@dskripchenko/openapi/vue` exportiert.

### Die eigenen Texte des Kits

Die Kit-Komponenten in der Referenz — Auswahlfelder, Codeblöcke,
Eingabefelder — haben eigene Texte: die Kopier-Schaltfläche, die Suche in
einer Auswahl und Ähnliches. Mit `locale="en"` oder `locale="ru"` umschließt
sich die Referenz mit dem `UidLocaleProvider` des Kits und der passenden
Kit-Locale. Ohne `locale` (oder mit einem anderen Wert) fügt sie keinen
Provider hinzu, und die Kit-Komponenten folgen dem `UidLocaleProvider` des
Hosts; ohne einen solchen ist der Standard des Kits Russisch. Eine Seite in
einer anderen Sprache setzt daher einen eigenen Provider um die Referenz:

```vue
<UidLocaleProvider :locale="kitLocale"> <!-- a kit locale object -->
  <OpenApiReference :spec="text" :labels="de" />
</UidLocaleProvider>
```

## Externe Referenzen

Ein `$ref` auf eine andere Datei (`common.yaml#/components/schemas/Error`)
wird nur über die Prop `external` aufgelöst. Ohne sie bleibt eine solche
Referenz unaufgelöst und wird mit ihrem Namen angezeigt. Die Funktion erhält
den URL-Teil der Referenz genau so, wie er geschrieben ist (`common.yaml`),
synchron, und gibt das geparste Dokument zurück oder `undefined`, wenn sie
es nicht hat. Jede URL wird pro Ladevorgang einmal abgefragt.

Da der Aufruf synchron ist, laden Sie die Dateien vorher:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { parseSpec } from '@dskripchenko/openapi'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const text = ref<string | null>(null)
const files = new Map<string, unknown>()
const external = (url: string) => files.get(url)

onMounted(async () => {
  for (const name of ['common.yaml']) {
    files.set(name, parseSpec(await (await fetch(`/specs/${name}`)).text()).value)
  }
  text.value = await (await fetch('/specs/openapi.yaml')).text()
})
</script>

<template>
  <OpenApiReference v-if="text" :spec="text" :external="external" />
</template>
```

Referenzen innerhalb eines externen Dokuments, die in dasselbe Dokument
zeigen (`#/Pet`), werden darin aufgelöst. Das Paket selbst lädt nie etwas.

## Layout unter einer festen Kopfzeile

Die Navigation und die Spalte mit den Beispielen sind sticky. Unter einer
festen Kopfzeile der Website setzen Sie `--oa-sticky-top` auf deren Höhe,
damit sie darunter stehen bleiben; Anker scrollen auf denselben Abstand:

```css
:root {
  --oa-sticky-top: 64px;
}
```

Die übrigen Variablen — Breite der Navigation, Abstände, Farben der
Methoden — stehen unter [Theming](theming.md).

## OaSchema und der Kontext

`OaSchema` (der Schemabaum) und `useReference`/`referenceKey` (der gemeinsame
Zustand: Spezifikation, Texte, gewählter Server, Anmeldedaten, Transport)
werden exportiert, um eigene Teile innerhalb der Referenz zu bauen. Sie lesen
den Kontext, den `OpenApiReference` bereitstellt, und lassen sich außerhalb
davon nicht verwenden.
