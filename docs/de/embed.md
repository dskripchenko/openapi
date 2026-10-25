# Eine Operation einbetten

Eine einzelne Operation lässt sich in einer anderen Dokumentation zeigen —
einem Leitfaden, einem Changelog, einer Wiki-Seite — als kompakte Karte:
Methode, Pfad und Summary, eine kleine Werkzeugleiste und die Operation so,
wie die Referenz sie zeigt, mit Parametern, Body, Antworten,
Anfragebeispielen, Typen und Try-it. Es gibt keine Kopfzeile, Navigation oder
Fußzeile.

## In Vue: OpenApiOperation

```vue
<script setup lang="ts">
import { OpenApiOperation } from '@dskripchenko/openapi/vue'

const spec = () => fetch('/docs/v1.json').then((r) => r.json())
</script>

<template>
  <OpenApiOperation :spec="spec" operation="createOrder" reference-url="/docs" spec-id="v1" locale="en" />
</template>
```

`operation` benennt die Operation auf eine dieser Arten:

- ihre id — die `operationId` oder der Slug, den die Referenz einer Operation
  ohne sie gibt (`get-pets-id`);
- `METHOD /path` — `POST /orders`; auch ein Pfad mit dem Basispfad eines
  Servers davor (`POST /api/v1/orders`) wird gefunden;
- ein Anker — `operation/{id}` (mit oder ohne Spezifikationssegment und `#`)
  oder Scalars `tag/{tag}/{METHOD}{path}`.

Hat die Spezifikation keine solche Operation, meldet die Karte „Operation not
found“ und zeigt den Namen.

Props:

| Prop | Typ | Standard | |
|---|---|---|---|
| `spec` | `SpecInput` | — | Die Spezifikation: Text, ein geparstes Objekt oder eine Funktion, die ein Promise auf eines davon liefert. Pflicht. |
| `operation` | `string` | — | Die Operation, wie oben. Pflicht. |
| `referenceUrl` | `string` | — | Die Adresse der vollständigen Referenz. Ist sie gesetzt, hat die Karte einen Link „Open in reference“ zur Operation dort. |
| `specId` | `string` | — | Die id der Spezifikation in dieser Referenz (ihre `specs`-id, der `slug` des eigenständigen Bundles): Der Anker des Links bekommt sie vorangestellt, und gespeicherte Anmeldedaten werden unter demselben Schlüssel mit der Referenz geteilt. |
| `send`, `tryIt`, `locale`, `labels`, `snippetTargets`, `defaultSnippet`, `baseUrl`, `external`, `persistCredentials`, `oauthRedirectUrl` | | | Wie bei [`OpenApiReference`](reference.md#props). |

Events: `loaded(spec)` und `error(error)`. Exponiert: `spec` (die
`LoadedSpec`), `entry` (der `OperationEntry`) und `print()`.

Die Werkzeugleiste hat die Einstellungsschaltfläche — Host des Servers und
Schlüsselsymbol, wie in der Kopfzeile der Referenz —, die eine Leiste mit dem
Server und dem Anmelde-Panel öffnet; „PDF“, das die Operation druckt (siehe
[Download und Druck](reference.md#download-und-druck)), mit dem Link zur
Referenz als Adresse, wenn `referenceUrl` gesetzt ist; und „Open in
reference“.

Mehrere Einbettungen derselben Spezifikationseingabe — derselbe Text,
dasselbe Objekt, dieselbe Ladefunktion — laden sie einmal, und ein
fehlgeschlagenes Laden versucht die nächste Einbettung erneut. Geben Sie
allen dieselbe Ladefunktion statt jeweils einer neuen Pfeilfunktion:

```ts
export const v1 = () => fetch('/docs/v1.json').then((r) => r.json())
```

`findOperation(spec, name)` — die Suche, die die Karte verwendet — wird
ebenfalls aus `@dskripchenko/openapi/vue` exportiert.

## Ohne Build: das eigenständige Bundle

Das [eigenständige Bundle](standalone.md) bettet ebenfalls ein. Am
einfachsten geht es mit Markup und einem Skript mit `data-auto`:

```html
<div data-openapi-operation="createOrder" data-openapi-src="/docs/v1.json"></div>

<p>… the guide continues …</p>

<div data-openapi-operation="GET /orders/{id}" data-openapi-src="/docs/v1.json"></div>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

Mit `data-auto` an seinem Tag bindet das Skript jedes Element
`[data-openapi-operation]` ein, sobald das Dokument geparst ist.
Einbettungen derselben URL laden sie einmal. Attribute:

| Attribut | |
|---|---|
| `data-openapi-operation` | Die Operation, wie oben. Pflicht. |
| `data-openapi-src` | Die URL der Spezifikation. |
| `data-openapi-theme` | `light`, `dark` oder `system`. |
| `data-openapi-locale` | `en`, `ru` oder `auto`. |
| `data-openapi-proxy` | Ein Try-it-Proxy; siehe [den Proxy](standalone.md#der-proxy). |
| `data-openapi-try-it` | `false` blendet Try-it aus. |
| `data-openapi-reference` | Die Adresse der vollständigen Referenz, für „Open in reference“. |
| `data-openapi-slug` | Die id der Spezifikation in dieser Referenz. |

Später hinzugefügte Elemente werden eingebunden, indem man
`DskOpenApi.autoMount(root?)` erneut aufruft — es überspringt die schon
eingebundenen (sie tragen `data-openapi-mounted`) und liefert die neuen
Einbettungen; ein fehlerhaftes Element wird protokolliert und hält die
übrigen nicht auf.

Aus einem Skript:

```js
const embed = DskOpenApi.mountOperation('#order-create', {
  source: '/docs/v1.json',
  operation: 'createOrder',
  referenceUrl: '/docs',
  theme: 'system',
  locale: 'auto',
})
embed.setLocale('ru')
embed.unmount()
```

`mountOperation(target, options)` nimmt einen Selektor oder ein Element und
liefert `{ app, unmount(), setTheme(theme), setLocale(locale) }`. Optionen:

| Option | |
|---|---|
| `operation` | Die Operation, wie oben. Pflicht. |
| `source` | Die URL der Spezifikation oder eine Quelle wie in `createApiReference` — `{ url?, content?, slug? }`, wobei `content` vor `url` geht; `slug` ist die id der Spezifikation in der Referenz. |
| `theme` | `'light'`, `'dark'` oder `'system'`; siehe unten. |
| `locale` | `'en'`, `'ru'` oder `'auto'` (Standard): `auto` nimmt das `<html lang>` der Seite, sonst die Sprache des Browsers. Das Attribut `lang` der Karte wird darauf gesetzt; das eigene `lang` der Seite bleibt unberührt. |
| `proxy`, `tryIt`, `referenceUrl`, `baseUrl`, `snippetTargets`, `defaultSnippet`, `persistCredentials`, `oauthRedirectUrl` | Wie in den Tabellen oben und in [`createApiReference`](standalone.md#createapireference). |

## Theme in einer fremden Seite

Die Themes des Kits richten sich nach `<html data-theme>`. Eine Einbettung
überlässt das Theme deshalb der Hostseite, sofern keines angegeben ist: Mit
`theme` (oder `data-openapi-theme`) schreibt sie `data-theme` auf `<html>` —
für die ganze Seite —, und `system` folgt `prefers-color-scheme` live. Setzt
die Seite überhaupt kein `data-theme`, gelten die hellen Farben des Kits für
`:root:not([data-theme])`, nur als Custom Properties, die nichts ändern, was
die Hostseite selbst verwendet.

Die Basis-Styles des eigenständigen Bundles — Box-Sizing, Abstände von
Überschriften und Absätzen, die Grundschrift — sind auf die eigenen Elemente
des Pakets und die Overlays des Kits beschränkt, sodass Text, Überschriften
und Bilder der Hostseite bleiben, wie sie sind. Nur eine ganze
Referenzseite (`createApiReference`) übernimmt zusätzlich Rand und
Hintergrund des Bodys.
