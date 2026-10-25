# Eigenständige Seite und OpenApiPage

Zwei Wege zu einer ganzen Dokumentationsseite statt einer Komponente in
Ihrer App:

- **das eigenständige Bundle** — ein `<script>` auf einer beliebigen
  HTML-Seite, kein Build-Schritt, kein Vue in Ihrem Projekt;
- **`OpenApiPage`** — eine Vue-Komponente: die Referenz mit Umschaltern für
  Theme und Sprache in ihrer Kopfzeile.

Das eigenständige Bundle ist `OpenApiPage`, verpackt mit Vue, dem Kit und
allen Styles. Es bettet auch einzelne Operationen in andere Seiten ein: siehe
[Einbetten](embed.md).

## Das eigenständige Bundle

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
    <script>
      DskOpenApi.createApiReference('#app', {
        sources: [
          { url: '/docs/v1.json', title: 'API v1', slug: 'v1' },
          { url: '/docs/admin.yaml', title: 'Admin API', slug: 'admin' },
        ],
      })
    </script>
  </body>
</html>
```

`dist/standalone.js` ist ein klassisches Skript (eine IIFE), das die globale
Variable `DskOpenApi` definiert. Es enthält Vue, `@dskripchenko/ui` und alle
Stylesheets und fügt das CSS selbst in die Seite ein (einmal, auch wenn das
Skript zweimal eingebunden ist). Die Basis-Styles des Kits — Box-Sizing,
Abstände von Überschriften und Absätzen, die Grundschrift — sind auf die
eigenen Elemente des Pakets beschränkt, sodass der Rest der Seite sein
Aussehen behält; eine Seite mit einer ganzen Referenz bekommt außerdem
`body { margin: 0 }` und den Hintergrund des Kits. Dasselbe CSS ist als
`dist/standalone.css` veröffentlicht, für eine Seite, die lieber ein `<link>`
verwendet. In einem Bundler heißen die beiden Dateien
`@dskripchenko/openapi/standalone` und `@dskripchenko/openapi/standalone.css`.

### createApiReference

```ts
DskOpenApi.createApiReference(target, options) // → { app, unmount, setTheme, setLocale }
```

`target` ist ein CSS-Selektor oder ein Element; passt nichts, wirft die
Funktion. Das Ergebnis:

| | |
|---|---|
| `app` | Die Vue-Anwendung. |
| `unmount()` | Entfernt die Seite. |
| `setTheme(theme)` | `'light'`, `'dark'` oder `'system'`. |
| `setLocale(locale)` | `'en'`, `'ru'` oder `'auto'`. |

Optionen:

| Option | Typ | Standard | |
|---|---|---|---|
| `sources` | `{ url?, content?, title?, slug? }[]` | — | Die Spezifikationen, ein Eintrag je Spezifikation. |
| `url` | `string` | — | Eine Spezifikation ohne `sources`: woher sie geladen wird. |
| `content` | `string \| object` | — | Eine Spezifikation ohne `sources`: die Spezifikation selbst. |
| `locale` | `'en' \| 'ru' \| 'auto'` | `'auto'` | `'auto'` folgt der Sprache des Browsers: Russisch für jedes `ru*`, sonst Englisch. |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | `'system'` folgt `prefers-color-scheme`, live. |
| `persistTheme` | `boolean` | `false` | Das vom Besucher gewählte Theme merken (localStorage); das gemerkte gewinnt dann gegenüber `theme`. |
| `proxy` | `string` | — | Ein Endpunkt, der Try-it-Anfragen ausführt; siehe [den Proxy](#der-proxy). |
| `baseUrl` | `string` | der Origin der Seite | Die Basis, gegen die eine relative Server-URL aufgelöst wird. |
| `snippetTargets` | `SnippetTarget[]` | alle 13 | Die angebotenen Sprachen der Beispiele. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | Die zuerst gezeigte Sprache. |
| `tryIt` | `boolean` | `true` | `false` blendet die Try-it-Panels aus. |
| `title` | `string` | der Titel der geöffneten Spezifikation | Der Titel der Leiste; setzt auch `document.title`. |
| `persistCredentials` | `boolean \| 'session' \| 'local'` | `false` | Eingegebene Zugangsdaten im Browser behalten; siehe Referenz. |
| `oauthRedirectUrl` | `string` | Seiten-URL ohne Query und Hash | OAuth-Redirect-URI, die der Identity Provider erlauben muss. |

Eine Quelle:

- `url` — woher die Spezifikation geladen wird, JSON oder YAML, mit Cookies
  des eigenen Origins. Sie wird geladen, wenn die Spezifikation zum ersten
  Mal geöffnet wird.
- `content` — die Spezifikation selbst, als Text oder Objekt. Gewinnt
  gegenüber `url`.
- `title` — die Beschriftung im Umschalter der Spezifikationen;
  standardmäßig der eigene Titel der Spezifikation.
- `slug` — die id der Spezifikation, verwendet in Deep Links
  (`#v1/operation/…`). Ohne ihn ist die id der in einen Slug umgewandelte
  Titel, sonst `api-1`, `api-2`, … nach Position. Eine wiederholte id bekommt
  `-2`, `-3`, … angehängt.

Mit einer Quelle gibt es keinen Umschalter, und Anker tragen keine id; bei
mehreren siehe [mehrere Spezifikationen](reference.md#mehrere-spezifikationen).
Der Sprachumschalter der Seite setzt auch `<html lang>`.

### Der Proxy

Mit `proxy` laufen Try-it und die Token- und Discovery-Anfragen des
Anmelde-Panels über diesen Endpunkt statt direkt aus dem Browser. Der
Vertrag:

- Die Seite sendet `POST {proxy}` mit `Content-Type: application/json`,
  `Accept: application/json` und Cookies des eigenen Origins. Hat die Seite
  ein `<meta name="csrf-token" content="…">` (die Konvention von Laravel),
  geht sein Wert in den Header `X-CSRF-TOKEN`.
- Der Body ist der `HttpRequest` als JSON:
  `{ method, url, headers: [name, value][], body?: { mediaType, text?, form?, file? } }`.
  `url` ist absolut. Eine Datei — ein Formularfeld oder der ganze Body
  (`file`) — kommt als `{ filename, contentType?, base64? }` an, wobei
  `base64` ihre Bytes enthält (fehlt, wenn keine Datei gewählt wurde).
- Der Endpunkt prüft die URL gegen die erlaubten Hosts, führt die Anfrage aus
  und antwortet `200` mit der `HttpResponse` als JSON:
  `{ status, statusText, headers: [name, value][], body, bodyBase64?, duration?, error? }`.
  Eine binäre Antwort — ein Bild, eine PDF — kommt in `bodyBase64` mit
  `body: ''`; die Seite zeigt sie dann als Vorschau oder bietet sie zum
  Download an, typisiert nach dem Header `Content-Type`. `error` mit
  `status: 0` sagt, dass die API nicht erreicht wurde. Ein `body`,
  der kein String ist, wird als JSON angezeigt.
- Jede andere Antwort — nicht 2xx oder kein JSON — wird als fehlgeschlagene
  Anfrage angezeigt.
- „Cancel“ bricht den Aufruf des Proxys ab.

Den Endpunkt müssen Sie schützen: Lassen Sie nur die gewollten Hosts zu und
verlangen Sie dieselbe Anmeldung wie im Rest Ihres Backoffice, sonst ist er
ein offenes Relay. Der Proxy-Transport wird auch als
`DskOpenApi.proxySend(url)` exportiert.

## Umstieg von Scalar

Die Optionen folgen den Feldnamen von Scalars `createApiReference`:
`sources` mit `url`, `content`, `title` und `slug` oder `url` / `content` auf
oberster Ebene für eine einzelne Spezifikation. Eine Seite wie die
Dokumentationsansicht von laravel-api, die

```js
Scalar.createApiReference('#app', { sources: sources })
```

aufruft, wechselt, indem sie das andere Skript lädt und die andere globale
Variable mit demselben Objekt aufruft:

```html
<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
<script>
  DskOpenApi.createApiReference('#app', { sources: sources })
</script>
```

Für die Scalar-Seite gebaute Links funktionieren weiter:
`#{doc}/tag/{tag}/{METHOD}{path}`, `#{doc}/tag/{tag}` und
`#{doc}/model/{name}` öffnen dieselben Abschnitte (siehe
[Deep Links](links.md#links-von-scalar)). Andere als die oben aufgeführten
Scalar-Optionen werden ignoriert.

## OpenApiPage

Dieselbe Seite innerhalb einer Vue-App:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiPage, type PageTheme } from '@dskripchenko/openapi/vue'

const theme = ref<PageTheme>('system')
const locale = ref('auto')
</script>

<template>
  <OpenApiPage v-model:theme="theme" v-model:locale="locale" :specs="specs" persist-theme>
    <template #actions>
      <a href="/">Back to the site</a>
    </template>
  </OpenApiPage>
</template>
```

Props:

| Prop | Typ | Standard | |
|---|---|---|---|
| `theme` | `PageTheme` | `'system'` | `'light'`, `'dark'` oder `'system'`; mit `v-model:theme` verwenden. |
| `locale` | `string` | `'auto'` | `'en'`, `'ru'` oder `'auto'`; mit `v-model:locale` verwenden. |
| `title` | `string` | der Titel der geöffneten Spezifikation | Der Titel der Kopfzeile. |
| `languages` | `string[]` | `['en', 'ru']` | Die Sprachen, die der Umschalter anbietet; bei einer ist der Umschalter ausgeblendet. |
| `persistTheme` | `boolean` | `false` | Das gewählte Theme in localStorage unter `dsk-openapi-theme` behalten; es gewinnt dann gegenüber `theme`. |
| `applyTheme` | `boolean` | `true` | Das Theme in `data-theme` auf `<html>` schreiben, wo die Themes des Kits es lesen. Abschalten, wenn der Host die Seite selbst gestaltet. |

Jedes andere Attribut und jeder Listener — `spec`, `specs`, `send`, `tryIt`,
`labels`, `@loaded`, … — geht unverändert an die innere
[`OpenApiReference`](reference.md); `class` und `style` bleiben auf der Seite.
`labels` übersetzt auch die Umschalter.

Die Umschalter für Theme und Sprache sitzen am rechten Ende der Kopfzeile der
Referenz. Der Slot `#actions` setzt zusätzliche Bedienelemente davor. Der
Inhalt ist zentriert, mit einer maximalen Breite von `--oa-page-width` (1440px) und
einem seitlichen Abstand von `--oa-page-padding` (24px, 16px auf schmalen
Bildschirmen).

Über eine Template-Ref exponiert: `reference` (die innere
`OpenApiReference`), `setTheme(theme)` und `theme` — das tatsächlich gezeigte
Theme, mit `'system'` aufgelöst zu `'light'` oder `'dark'`.

`PageTheme`, `PAGE_THEMES` (`['light', 'dark', 'system']`) und
`resolveLocale(locale)` — das `'auto'` anhand der Browsersprache in `'en'`
oder `'ru'` umwandelt — werden ebenfalls aus `@dskripchenko/openapi/vue`
exportiert.
