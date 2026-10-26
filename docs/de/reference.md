# OpenApiReference

Eine API-Referenzseite für eine Spezifikation in Swagger 2.0, OpenAPI 3.0
oder OpenAPI 3.1 — oder für mehrere davon, mit einem Umschalter (siehe
[mehrere Spezifikationen](#mehrere-spezifikationen)).

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

**Die Kopfzeile** bleibt oben stehen: Titel, Version und Summary der API, ein
Umschalter für die Spezifikation, wenn es
[mehrere Spezifikationen](#mehrere-spezifikationen) gibt, die
[Suche](#suche), Download-Schaltflächen (YAML, JSON und TS), eine
Einstellungsschaltfläche und der Slot `#actions`. Die Einstellungsschaltfläche
zeigt den Host des Servers, an den die Anfragen gehen, und — wenn das Dokument
Security-Schemas hat — ein Schlüsselsymbol, das grün wird, sobald Anmeldedaten
eingegeben sind. Sie öffnet **die Einstellungsleiste** rechts: den
[Server](#server) und seine Variablen, das Panel für die
[Authentifizierung](#authentifizierung), die Downloads und „Print / PDF“.

**Der Hauptbereich** hat links die Navigation — die Operationen nach Tags
gruppiert, die Webhooks und die Schemas, wobei der sichtbare Eintrag beim
Scrollen hervorgehoben wird — und rechts das Dokument: Titel, Version,
Summary, Beschreibung und Links, dann jede Operation als Karte und am Ende
die Schemas aus `components.schemas`. **Die Fußzeile** zeigt Titel, Version
und OpenAPI-Version sowie den Slot `#footer`.

**Eine Operationskarte** hat Methode, Pfad und Summary, eine Schaltfläche, die
den Link darauf kopiert, und „PDF“. Links: Beschreibung, Parameter,
Request-Body, Antworten und Callbacks; Antworten beginnen zugeklappt, und eine
Antwort, die nur eine Beschreibung hat, ist eine einfache Zeile. Rechts drei
Tabs: „Try it“, „Request samples“ und [Types](types.md). Codeblöcke brechen
lange Zeilen um und klappen lange Blöcke hinter „Show all“ ein. Eine
Spezifikation mit bis zu 40 Operationen zeigt alle Karten sofort. In einer
größeren baut eine Karte ihre Formulare und Beispiele auf, sobald sie in die
Nähe des sichtbaren Bereichs kommt, und wird eingeblendet (nicht bei
reduzierter Bewegung); Karten weit davon entfernt werden nicht gerendert.

Links aus der Spezifikation — die URLs für Kontakt, Lizenz und
Nutzungsbedingungen in `info`, die `externalDocs` einer Operation, der
`externalValue` eines Beispiels — werden nur gezeigt, wenn sie `http(s)`-,
`mailto`- oder relative Adressen sind; jeder andere Link wird weggelassen.

Das Layout folgt der eigenen Breite der Referenz, nicht der des Fensters
(Container Queries): Sie passt in eine Spalte oder einen Kasten der Hostseite
ebenso wie auf eine ganze Seite. Unter 1180 px rücken die seitlichen Tabs
unter die Beschreibung der Operation, und die Zusammenfassung verschwindet aus
der Kopfzeile. Unter 860 px wird die Navigation zu einer Leiste, die innerhalb
der Referenz von links hereingleitet und über eine Menüschaltfläche in der
Kopfzeile geöffnet wird, und die Download-Schaltflächen der Kopfzeile wandern
in die Einstellungsleiste. Unter 600 px verlassen Version und Serveradresse
die Kopfzeile. Bei mehreren Spezifikationen belegen Umschalter und Suche unter
560 px eine zweite Zeile der Kopfzeile, die dann 96 px hoch ist. Wird der
Platz knapp, gibt zuerst die Zusammenfassung nach, dann Suche und Umschalter,
zuletzt der Titel.

Die Referenz nimmt ihre Breite vom Elternelement, nie vom Inhalt: In einer
Flex-Zeile geben Sie ihr eine (`flex: 1`, `width`). Regeln der Hostseite für
nackte Elemente (`main { margin: 0 auto }`, `section { margin-top }`)
erreichen ihr Layout nicht.

Für eine ganze Seite mit Umschaltern für Theme und Sprache oder eine Seite
ohne Build-Schritt siehe [Eigenständige Seite und OpenApiPage](standalone.md).
Um eine einzelne Operation in einer anderen Dokumentation zu zeigen, siehe
[Einbetten](embed.md).

## Props

| Prop | Typ | Standard | |
|---|---|---|---|
| `spec` | `SpecInput` | — | Die Spezifikation: YAML- oder JSON-Text, ein geparstes Objekt oder eine Funktion, die ein Promise auf eines davon liefert. |
| `specs` | `SpecSource[]` | — | Mehrere Spezifikationen auf einer Seite, anstelle von `spec`. Siehe [mehrere Spezifikationen](#mehrere-spezifikationen). |
| `active` | `string` | die erste Spezifikation | Die id der geöffneten Spezifikation; mit `v-model:active` verwenden. |
| `send` | `SendFn` | `fetch` der Seite | Sendet Try-it-Anfragen. Siehe [den Proxy](#senden-über-ihren-server). |
| `tryIt` | `boolean` | `true` | `false` blendet die Try-it-Panels aus; die Beispiele bleiben. |
| `locale` | `string` | — | `'en'` oder `'ru'`. Siehe [Sprachen](#sprachen). |
| `labels` | `Partial<OpenApiLabels>` | `{}` | Überschreibt einzelne Texte der Oberfläche. |
| `snippetTargets` | `SnippetTarget[]` | alle 13 | Die für Anfragebeispiele angebotenen Sprachen. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | Die zuerst gezeigte Sprache. |
| `baseUrl` | `string` | der Origin der Seite | Die Basis, gegen die eine relative Server-URL aufgelöst wird. |
| `external` | `(url: string) => unknown \| undefined` | — | Lädt externe `$ref`-Dokumente. Ohne diese Funktion wird keines geladen. |
| `hashNavigation` | `boolean` | `true` | `location.hash` schreiben, wenn ein Eintrag aus der Navigation geöffnet wird. |
| `title` | `string` | der Titel der geöffneten Spezifikation | Der Titel der Kopfzeile. |
| `persistCredentials` | `boolean \| 'session' \| 'local'` | `false` | API-Schlüssel und Tokens zwischen Besuchen behalten; siehe [Anmeldedaten behalten](#anmeldedaten-behalten). |
| `oauthRedirectUrl` | `string` | die URL der Seite | Die OAuth-Redirect-URI; siehe [OAuth2 und OpenID Connect](#oauth2-und-openid-connect). |

Bei einer Funktion wird die Spezifikation geladen, wenn sie zum ersten Mal
gezeigt wird; währenddessen erscheint ein Spinner. Die Spezifikation wird neu
geladen, wenn sich `spec` oder `external` ändert. Beide werden nach Identität verglichen: Übergeben Sie ein neues Objekt, statt
das alte an Ort und Stelle zu ändern, und halten Sie die Funktion `external`
stabil (einmal in `<script setup>` definieren, nicht inline im Template).

## Events

| Event | Payload | |
|---|---|---|
| `loaded` | `LoadedSpec`, `id: string` | Nach jedem erfolgreichen Laden: das normalisierte Dokument, seine Operationen und Gruppen (siehe [`loadSpec`](core.md#eine-spezifikation-laden)) und die id der Spezifikation. |
| `error` | `Error`, `id: string` | Die Spezifikation ließ sich nicht lesen: ein `YamlError`, `JsonError` oder `OpenApiError` oder der eigene Fehler der Ladefunktion. Die Seite zeigt die Meldung anstelle der Referenz. |
| `update:active` | `id: string` | Eine andere Spezifikation wurde geöffnet — über den Umschalter, einen Deep Link oder `open`. |

Bei einer einzelnen `spec` ist die id `'spec'`.

## Exponiert

Über eine Template-Ref:

| | |
|---|---|
| `go(anchor: string, options?: { tryIt?: boolean }): Promise<void>` | Scrollt in der geöffneten Spezifikation zu `'operation/{id}'`, `'schema/{name}'` oder `'tag/{name}'` — mit `tryIt: true` zum Try-it-Panel der Operation —, markiert den Eintrag in der Navigation und schreibt mit `hashNavigation` den Hash. |
| `open(id: string): Promise<void>` | Öffnet eine andere Spezifikation aus `specs` und lädt sie bei Bedarf. |
| `spec` | Die `LoadedSpec` der geöffneten Spezifikation oder `null`, solange sie lädt oder wenn sie sich nicht lesen ließ. |
| `active` | Die id der geöffneten Spezifikation. |

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

## Slots

| Slot | |
|---|---|
| `#actions` | Bedienelemente am rechten Ende der Kopfzeile, nach der Einstellungsschaltfläche. |
| `#footer` | Inhalt am Ende der Fußzeile. |

## Deep Links

Jede Operation hat den Anker `#operation/{id}`, jedes Schema aus
`components.schemas` den Anker `#schema/{name}` und jeder Tag `#tag/{name}`.
Die id ist die `operationId`; eine Operation ohne sie (oder deren
`operationId` schon vergeben ist) bekommt einen Slug aus Methode und Pfad,
etwa `get-pets-id` für `GET /pets/{id}`. Webhook-Operationen bekommen
`webhook-{method}-{name}`. Eine Operation mit mehreren Tags wird im Abschnitt
jedes Tags gezeigt; nur ihre erste Kopie trägt den Anker, ein Deep Link landet
also dort.

Öffnet sich die Seite mit einem dieser Anker in `location.hash` oder wechselt
der Hash später zu einem davon, scrollt die Referenz dorthin. Mit
`hashNavigation` (der Standard) ersetzt ein Klick in der Navigation den Hash,
sodass sich die Adresse kopieren und weitergeben lässt; jeder Kopf einer
Operation hat außerdem eine Schaltfläche, die den Link darauf kopiert.
Schalten Sie es ab, wenn die Referenz in einer Seite sitzt, die den Hash für
ihr eigenes Routing verwendet:

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

Für Scalar gebaute Links (`#{doc}/tag/{tag}/{METHOD}{path}`, `#model/{name}`)
öffnen dieselben Abschnitte, und ein Link kann ein ausgefülltes Try-it-Formular
mitbringen. Beides ist unter
[Deep Links und vorausgefüllte Links](links.md) beschrieben.

## Suche

Das Suchfeld in der Kopfzeile durchsucht die geöffnete Spezifikation:
Operationen (Summary, Pfad, Operation-ID, Methode, Tags, Namen und
Beschreibungen der Parameter, die Beschreibung, die Eigenschaftsnamen ihrer
Bodys und Antworten), Tags (Name und Beschreibung), Schemas (Name, Titel,
Beschreibung, Eigenschaftsnamen) und die Überschriften der Beschreibung des
Dokuments. Jedes Wort der Anfrage muss passen; die Ergebnisse werden danach
gereiht, wo ein Wort passte — ein Titel oder Pfad zählt mehr als eine
Beschreibung — und wie: das ganze Feld, der Anfang eines Worts oder irgendwo.

Beim Tippen schrumpft die Navigation auf die passenden Einträge, und unter
dem Feld öffnet sich eine Liste der besten Ergebnisse mit markierten
Treffern. **↑** und **↓** bewegen sich durch die Liste, **Enter** öffnet das
gewählte Ergebnis, **Esc** schließt die Liste und leert beim zweiten Drücken
das Feld. **/** (außerhalb eines Textfelds) und **Ctrl+K** / **⌘K** setzen
den Cursor in die Suche. Bei mehreren Spezifikationen durchsucht sie die
geöffnete.

## Beispiele

Hat ein Media Type mehrere benannte Beispiele — im Request-Body und in jeder
Antwort —, erscheinen sie als Chips über dem Beispiel; das gewählte zeigt
seine Beschreibung, und ein per `externalValue` angegebenes Beispiel ist ein
Link darauf (wird nie abgerufen). Ohne Beispiele zeigt der Request-Body ein
aus seinem Schema erzeugtes Beispiel.

Im Try-it bekommt ein Body mit mehreren Beispielen eine Auswahl „Example“
(„Generated sample“ zuerst); die Wahl eines Beispiels ersetzt den Text des
Bodys. Die benannten Beispiele eines Parameters erscheinen als Chips daneben,
und ein Klick auf eines mit einfachem Wert setzt es in das Try-it-Feld.

## Mehrere Spezifikationen

`specs` bringt mehrere Spezifikationen — APIs oder Versionen einer API — auf
eine Seite:

```ts
interface SpecSource {
  id: string          // used in deep links and v-model:active
  name?: string       // shown in the switcher
  spec: SpecInput     // string | object | (() => Promise<string | object>)
}
```

Beide Typen werden aus `@dskripchenko/openapi/vue` exportiert. Bei mehr als
einer Spezifikation wechselt eine durchsuchbare Auswahl in der Kopfzeile
zwischen ihnen. Sie zeigt für jede Spezifikation ihren `name`, sonst den Titel
einer schon geladenen Spezifikation, sonst ihre id; ihr zugänglicher Name ist
das Label `specs`.

Eine als Funktion übergebene Spezifikation wird geladen, wenn sie zum ersten
Mal geöffnet wird — währenddessen erscheint ein Spinner, und schlägt das Laden
fehl, bleibt der Umschalter über der Fehlermeldung, damit sich eine andere
Spezifikation wählen lässt. Eine geladene Spezifikation bleibt unter ihrer
id erhalten, sodass der Wechsel zurück sofort geht; ist `external` gesetzt,
werden die behaltenen Spezifikationen verworfen, sobald sich die Quellen
ändern.

Zum Beispiel die Spezifikationen, die ein Backend pro API-Version ausliefert,
jede erst geladen, wenn der Leser sie öffnet:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference, type SpecSource } from '@dskripchenko/openapi/vue'

const specs: SpecSource[] = [
  { id: 'v1', name: 'API v1', spec: () => fetch('/api/doc/v1').then((r) => r.json()) },
  { id: 'admin', name: 'Admin API', spec: () => fetch('/api/doc/admin').then((r) => r.json()) },
]
const active = ref('v1')
</script>

<template>
  <OpenApiReference v-model:active="active" :specs="specs" locale="en" />
</template>
```

Eine behaltene Spezifikation wird wiederverwendet, solange ihre Quelle
dieselbe bleibt. Bei einer Ladefunktion heißt das „weiterhin eine Funktion“:
Eine neue Funktion unter derselben id erhält das schon geladene Ergebnis, ein
inline im Template geschriebenes `specs`-Array lädt also nicht bei jedem
Rendern neu. Text und Objekte werden nach Identität verglichen: Ein neuer
String oder ein neues Objekt unter derselben id ist eine neue Quelle und wird
erneut geladen.

Was bei einem Wechsel bleibt und was zurückgesetzt wird:

- die im Authentifizierungs-Panel eingegebenen Anmeldedaten werden pro
  Spezifikation behalten und kehren zurück, wenn der Leser zu ihr zurückkehrt;
- die Serverauswahl springt auf den ersten Server der geöffneten
  Spezifikation zurück;
- das Suchfeld wird geleert;
- die für Beispiele gewählte Sprache bleibt.

Bei mehreren Spezifikationen tragen die Anker die id der Spezifikation:
`#{id}/operation/{opId}`, `#{id}/schema/{name}` und `#{id}/tag/{name}`, und
`#{id}` allein öffnet die Spezifikation. Eine solche Adresse — beim Laden oder
durch einen Hash-Wechsel — öffnet zuerst diese Spezifikation, dann den
Abschnitt. `go` nimmt den Anker ohne die id und wirkt in der geöffneten
Spezifikation; `open(id)` wechselt die Spezifikation. Ein `specs`-Array mit
nur einem Eintrag verhält sich wie `spec`: kein Umschalter, keine id in den
Ankern.

## Try it

Der Tab „Try it“ jeder Operation (außer Webhooks) ist ein Formular für die
Anfrage, dazu „Send“ und die Antwort.

**Parameter** sind nach Ort gruppiert — Path, Query, Headers, Cookies — und
jeder bekommt die Eingabe, die sein Schema verlangt:

- ein `enum` (oder `const`) — eine Auswahl;
- ein Wahrheitswert — ein Schalter, wenn er Pflicht ist, sonst die Wahl
  zwischen true / false / nicht gesetzt;
- eine Ganzzahl oder Zahl — eine Zahleneingabe mit Minimum, Maximum und
  Schrittweite (`multipleOf`) aus dem Schema;
- ein Array von Skalaren — Tags, oder eine Mehrfachauswahl, wenn die Elemente
  ein `enum` haben;
- ein String mit `date` / `date-time` — eine Datums- bzw. Datums-und-Zeit-Auswahl;
- ein Objekt oder ein Array von Objekten — ein kleines JSON-Feld;
- alles andere — eine Texteingabe.

Die Beschreibung des Parameters steht als Hinweis unter der Eingabe. Die
Felder beginnen mit dem `example` oder `default` des Parameters oder — bei
Pflichtparametern — mit einem aus dem Schema erzeugten Wert. „+ Add query
parameter“, „+ Add header“ und „+ Add cookie“ fügen Zeilen hinzu, die die
Spezifikation nicht deklariert; ein eigener Header mit dem Namen eines
erzeugten — `Content-Type`, `Accept`, `Authorization`, … (Groß- und
Kleinschreibung egal) — ersetzt diesen.

**Der Body** hängt vom Media Type ab:

- **JSON** mit einem Schema — ein daraus erzeugtes Formular mit einem
  Umschalter „Form“ / „JSON“: verschachtelte Objekte klappen ein, Arrays
  fügen Elemente hinzu und entfernen sie, Maps (`additionalProperties`) sind
  Name/Wert-Zeilen, ein nullable Wert hat einen Null-Schalter, und
  `oneOf` / `anyOf` bieten eine Variantenauswahl. Formular und Text bleiben
  synchron; „Form“ ist nicht verfügbar, solange der Text nicht zum Schema
  passt.
- **XML** — Text. Sofern die Spezifikation das Beispiel nicht als XML-Text
  angibt, wird der Body aus dem Schema geschrieben, mit dessen `xml`-Namen und
  -Attributen.
- **`multipart/form-data`** und **`application/x-www-form-urlencoded`** mit
  einem Objektschema — ein Feld pro Eigenschaft (außer `readOnly`). In
  Multipart bekommt eine Eigenschaft mit `format: binary` (oder mit einem
  `contentMediaType`) eine Dateiauswahl, und ein Array davon nimmt mehrere
  Dateien; die akzeptierten Typen kommen aus dem `encoding` oder dem Schema.
- **Ein binärer Body** — `application/octet-stream`, Bilder, Audio, Video,
  PDF, ein Schema mit `format: binary` — eine einzelne Dateiauswahl; die Datei
  ist der ganze Body.
- **Anderer Text** — ein Textfeld, gesendet wie eingegeben.

Ein Body mit mehreren Beispielen bekommt eine Auswahl „Example“ (siehe
[Beispiele](#beispiele)).

**„What will be sent“** fasst die Anfrage in einer Zeile zusammen — Methode,
URL und Anzahl der Header — und klappt auf zur vollständigen URL mit einer
Kopierschaltfläche und den endgültigen Headern, Anmeldedaten maskiert
(`Bearer ••••abcd`); „+ Add header“ gibt es dort ebenfalls.

Solange die Anfrage läuft, zeigt „Send“ „Sending…“, und eine Schaltfläche
„Cancel“ erscheint; Abbrechen bricht die Anfrage ab (siehe das `signal`
[unten](#senden-über-ihren-server)), verwirft eine späte Antwort und meldet
„Cancelled“.

**Die Antwort** zeigt Status, Dauer, Größe, Header und Body. Ein JSON-Body
wird formatiert, mit einem Umschalter „Pretty“ / „Raw“. Ein nicht-textueller
Body (`HttpResponse.blob`) ist bei `image/*` eine Bildvorschau und sonst ein
Link „Download“, benannt nach `Content-Disposition` oder
`response.{subtype}`. Erreicht die Anfrage den Server nicht — ein
Netzwerkfehler oder der Browser blockiert eine Cross-Origin-Anfrage —,
meldet das Panel dies mit der Meldung des Browsers.

Der Tab „Request samples“ zeigt dieselbe Anfrage, die „Send“ abschickt, mit
den eingegebenen Werten, den gewählten Dateien (nach Namen) und den
Anmeldedaten. Die in einer Operation gewählte Sprache gilt für alle.

„Copy link“ unter dem Formular erzeugt einen Link, der diese Operation mit
dem Formular im aktuellen Zustand öffnet, eigene Zeilen eingeschlossen; siehe
[vorausgefüllte Links](links.md#vorausgefüllte-links).

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
type SendFn = (request: HttpRequest, options?: SendFnOptions) => Promise<HttpResponse>

interface SendFnOptions {
  signal?: AbortSignal                // aborted when the user presses "Cancel"
}

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // absolute, with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
    file?: { filename: string; contentType?: string; data?: Blob } // a binary body
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string                        // the body of a textual response
  blob?: Blob                         // the body of any other response
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

Folgt Ihr Endpunkt dem Vertrag des
[Proxys des eigenständigen Bundles](standalone.md#der-proxy), baut
`proxySend(url)` diese Funktion: die Anfrage als JSON, Dateibytes in
`base64`, eine binäre Antwort zurück als `Blob`, den Header aus
`<meta name="csrf-token">` und „Cancel“:

```ts
import { proxySend } from '@dskripchenko/openapi' // oder '@dskripchenko/openapi/vue'

const send = proxySend('/internal/api-proxy')
```

Für einen eigenen Vertrag schreiben Sie die Funktion selbst — in der Seite eine,
die die Anfrage als JSON an Ihr Backend schickt:

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request, options) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
      signal: options?.signal,
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

Reichen Sie `options.signal` wie oben an Ihr eigenes `fetch` weiter, damit
„Cancel“ auch die Anfrage an Ihr Backend stoppt. Dateien (`data` von
Formularfeldern und von `body.file`) sind `Blob`s und überstehen
`JSON.stringify` nicht, und eine JSON-Antwort trägt kein `blob`: Um Dateien
und binäre Antworten zu transportieren, kodieren Sie sie — der Proxy des
eigenständigen Bundles schickt Dateibytes als `base64` und liest eine binäre
Antwort aus `bodyBase64`, die er wieder in einen `Blob` verwandelt.

Die URL ist immer absolut: Eine relative Server-URL, und `/` bei einem
Dokument ohne `servers`, wird gegen `baseUrl` aufgelöst. Im Backend liest der
Endpunkt den `HttpRequest`, prüft, dass seine URL auf einen von Ihnen
erlaubten Host zeigt, führt ihn aus und antwortet mit einer `HttpResponse`.
In Node 20+ übernimmt das `sendRequest` des Kerns das Senden:

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
also die API.

Ein `send`, das eine Ausnahme wirft, wird wie ein Netzwerkfehler behandelt.
Auch die Token- und Discovery-Anfragen des
[Anmelde-Panels](#oauth2-und-openid-connect) laufen über `send`: Ein Proxy
muss also auch diese Hosts durchlassen. `send` wird außerdem von
[`OpenApiEditor`](editor.md) an seine Vorschau weitergegeben. `proxySend` ist
der Transport, den die Option `proxy` des eigenständigen Bundles verwendet;
sein Vertrag steht unter [dem Proxy](standalone.md#der-proxy).

## Authentifizierung

Deklariert das Dokument `components.securitySchemes`, hat die
Einstellungsleiste einen Abschnitt „Authentication“ mit einem Feld für jedes
Schema:

- **apiKey** — der Schlüssel; er geht in den Header, Query-Parameter oder
  Cookie, den das Schema nennt;
- **http basic** — Benutzername und Passwort;
- **http bearer** und andere http-Schemas — das Token, gesendet als
  `Authorization: Bearer …` (oder mit dem Namen des Schemas);
- **oauth2** und **openIdConnect** — das Access-Token, gesendet als
  `Authorization: Bearer …`, eingegeben oder im Panel bezogen.

`mutualTLS`-Schemas werden nicht angezeigt: Ein Browser kann aus einem Skript
kein Client-Zertifikat vorlegen.

Die Werte gelten für jede Operation der Seite — sowohl für „Send“ als auch
für die Beispiele. Für jede Operation nimmt die Referenz deren `security`
(oder die des Dokuments) und verwendet die erste Anforderung, für deren
Schemas alle ein Wert vorliegt. Eine Operation mit leerer Anforderung
(`security: [{}]` oder `security: []`) wird ohne Anmeldedaten gesendet.

### OAuth2 und OpenID Connect

Für ein oauth2-Schema bietet das Panel die Flows an, die das Schema
deklariert — mit einem Umschalter, wenn es mehrere sind: „Authorization code“
(braucht `authorizationUrl` und `tokenUrl`), „Implicit“ (`authorizationUrl`),
„Client credentials“ und „Password“ (`tokenUrl`). Ein openIdConnect-Schema
liest sein Discovery-Dokument (`openIdConnectUrl`), wenn die
Einstellungsleiste geöffnet wird, und bietet die dort unterstützten Flows an, mit `scopes_supported` als
Scopes.

Jeder Flow listet seine Scopes als Checkboxen, anfangs alle angehakt; das
Token wird für die angehakten angefordert.

- **Client credentials** und **Password**: „Client ID“, „Client secret“ (und
  „Username“ / „Password“) und „Get token“. Die Token-Anfrage geht an die
  `tokenUrl` (RFC 6749 §4.4, §4.3); mit einem Client Secret authentifiziert
  sich der Client per HTTP Basic, ohne eines geht `client_id` ins Formular.
- **Authorization code** (mit PKCE, S256) und **Implicit**: „Client ID“ (und
  für den Code-Flow optional „Client secret“), die „Redirect URI“ und
  „Authorize“. Ein Anmeldefenster öffnet sich beim Identity Provider; kommt es
  zurück, prüft die Referenz den `state` und tauscht beim Code-Flow den Code
  an der `tokenUrl` ein, mit `client_secret` im Formular, wenn eines
  eingegeben wurde (ein öffentlicher Client verlässt sich allein auf PKCE).

Das Token füllt das Feld des Schemas. Sagt der Server, wie lange es gilt
(`expires_in`), zeigt das Panel „expires in N min“, danach „expired“; „Log out“
leert es.

Token-, Code-Tausch- und Discovery-Anfragen laufen wie Try-it über `send`.
Mit dem Standardtransport müssen diese Endpunkte eine Cross-Origin-Anfrage
der Seite akzeptieren; mit einem [Proxy](#senden-über-ihren-server) gehen sie
über Ihren Server und brauchen kein CORS. Das Anmeldefenster selbst ist ein
normales Browserfenster beim Identity Provider.

**Die Redirect-URI** ist `oauthRedirectUrl`, standardmäßig die eigene Adresse
der Seite ohne Query und Fragment; sie lässt sich im Panel ändern. Der
Identity Provider muss sie zulassen. Das Ergebnis der Anmeldung erreicht die
Referenz auf einem von zwei Wegen, je nachdem, welcher zuerst eintritt:

- die Referenz beobachtet das Fenster und liest die Antwort, sobald es wieder
  auf der Redirect-URI landet (gleicher Origin wie die Seite);
- die Seite unter der Redirect-URI schickt die Antwort an das Fenster, das
  sie geöffnet hat, und schließt sich. Eine `OpenApiReference` tut das beim
  Mounten, sodass die Dokumentationsseite selbst als Redirect-URI funktioniert.
  Eine eigene Redirect-Seite ruft `relayOAuthCallback()` aus
  `@dskripchenko/openapi/vue` auf; sie schickt eine Nachricht vom Typ
  `OAUTH_MESSAGE` nur an einen Opener mit gleichem Origin.

Der Browser blockiert Fenster, die nicht durch einen Klick geöffnet wurden;
das Panel meldet ein blockiertes oder geschlossenes Fenster und einen `state`,
der nicht passt. Dieselben Anfragen stehen außerhalb der Komponente zur
Verfügung: [`fetchOAuthToken`](core.md#oauth2-tokens), `buildAuthorizeUrl`,
`exchangeAuthorizationCode` und die übrigen.

### Anmeldedaten behalten

Standardmäßig leben Anmeldedaten für die Lebensdauer der Seite im Speicher.
Mit `persistCredentials` bleiben sie zwischen Besuchen erhalten:

| Wert | Gespeichert in |
|---|---|
| `false` | nirgends (Standard) |
| `true` oder `'session'` | `sessionStorage` — bis der Tab geschlossen wird |
| `'local'` | `localStorage` — bis sie entfernt werden |

Sie werden pro Spezifikation unter dem Schlüssel
`dsk-openapi:credentials:{specId}:{info.title}` gespeichert (`specId` ist
`spec` bei einer einzelnen Spezifikation). Gespeichert werden: API-Schlüssel,
Bearer-Tokens, OAuth- und OpenID-Connect-Access-Tokens mit ihrem Ablauf (ein
abgelaufenes wird nicht wiederhergestellt) und Benutzernamen für Basic Auth.
Nie gespeichert werden: Basic-Auth-Passwörter, Client-IDs und -Secrets und
Passwörter des Password-Flows. Bei eingeschalteter Speicherung zeigt das
Panel „Saved in this browser“ und eine Schaltfläche „Forget“, die die
Anmeldedaten der geöffneten Spezifikation leert, im Speicher und im Storage.

## Server

Die Einstellungsleiste listet die `servers` des Dokuments und „Custom URL“
für eine eigene auf und zeigt die URL, an die die Anfragen gehen.
Servervariablen bekommen je ein Feld — eine Auswahl, wenn die Variable ein
`enum` hat —, vorbelegt mit ihrem `default`. Eine Operation oder ein Pfad mit
eigenen `servers` verwendet die eigene Liste, mit derselben gewählten
Position. Die Einstellungsschaltfläche der Kopfzeile zeigt den Host des
gewählten Servers.

Eine relative Server-URL (`/v1`) wird gegen `baseUrl` aufgelöst, standardmäßig
den Origin der Seite; ein Dokument ohne `servers` wird unter `/` von `baseUrl`
aufgerufen. Setzen Sie es, wenn die Referenz von einem anderen Origin als die
API ausgeliefert wird:

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## Download und Druck

Die Kopfzeile und die Einstellungsleiste laden die geöffnete Spezifikation
herunter:

- **YAML** und **JSON** — das Dokument so, wie es übergeben wurde, nicht die
  normalisierte 3.1-Kopie, unter dem Namen `{title}-{version}.yaml` / `.json`;
- **TS** — die [TypeScript-Typen](types.md) des ganzen Dokuments, unter dem
  Namen `{title}-{version}.d.ts`.

Gedruckt wird über den eigenen Druckdialog des Browsers, in dem „Als PDF
speichern“ einer der Drucker ist:

- **„PDF“** auf einer Operationskarte druckt diese Operation;
- **„Print / PDF“** in der Einstellungsleiste druckt die ganze
  Spezifikation: die Einleitung, jede Operation auf einer eigenen Seite, dann
  die Schemas.

Die Druckansicht ist für Papier gesetzt — A4, helle Farben unabhängig vom
Theme der Seite, Schemas voll ausgeklappt, die Standardbeispiele, ein
Anfragebeispiel in der gewählten Sprache und in cURL, die Adresse der
Operation — und hat keine interaktiven Teile. Anmeldedaten werden nie
gedruckt: Der Security-Abschnitt nennt die Schemas, und das Beispiel wird
ohne sie gebaut. Sie wird in einen versteckten Frame mit eigenem Stylesheet
gerendert, sodass die Hostseite nicht umgestaltet wird, und ihr Titel —
`{API} — {operation}` — ist das, was Browser als Dateinamen der PDF anbieten.
Den Dialog selbst kann man nicht überspringen: Ein Browser lässt eine Seite
keine PDF ohne ihn speichern.

`printOperation(entry, ctx, { url? })` und `printDocument(ctx, { base? })`
aus `@dskripchenko/openapi/vue` tun dasselbe aus Code; sie nehmen den
Kontext der Referenz entgegen (siehe [den Kontext](#der-kontext)). `url` ist
die mit der Operation gedruckte Adresse, `base` die Seite, an die die Anker
der Operationen angehängt werden.

## Anfragebeispiele

Die Auswahl der Beispiele bietet die Sprachen aus `snippetTargets` in der
angegebenen Reihenfolge an; `defaultSnippet` wird zuerst gezeigt, und ist es
nicht in der Liste, das erste der Liste. Um nur einige anzubieten:

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

### Alle Texte

Die Schlüssel von `OpenApiLabels` mit ihrem englischen Text. In
`expiresIn`, `headerCount` und `itemCount` steht `{n}` für die Zahl.
[`OpenApiPage`](standalone.md#openapipage) verwendet `theme`, `themeLight`,
`themeDark`, `themeSystem` und `language` für seine Umschalter.

| Schlüssel | Englisch |
|---|---|
| `search` | Search |
| `operations` | Operations |
| `schemas` | Schemas |
| `webhooks` | Webhooks |
| `servers` | Server |
| `authentication` | Authentication |
| `noAuth` | No authentication |
| `parameters` | Parameters |
| `requestBody` | Request body |
| `responses` | Responses |
| `headers` | Headers |
| `required` | required |
| `deprecated` | deprecated |
| `default` | Default |
| `example` | Example |
| `examples` | Examples |
| `schema` | Schema |
| `enum` | Allowed values |
| `noBody` | No body |
| `samples` | Request samples |
| `tryIt` | Try it |
| `send` | Send |
| `sending` | Sending… |
| `response` | Response |
| `status` | Status |
| `time` | Time |
| `body` | Body |
| `clear` | Clear |
| `invalidJson` | The body is not valid JSON; it is sent as typed. |
| `networkError` | The request did not reach the server |
| `token` | Token |
| `username` | Username |
| `password` | Password |
| `getToken` | Get token |
| `clientId` | Client ID |
| `clientSecret` | Client secret |
| `scopes` | Scopes |
| `loadError` | The specification could not be read |
| `issues` | Problems in the specification |
| `callbacks` | Callbacks |
| `links` | Links |
| `externalDocs` | More |
| `terms` | Terms of service |
| `specs` | API |
| `noResults` | Nothing found |
| `version` | Version |
| `copy` | Copy |
| `show` | Show |
| `hide` | Hide |
| `settings` | Server and authentication |
| `customServer` | Another URL… |
| `addHeader` | Add header |
| `addQueryParam` | Add query parameter |
| `addCookie` | Add cookie |
| `copyLink` | Copy link |
| `linkCopied` | Copied |
| `includeCredentials` | Include credentials |
| `credentialsWarning` | The link will carry your keys and passwords: anyone who gets it can use them. |
| `prefilled` | Form filled from a link — check the values before sending |
| `theme` | Theme |
| `themeLight` | Light |
| `themeDark` | Dark |
| `themeSystem` | System |
| `language` | Language |
| `generatedSample` | Generated sample |
| `externalExample` | Open the example |
| `useExample` | Put into try-it |
| `searchResults` | Search results |
| `tag` | Tag |
| `section` | Section |
| `authorize` | Authorize |
| `redirectUri` | Redirect URI |
| `redirectHint` | The identity provider must allow this redirect URI. |
| `flowAuthorizationCode` | Authorization code |
| `flowImplicit` | Implicit |
| `flowClientCredentials` | Client credentials |
| `flowPassword` | Password |
| `logOut` | Log out |
| `forget` | Forget |
| `savedInBrowser` | Saved in this browser |
| `expiresIn` | expires in {n} min |
| `tokenExpired` | expired |
| `popupBlocked` | The browser blocked the sign-in window. Allow pop-ups for this page and try again. |
| `popupClosed` | The sign-in window was closed before it finished. |
| `stateMismatch` | The sign-in response does not match the request. Try again. |
| `formView` | Form |
| `rawJson` | Raw JSON |
| `file` | File |
| `cancel` | Cancel |
| `cancelled` | Cancelled |
| `pretty` | Pretty |
| `raw` | Raw |
| `download` | Download |
| `downloadSpec` | Download spec |
| `copyOperationLink` | Copy link to this operation |
| `operationLinkCopied` | Link copied |
| `locPath` | Path |
| `locQuery` | Query |
| `locHeader` | Headers |
| `locCookie` | Cookies |
| `add` | Add |
| `addItem` | Add item |
| `remove` | Remove |
| `name` | Name |
| `value` | Value |
| `jsonView` | JSON |
| `notSet` | not set |
| `nullValue` | null |
| `variant` | Variant |
| `willBeSent` | What will be sent |
| `headerCount` | headers: {n} |
| `itemCount` | items: {n} |
| `copyUrl` | Copy URL |
| `urlCopied` | Copied |
| `request` | Request |
| `types` | Types |
| `copyTypeName` | Copy the type name |
| `typeNameCopied` | Copied |
| `downloadTypes` | Download TypeScript types |
| `openInReference` | Open in reference |
| `operationNotFound` | Operation not found |
| `pdf` | PDF |
| `printOperation` | Print or save as PDF |
| `printDocument` | Print / PDF |
| `security` | Security |
| `noSecurity` | No authentication |
| `description` | Description |
| `type` | Type |
| `location` | In |
| `operationId` | Operation ID |
| `tags` | Tags |
| `seeAbove` | see above |
| `requestSample` | Request sample |
| `generatedOn` | Generated |

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

Kopfzeile, Navigation und seitliche Tabs der Referenz sind sticky. Unter
einer festen Kopfzeile der Website setzen Sie `--oa-sticky-top` auf deren
Höhe: Alles bleibt darunter stehen, und Anker scrollen auf denselben
Abstand:

```css
:root {
  --oa-sticky-top: 64px;
}
```

Die Navigation bleibt in Fensterhöhe kleben. Scrollt die Referenz in einem
eigenen Kasten (feste `height` und `overflow: auto`), setzen Sie
`--oa-viewport-h` auf dessen Höhe, damit die Navigation hineinpasst:

```css
.api-box {
  height: 640px;
  overflow: auto;
  --oa-viewport-h: 640px;
}
```

Die eigene Kopfzeile der Referenz ist `--oa-header-h` (56px) hoch. Die
übrigen Variablen — Breite der Navigation, Abstände, Farben der Methoden —
stehen unter [Theming](theming.md).

## Der Kontext

`useReference` und `referenceKey` liefern den Zustand, den die Teile der
Referenz teilen: die Spezifikation, die Texte, den gewählten Server, die
Anmeldedaten und den Transport (`ReferenceContext`, `ServerState`). Sie werden
exportiert, um eigene Teile innerhalb der Referenz zu bauen; sie lesen den
Kontext, den `OpenApiReference` bereitstellt, und lassen sich außerhalb
davon nicht verwenden.
