# OpenApiEditor

Ein visueller Editor für OpenAPI-Dokumente, mit Quelltext und Vorschau neben
den Formularen.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiEditor } from '@dskripchenko/openapi/vue'

const text = ref(initialYaml)
</script>

<template>
  <OpenApiEditor v-model="text" locale="en" />
</template>
```

## Props und Events

| Prop | Typ | Standard | |
|---|---|---|---|
| `modelValue` | `string` | — | Der Text des Dokuments, YAML oder JSON. Mit `v-model` verwenden. |
| `view` | `'visual' \| 'source' \| 'preview'` | `'visual'` | Die Ansicht, mit der der Editor öffnet. |
| `locale` | `string` | — | `'en'` oder `'ru'`; setzt auch die Locale des Kits im Inneren, wie bei der [Referenz](reference.md#sprachen). |
| `labels` | `Partial<EditorLabels>` | `{}` | Überschreibt einzelne Texte des Editors. |
| `send` | `SendFn` | `fetch` | Wird an das Try-it der Vorschau weitergegeben. Siehe [den Proxy](reference.md#senden-über-ihren-server). |
| `newFormat` | `'yaml' \| 'json'` | `'yaml'` | Das Format eines Dokuments, das aus einem leeren Text erstellt wird. |

| Event | Payload | |
|---|---|---|
| `update:modelValue` | `string` | Der neue Text, nach jeder Änderung in jeder Ansicht. |

Der Text ist der einzige Zustand, den der Editor mit dem Host teilt:
Speichern Sie ihn so, wie Sie jeden anderen Text speichern. Ein neuer
`modelValue` von außen ersetzt das bearbeitete Dokument.

## Das Format bleibt erhalten

Der Editor liest den Text als YAML oder JSON (JSON, wenn er mit `{` oder `[`
beginnt) und schreibt ihn im selben Format zurück. Die Leiste hat einen
Umschalter YAML / JSON, der das ganze Dokument im anderen Format neu
schreibt.

Auch die Version bleibt erhalten: Die Formulare bearbeiten das Dokument, wie
es ist, nicht eine normalisierte Kopie; ein OpenAPI-3.0-Dokument bleibt also
3.0. Wo die beiden Versionen etwas unterschiedlich schreiben, folgen die
Formulare der Version des Dokuments — ein nullable-Feld wird in 3.0 zu
`nullable: true` und in 3.1 zu `type: [string, 'null']`.

## Drei Ansichten

Die Leiste oben schaltet zwischen ihnen um.

**Visual.** Links ein Baum des Dokuments: Info, Server, Tags,
Security-Schemas, Pfade mit ihren Operationen und Schemas. `+` neben einem
Abschnitt fügt einen Eintrag hinzu. Rechts ein Formular für den gewählten
Knoten.

**Source.** Der Text mit Hervorhebung, Zeilennummern und den gefundenen
Problemen darunter. Eingaben hier bearbeiten den Text, wie er ist —
Formatierung und Kommentare bleiben. Tab fügt zwei Leerzeichen ein. Sehr
große Texte (über etwa 150.000 Zeichen) werden ohne Hervorhebung gezeigt,
damit das Tippen flüssig bleibt.

**Preview.** Das Dokument, gerendert von
[`OpenApiReference`](reference.md), mit denselben `locale` und `send`; Try-it
funktioniert dort. Die Vorschau rührt `location.hash` nicht an.

## Was die Formulare abdecken

- **Info** — Titel, Version, Zusammenfassung, Beschreibung (Markdown),
  Nutzungsbedingungen, Name, E-Mail und URL des Kontakts, Name und URL der
  Lizenz.
- **Server** — URL und Beschreibung jedes Servers und seine Variablen mit
  einem Standardwert und einer Liste erlaubter Werte.
- **Tags** — Name und Beschreibung; ihre Reihenfolge ist die Reihenfolge der
  Abschnitte in der Referenz.
- **Security-Schemas** — der Typ (`apiKey`, `http`, `oauth2`,
  `openIdConnect`, `mutualTLS`) und die Felder dieses Typs: wohin ein
  API-Schlüssel geht und sein Name; das http-Schema und das Bearer-Format; ein
  OAuth2-Flow mit seinen URLs und Scopes (ein `name: description` pro Zeile);
  die OpenID-Connect-URL.
- **Pfade** — die Pfadvorlage (umbenannt, wenn das Feld den Fokus verliert;
  sie muss mit `/` beginnen), ihre Methoden und „Add operation“.
- **Operationen** — Zusammenfassung, Beschreibung, `operationId`, Tags,
  deprecated; Parameter (Name, `in`, required, Beschreibung, Schema), mit
  Ein-Klick-Einträgen für die `{names}` des Pfads, die noch keinen Parameter
  haben; der Request-Body mit seinen Media Types und deren Schemas; Antworten
  nach Statuscode mit Beschreibung und Inhalt; Security — wie im Dokument,
  keine oder gewählte Schemas.
- **Schemas** — der Name (umbenannt beim Verlassen des Feldes; Referenzen
  `#/components/schemas/{name}` im ganzen Dokument folgen dem neuen Namen)
  und das Schema selbst: ein Typ, eine Referenz auf ein anderes Schema oder
  eine Komposition `oneOf` / `anyOf` / `allOf`; Format, nullable, erlaubte
  Werte, Standardwert, Beispiel, Pattern und die Grenzen für Länge, Bereich
  und Elementanzahl; Properties mit ihrem required-Flag und Array-Elemente —
  jedes mit einem eigenen Schemaformular.

Alles, was die Formulare nicht zeigen — Erweiterungen, `examples`,
`callbacks`, `links`, `security` auf Dokumentebene und der Rest —, bleibt
unverändert erhalten und lässt sich im Quelltext bearbeiten.

## Visuelle Änderungen schreiben den Text neu

Eine Änderung in einem Formular wird etwa eine Viertelsekunde nach dem
letzten Tastendruck zurückgeschrieben, indem das ganze Dokument neu
serialisiert wird. Die Reihenfolge der Schlüssel bleibt dabei erhalten, aber
der Text wird neu gesetzt: in YAML mit 2 Leerzeichen Einrückung und
Anführungszeichen nur, wo nötig; in JSON mit 2 Leerzeichen formatiert.

**Kommentare in YAML überstehen eine visuelle Änderung nicht**, ebenso wenig
eine eigene Formatierung. Wenn die Kommentare der Datei wichtig sind,
bearbeiten Sie sie in der Quelltext-Ansicht: Dort bleibt der Text genau so,
wie er eingegeben wurde.

## Swagger 2.0

Ein Swagger-2.0-Dokument öffnet sich in den Ansichten Source und Preview wie
gewohnt. Die visuelle Ansicht zeigt statt der Formulare einen Hinweis, da die
Formulare OpenAPI 3 sprechen, mit einer Schaltfläche „Convert to OpenAPI
3.1“. Die Konvertierung ist dieselbe, die die Referenz für die Anzeige
verwendet (siehe [`normalize`](core.md#normalisierung)): `host`, `basePath`
und `schemes` werden zu `servers`, Body- und Formularparameter zu
`requestBody`, `definitions` zu `components.schemas` und so weiter. Sie
ersetzt den Text; um die 2.0-Datei zu behalten, bewahren Sie eine Kopie auf.

## Ein leerer Text

Ist `modelValue` leer, bietet die visuelle Ansicht „Create a document“ an,
das ein minimales OpenAPI-3.1-Dokument (Titel, Version, leere `paths`) im
Format `newFormat` schreibt.

## Probleme

Die Leiste zeigt die Anzahl der Fehler im Dokument — die Schaltfläche
„Problems: N“ oder „No problems“. Sie öffnet die Quelltext-Ansicht, in der
jedes von [`validateDocument`](core.md#validierung) gefundene Problem mit
seiner Zeile aufgeführt ist, Fehler wie Warnungen; ein Klick setzt den Cursor
in diese Zeile, und Zeilen mit Fehlern sind in der Randspalte markiert. Text,
der sich überhaupt nicht parsen lässt, zeigt stattdessen die Meldung und
Position des Parsers; bis der Text wieder lesbar ist, zeigen auch die
visuelle Ansicht und die Vorschau diese Meldung.

Probleme werden nach jedem Parsen und jeder Formularänderung neu geprüft.
Beim Tippen in einem sehr großen Text (über 100.000 Zeichen) wartet das
Parsen auf eine kurze Pause.

## Texte

`locale` wählt die Texte des Editors — Englisch (`editorEn`) und Russisch
(`editorRu`) liefert das Paket mit, `EDITOR_LOCALES` enthält beide —, und
`labels` überschreibt einzelne:

```vue
<OpenApiEditor v-model="text" locale="en" :labels="{ visual: 'Forms', newDocumentTitle: 'Untitled API' }" />
```

Ein vollständiges Wörterbuch für eine andere Sprache hat den Typ
`EditorLabels`:

```ts
import { editorEn, type EditorLabels } from '@dskripchenko/openapi/vue'

const editorDe: EditorLabels = { ...editorEn, visual: 'Formulare', source: 'Quelltext', preview: 'Vorschau' /* … */ }
```

Die Vorschau ist eine `OpenApiReference` und nimmt ihre Texte nur aus
`locale`; die `labels` des Editors erreichen sie nicht.
