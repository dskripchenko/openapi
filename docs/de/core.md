# Kern-API

Alles auf dieser Seite wird aus `@dskripchenko/openapi` exportiert. Der Kern
hat keine Abhängigkeiten und greift nicht auf das DOM zu; er läuft daher
gleich im Browser, in Node 20+ und in einem Build-Skript.

## Eine Spezifikation laden

```ts
import { loadSpec } from '@dskripchenko/openapi'

const spec = loadSpec(text)
```

`loadSpec(input, options?)` nimmt YAML- oder JSON-Text oder ein bereits
geparstes Objekt und gibt eine `LoadedSpec` zurück:

| Feld | |
|---|---|
| `source` | `{ family, version, raw, format? }` — die Eingabe, wie sie war: `family` ist `'swagger2'`, `'openapi30'` oder `'openapi31'`, `version` die deklarierte Version, `raw` das geparste Objekt, `format` `'yaml'` oder `'json'`, wenn Text übergeben wurde. |
| `document` | Das auf OpenAPI 3.1 normalisierte Dokument (siehe [Normalisierung](#normalisierung)). |
| `resolver` | Löst die `$ref`s von `document` auf (siehe [Referenzen](#referenzen)). |
| `operations` | Alle Operationen aus `paths` und `webhooks` in Dokumentreihenfolge (`OperationEntry[]`). |
| `groups` | Die Operationen nach Tags gruppiert (`OperationGroup[]`). |
| `tagGroups` | Tag-Gruppen aus `x-tagGroups`, wenn das Dokument welche hat. |
| `warnings` | Hinweise aus der Normalisierung, etwa ein fehlendes `info`. |
| `positions` | Quellpositionen von `raw` (wenn Text übergeben wurde). |

Die einzige Option ist `external`, ein Loader für externe Referenzen, der
unter [Referenzen](#referenzen) beschrieben ist.

`loadSpec` wirft `YamlError` oder `JsonError`, wenn sich der Text nicht lesen
lässt, und `OpenApiError`, wenn der Wert kein Swagger-2.0- oder
OpenAPI-3.x-Dokument ist. Versionen über 3.1 (3.2) werden als 3.1 gelesen.

```ts
import { loadSpec, JsonError, OpenApiError, YamlError } from '@dskripchenko/openapi'

try {
  loadSpec(text)
} catch (error) {
  if (error instanceof YamlError || error instanceof JsonError) {
    error.line     // 1-based
    error.column   // 1-based
    error.reason   // the message without the position
  } else if (error instanceof OpenApiError) {
    error.message  // 'Not an OpenAPI document: neither "openapi" nor "swagger" field found'
  }
}
```

`loadDocument(raw, { positions?, format?, external? })` tut dasselbe für ein
selbst geparstes Objekt und übernimmt die übergebenen Positionen.

### Operationen

Ein `OperationEntry` hat:

| Feld | |
|---|---|
| `id` | Die `operationId` oder ein Slug aus Methode und Pfad (`get-pets-id`); eindeutig im Dokument. |
| `method` | `'get'`, `'post'`, … (Kleinbuchstaben). |
| `path` | Die Pfadvorlage oder der Name des Webhooks. |
| `operation`, `pathItem` | Die Objekte aus dem Dokument. |
| `tags` | Die Tags der Operation, `['default']`, wenn sie keine hat. |
| `parameters` | Parameter auf Pfad- und Operationsebene zusammengeführt (die der Operation gewinnen), dereferenziert. |
| `deprecated` | `boolean`. |
| `webhook` | Der Name des Webhooks, bei Operationen aus `webhooks`. |

Eine `OperationGroup` ist `{ name, displayName, description?, tag?, operations }`.
`displayName` ist das `x-displayName` des Tags oder sein Name. Deklarierte
Tags kommen zuerst in ihrer Reihenfolge, dann Tags, die nur an Operationen
vorkommen; eine Operation mit mehreren Tags steht in jeder ihrer Gruppen.

`listOperations(document, resolver)` und `groupByTag(document, operations)`
sind die beiden Schritte einzeln; `DEFAULT_TAG` ist `'default'`.

## Parser

```ts
import { parseSpec, parseYaml, parseJson, detectFormat } from '@dskripchenko/openapi'

const { value, positions, format } = parseSpec(text)   // format detected
const yaml = parseYaml(text)                           // { value, positions }
const json = parseJson(text)                           // { value, positions }
detectFormat('  {"openapi": "3.1.0"}')                 // 'json'
```

`detectFormat` liefert `'json'`, wenn das erste Zeichen außer Leerraum `{`
oder `[` ist, sonst `'yaml'`. `parseSpec(text, format?)` verwendet es, sofern
Sie das Format nicht angeben.

Beide Parser geben `positions` zurück: eine `Map` von einem JSON Pointer auf
die Stelle im Text, an der der Wert beginnt, `{ line, column }`, beide ab 1.
Ein Objektmitglied zeigt auf seinen Schlüssel, ein Array-Element auf das
Element, die Wurzel (`''`) auf 1:1.

```ts
const { positions } = parseYaml(text)
positions.get('/paths/~1pets~1{id}/get')   // { line: 9, column: 5 }
```

**YAML.** Der Parser deckt ab, was Spezifikationen verwenden: Block-Mappings
und -Sequenzen, Flow-Collections `{}` und `[]`, einfache, einfach und doppelt
gequotete Skalare mit Escapes, Blockskalare `|` und `>` mit Chomping- (`-`,
`+`) und Einrückungsindikatoren, Kommentare, `---` und `...`, Anker `&a`,
Aliasse `*a` und den Merge-Schlüssel `<<`. Skalare folgen dem Core-Schema:
`null`, `true`/`false`, dezimale, hexadezimale (`0x`) und oktale (`0o`)
Ganzzahlen, Gleitkommazahlen, `.inf` und `.nan`. Tags werden ignoriert,
außer `!!str`, das einen Skalar als String erhält. Ein Dokument pro Text. Ein
Syntaxfehler wirft `YamlError`.

**JSON.** Strikt nach RFC 8259. Ein UTF-8-BOM wird akzeptiert. Anders als bei
`JSON.parse` ist ein doppelter Schlüssel ein Fehler, denn in einer
Spezifikation ist er immer ein Versehen. Ein Syntaxfehler wirft `JsonError`.

### Schreiben

```ts
import { stringifySpec, stringifyYaml, stringifyJson } from '@dskripchenko/openapi'

stringifySpec(value, 'yaml')                 // YAML, 2-space indent
stringifySpec(value, 'json')                 // JSON, 2-space indent
stringifyYaml(value, { indent: 4, lineWidth: 0 })
stringifyJson(value, 2)
```

`stringifyYaml` ist deterministisch: Die Reihenfolge der Schlüssel bleibt
erhalten, ein Skalar wird nur gequotet, wenn er ohne Anführungszeichen als
etwas anderes zurückgelesen würde, und mehrzeilige Strings werden als
`|`-Blöcke geschrieben. `indent` sind 1–8 Leerzeichen (Standard 2);
einzeilige Strings, die länger als `lineWidth` (Standard 80) sind, werden an
Leerzeichen als `>-`-Blöcke umbrochen, und `lineWidth: 0` schaltet das
Umbrechen ab. Kommentare eines geparsten Textes bleiben nicht erhalten: Der
Parser zeichnet sie nicht auf.

## Normalisierung

```ts
import { normalize, detectVersion } from '@dskripchenko/openapi'

detectVersion(raw)                    // { family: 'swagger2', version: '2.0' }
const { document, warnings } = normalize(raw)
document.openapi                      // '3.1.0'
```

`normalize` bringt jedes unterstützte Dokument in die Form von OpenAPI 3.1.
Die Eingabe wird nicht verändert; das Ergebnis teilt nichts mit ihr.

Aus **Swagger 2.0**:

- `host`, `basePath` und `schemes` werden zu `servers`;
- ein `body`-Parameter und `consumes` / `produces` werden zu `requestBody`
  und `content` der Antworten;
- `formData`-Parameter werden zu einem Body vom Typ
  `application/x-www-form-urlencoded` oder `multipart/form-data`;
- `definitions` werden zu `components.schemas`, `securityDefinitions` zu
  `components.securitySchemes`, und jeder `$ref` wird passend umgeschrieben.

Aus **OpenAPI 3.0**:

- `nullable: true` wird zu einem Typ mit `'null'` (`type: [string, 'null']`);
- boolesche `exclusiveMinimum` / `exclusiveMaximum` werden zur numerischen
  Form;
- das `example` eines Schemas bleibt zusätzlich erhalten.

`upgradeSchema30(schema)` wendet die Schemaregeln 3.0 → 3.1 auf ein einzelnes
Schema an und gibt das Ergebnis zurück. Es arbeitet auf dem übergebenen
Objekt; übergeben Sie eine Kopie, um das Original zu behalten.

## Referenzen

```ts
import { createResolver } from '@dskripchenko/openapi'

const resolver = createResolver(document, { external })

resolver.get('#/components/schemas/Pet')          // one step
resolver.deref({ $ref: '#/components/schemas/Pet' }) // the whole chain
resolver.isCircular('#/components/schemas/Node')  // true for a self-referencing schema
```

- `get(ref)` gibt zurück, worauf die Referenz zeigt, oder `undefined`.
- `deref(value)` folgt einer Kette von Referenzen bis zu einem konkreten Wert
  und gibt einen Wert, der keine Referenz ist, unverändert zurück; eine
  kaputte oder zirkuläre Kette ergibt `undefined`.
- `isCircular(ref)` sagt, ob die Struktur hinter `ref` zu ihr zurückführt.

`loadSpec` erstellt den Resolver für Sie als `spec.resolver`.

**Externe Referenzen** (`common.yaml#/Pet`) werden nur über die Option
`external` aufgelöst: eine synchrone Funktion, die den URL-Teil der Referenz
so erhält, wie er geschrieben ist, und das geparste Dokument oder `undefined`
zurückgibt. Ihr Ergebnis wird pro URL zwischengespeichert; eine Ausnahme zählt
als `undefined`. Ohne `external` wird nichts außerhalb des Dokuments geladen:

```ts
const common = parseSpec(commonText).value
const spec = loadSpec(text, { external: (url) => (url === 'common.yaml' ? common : undefined) })
```

## Validierung

```ts
import { parseSpec, validateDocument } from '@dskripchenko/openapi'

const { value, positions } = parseSpec(text)
const issues = validateDocument(value, { positions })
// [{ pointer: '/paths/~1a~1{id}/get', message: 'Path parameter "id" of "/a/{id}" is not defined',
//    severity: 'error', line: 6, column: 5 }]
```

`validateDocument(raw, { positions? })` prüft das Rohdokument — 2.0, 3.0 oder
3.1, vor der Normalisierung — und gibt `DocumentIssue[]` zurück:
`{ pointer, message, severity: 'error' | 'warning', line?, column? }`. Mit
`positions` aus dem Parser bekommt jedes Problem seine Zeile. Die Funktion
wirft nie; ein Objekt, das keine Spezifikation ist, ergibt einen Fehler.

Sie prüft die Struktur, auf die sich ein Renderer verlässt, nicht jede Regel
der Spezifikation: Pflichtfelder (`info.title`, `info.version`, `paths`,
`responses`, die `description` einer Antwort, `name` und `in` eines
Parameters), Pfade, die mit `/` beginnen, Pfadparameter, die deklariert und
required sind, doppelte Parameter und `operationId`s, Statuscodes,
Servervariablen, die Felder, die jeder Typ von Security-Schema braucht,
verwendete, aber nicht deklarierte Tags, Referenzen, die sich nicht auflösen
lassen, und unbekannte Felder auf oberster Ebene.

## Schemas

Die Schemafunktionen nehmen eine Funktion `resolve`, `(ref: string) => Schema |
undefined`, um `$ref`s zu folgen. Mit einer geladenen Spezifikation:

```ts
import { loadSpec, sampleSchema, sampleXml, validateValue, describeSchema, type Schema } from '@dskripchenko/openapi'

const spec = loadSpec(text)
const resolve = (ref: string) => spec.resolver.get(ref) as Schema | undefined
const pet: Schema = { $ref: '#/components/schemas/Pet' }
```

### Beispiele

```ts
sampleSchema(pet, { resolve, mode: 'response' })  // { id: 0, name: 'Rex', tag: 'string' }
sampleSchema(pet, { resolve, mode: 'request' })   // { name: 'Rex', tag: 'string' } — readOnly id left out
sampleXml(pet, { resolve })                       // '<?xml version="1.0" encoding="UTF-8"?>\n<Pet>…</Pet>'
```

`sampleSchema(schema, options?)` erzeugt einen Beispielwert. Es nimmt der
Reihe nach `example`, das erste aus `examples`, `default`, `const`, den
ersten `enum`-Wert und erzeugt sonst einen nach Typ. Strings mit bekanntem
`format` bekommen einen festen Wert (`FORMAT_SAMPLES`: `date-time`, `date`,
`time`, `email`, `uuid`, `uri`, `hostname`, `ipv4`, `ipv6`, `byte`,
`binary`, `password` und weitere); `minLength`, `pattern`, Zahlenbereiche
und `minItems` werden beachtet. `allOf` wird zusammengeführt, `oneOf` und
`anyOf` nehmen ihren ersten Zweig.

Optionen: `mode` — `'request'` lässt `readOnly`-Properties weg, `'response'`
lässt `writeOnly`-Properties weg; `maxDepth` — die Verschachtelungsgrenze,
tiefere Ebenen werden zu `{}` oder `[]` (Standard 8); `preferExamples` —
`example` / `examples` verwenden (Standard `true`). Ein Schema, das auf sich
selbst verweist, ergibt `{}` dort, wo sich der Zyklus schließt. Das Ergebnis
ist deterministisch: Dasselbe Schema ergibt immer dasselbe Beispiel.

`sampleXml(schema, options?)` schreibt das Beispiel als XML-Dokument und
folgt den `xml`-Hinweisen des Schemas (`name`, `attribute`, `wrapped`,
Namespaces). Das Wurzelelement heißt nach `xml.name`, nach dem Namen des
referenzierten Schemas oder `root`.

### Einen Wert validieren

```ts
validateValue({ name: 5 }, pet, { resolve })
// [{ path: '', message: "must have required property 'id'", keyword: 'required' },
//  { path: '/name', message: 'must be string', keyword: 'type' }]
```

`validateValue(value, schema, { resolve?, mode? })` prüft einen Wert gegen
JSON Schema 2020-12, wie OpenAPI 3.1 es verwendet, und toleriert dabei
`nullable` und boolesche exklusive Grenzen aus 3.0. Die Funktion gibt jedes
`ValidationIssue` zurück — `{ path, message, keyword }`, wobei `path` ein
JSON Pointer in den Wert ist — und eine leere Liste, wenn der Wert gültig
ist. Mit `mode: 'request'` ist eine `readOnly`-Property ein Fehler, mit
`'response'` eine `writeOnly`-Property.

### Einen Typ beschreiben

```ts
describeSchema(pet)                                       // 'Pet'
describeSchema({ type: 'array', items: pet })             // 'array<Pet>'
describeSchema({ type: ['string', 'null'], format: 'uuid' }) // 'string<uuid> | null'
```

`describeSchema(schema, { resolve? })` liefert die kurze Typbezeichnung, die
die Referenz neben einem Feld zeigt: `string<uuid>`, `array<Pet>`,
`oneOf: Cat | Dog`, `string | null` und so weiter.

## Anfragen

`HttpRequest` ist die Form, die die Beispiele ausgeben und Try-it sendet:
`{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`.

### Eine Anfrage bauen

```ts
import { buildRequest, serverUrl } from '@dskripchenko/openapi'

const op = spec.operations.find((o) => o.id === 'uploadPhoto')!
const request = buildRequest({
  method: op.method,
  path: op.path,                                    // '/pets/{id}/photo'
  server: serverUrl(spec.document.servers![0]!),    // 'https://api.example.com'
  parameters: op.parameters,
  values: { path: { id: 42 }, query: { size: 'large' } },
  body: {
    mediaType: 'multipart/form-data',
    value: { caption: 'Rex at the beach', photo: { filename: 'rex.png', contentType: 'image/png' } },
  },
  security: [{ scheme: { type: 'apiKey', name: 'X-API-Key', in: 'header' }, value: 'secret' }],
})
```

`buildRequest(input)` nimmt:

| Feld | |
|---|---|
| `method`, `path` | Die Methode und die Pfadvorlage. |
| `server` | Die Basis-URL, bereits mit `serverUrl` aufgelöst; darf relativ sein. |
| `parameters` | Die dereferenzierten Parameter der Operation (`OperationEntry.parameters`). |
| `values` | Werte nach Ort und Name: `{ path?, query?, header?, cookie? }`. |
| `body` | `{ mediaType, value, encoding? }` — ein Objekt für strukturierte Media Types oder der eingegebene Text. |
| `security` | `AppliedSecurity[]`: `{ scheme, value }` — ein Schlüssel oder Token oder `{ username, password }` für Basic. |

Dabei gelten die Regeln der Spezifikation:

- Parameter werden nach `style` und `explode` serialisiert — path `simple`,
  `label`, `matrix`; query `form`, `spaceDelimited`, `pipeDelimited`,
  `deepObject`; header `simple`; cookie `form` —, und Parameter mit
  `content` werden in diesem Media Type geschrieben;
- ein Pfadplatzhalter ohne Wert bleibt als `{name}` stehen;
- leere optionale Werte werden weggelassen; ein leerer String bleibt nur mit
  `allowEmptyValue` erhalten;
- Header-Parameter namens `Accept`, `Content-Type` und `Authorization` werden
  ignoriert, wie es die Spezifikation verlangt;
- Cookies aus Parametern und API-Schlüsseln kommen in einen einzigen
  `Cookie`-Header;
- `Content-Type` wird aus dem Media Type des Bodys gesetzt, außer bei
  Multipart, wo der HTTP-Client ihn mit der Boundary ergänzt;
- ein JSON-Body wird serialisiert, ein urlencoded Body nach seinem
  `encoding` kodiert, und ein Multipart-Body behält Dateifelder als
  `{ filename, contentType?, data? }` (`data` ist ein `Blob` oder ein
  String); Objekte in Multipart-Feldern werden zu JSON, Arrays wiederholen
  das Feld.

### Parameter und Server einzeln

```ts
import { serializeParam, serverUrl, joinUrl } from '@dskripchenko/openapi'

serializeParam({ name: 'ids', in: 'query', style: 'form', explode: false }, [1, 2, 3])
// { in: 'query', name: 'ids', pairs: [['ids', '1,2,3']] }
serializeParam({ name: 'filter', in: 'query', style: 'deepObject', explode: true }, { color: 'red' })
// { in: 'query', name: 'filter', pairs: [['filter[color]', 'red']] }
serializeParam({ name: 'id', in: 'path', style: 'matrix' }, 5)
// { in: 'path', name: 'id', value: ';id=5' }

serverUrl({ url: 'https://{region}.example.com', variables: { region: { default: 'eu' } } }, { region: 'us' })
// 'https://us.example.com'
joinUrl('https://api.example.com/v1/', '/pets')   // 'https://api.example.com/v1/pets'
```

`serializeParam(param, value)` gibt Pfad- und Header-Werte gebrauchsfertig
und Query- und Cookie-Paare bereits prozentkodiert zurück; `undefined`
bedeutet „den Parameter weglassen“. `serializeValue(location, name, value,
{ style, explode, allowReserved, raw })` tut dasselbe ohne Parameterobjekt,
und `defaultStyle(location)` liefert den Standardstil eines Ortes.
`serverUrl(server, variables?)` füllt Servervariablen (übergebene Werte, dann
Standardwerte); `joinUrl(base, path)` setzt genau einen Schrägstrich
dazwischen und lässt eine relative Basis relativ.

`applySecurity(list)` macht aus `AppliedSecurity[]`
`{ headers, query, cookies }`, und `basicAuth(username, password)` liefert
den Header-Wert `Basic …`. Die kleinen Encoder, die der Builder verwendet,
werden ebenfalls exportiert: `encodeComponent`, `encodeCookie`,
`base64Utf8`, `baseMediaType`, `isJsonMediaType`, `isFormUrlEncoded`,
`isMultipart`.

### Senden

```ts
import { sendRequest } from '@dskripchenko/openapi'

const response = await sendRequest(request, { credentials: 'same-origin' })
response.status     // 0 when there was no response
response.error      // the reason in that case: network, CORS
response.body       // the body as text
response.duration   // milliseconds
```

`sendRequest(request, { fetch?, signal?, credentials? })` sendet mit `fetch`
(dem globalen, sofern Sie kein anderes übergeben) und liest den Body als
Text. Die Funktion wirft nie: Ein Fehlschlag vor einer Antwort kommt als
`status: 0` mit gesetztem `error` zurück. `credentials` ist standardmäßig
`'same-origin'`, Cookies werden also nie an eine fremde API gesendet. Bei
einem Multipart-Body entfernt sie `Content-Type`, damit `fetch` ihn mit der
Boundary setzt. Im Browser verwirft der Browser selbst die Header, die er
verbietet (`Cookie`, `Host`, `Origin`, …).

`toFetchBody(request)` liefert den `fetch`-Body allein: `FormData` für
Multipart, `URLSearchParams` für urlencoded Formulare, sonst den Text.

`SendFn` — `(request: HttpRequest) => Promise<HttpResponse>` — ist der Typ des
Transports, den die Referenz annimmt; siehe
[Senden über Ihren Server](reference.md#senden-über-ihren-server).

### OAuth2-Tokens

```ts
import { fetchOAuthToken } from '@dskripchenko/openapi'

const token = await fetchOAuthToken('clientCredentials', {
  tokenUrl: 'https://auth.example.com/token',
  clientId: 'my-client',
  clientSecret: 'my-secret',
  scopes: ['pets:read'],
})
token.accessToken   // string
token.tokenType     // 'Bearer', when the server says so
token.expiresIn     // seconds, when the server says so
```

`fetchOAuthToken(flow, options)` fordert ein Token mit dem Grant
`client_credentials` (RFC 6749 §4.4) oder `password` (§4.3, mit `username`
und `password` in den Optionen) an. Mit einem Client Secret authentifiziert
sich der Client per HTTP Basic; ohne eines geht `client_id` ins Formular. Die
Optionen nehmen außerdem `fetch` und `signal`. Bei einem Fehlschlag wird mit
einem Fehler abgelehnt, der `error_description` oder `error` des Servers
oder den HTTP-Status enthält.

## Codebeispiele

```ts
import { generateSnippet, SNIPPET_TARGETS } from '@dskripchenko/openapi'

generateSnippet('python-requests', request)
SNIPPET_TARGETS   // [{ id: 'curl', label: 'cURL', language: 'bash' }, …]
```

`generateSnippet(target, request)` gibt einen `HttpRequest` als ausführbaren
Code aus; ein unbekanntes Ziel wirft. Die 13 Ziele stehen unter
[Codebeispiele](snippets.md).

## Typen

Die Dokumenttypen (`OpenApiDocument`, `Operation`, `Parameter`, `Schema`,
`SecurityScheme` und die übrigen), die HTTP-Typen (`HttpRequest`,
`HttpResponse`, `FormValue`), `Position` und `PositionMap` werden als Typen
exportiert. `HTTP_METHODS` ist die Liste der acht Methoden eines Path Items.
Die Dokumenttypen sind bewusst locker gehalten: Jedes Objekt akzeptiert
`x-*`-Erweiterungen, und ein `$ref` darf stehen, wo ein Objekt erwartet wird.
