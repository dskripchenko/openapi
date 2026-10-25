# Deep Links und vorausgefüllte Links

Die Referenz liest zwei Arten von Adressen: Links auf einen Abschnitt und
Links, die eine Operation mit bereits ausgefülltem Try-it-Formular öffnen.

## Abschnittsanker

Die eigenen Anker der Referenz sind die Element-ids ihrer Abschnitte:

| Anker | Öffnet |
|---|---|
| `#operation/{id}` | eine Operation — `{id}` ist die `operationId` oder ein Slug wie `get-pets-id` |
| `#schema/{name}` | ein Schema aus `components.schemas` |
| `#tag/{name}` | den Abschnitt eines Tags |

Mit [mehreren Spezifikationen](reference.md#mehrere-spezifikationen) auf der
Seite beginnt jeder Anker mit der id der Spezifikation — `#v1/operation/getPet` —,
und `#v1` allein öffnet diese Spezifikation.

Die Adresse wird gelesen, wenn sich die Seite öffnet, und jedes Mal, wenn
sich der Hash danach ändert. Mit `hashNavigation` (der Standard) schreibt ein
Klick in der Navigation den Anker des Abschnitts in die Adresse, und jeder
Kopf einer Operation hat eine Schaltfläche, die den Link darauf kopiert.

## Links von Scalar

Auch für eine Scalar-Seite gebaute Links werden verstanden, sodass
bestehende Links — aus `DocLink` von laravel-api, aus seinem IDE-Plugin, aus
Lesezeichen — nach einem Wechsel weiter funktionieren:

| Scalar-Form | Öffnet |
|---|---|
| `#[{doc}/]tag/{tagSlug}/{METHOD}{path}` | die Operation mit dieser Methode und diesem Pfad |
| `#[{doc}/]tag/{tagSlug}` | den Abschnitt des Tags |
| `#[{doc}/]model/{name}` | das Schema |

Zum Beispiel öffnet `#v1/tag/pets/GET/pets/{id}` `GET /pets/{id}` der
Spezifikation `v1`.

Wie die Teile zugeordnet werden:

- **Das Dokumentsegment** nennt die Spezifikation, deren id ihm gleicht,
  sonst die Spezifikation, deren id oder Name, nach der Slug-Regel von Scalar
  umgewandelt, ihm gleicht (bei Versionen werden Punkte und Schrägstriche zu
  Bindestrichen, sodass eine Spezifikation namens `v1.1` auf `v1-1` hört).
  Ein Segment, das keine Spezifikation nennt, aber vor einem Abschnitt steht —
  `v1/tag/…` auf einer Seite mit einer Spezifikation —, wird ignoriert, und
  gemeint ist die geöffnete Spezifikation.
- **Tag- und Schemanamen** werden über den Slug verglichen: `Pet Store` passt
  zu `pet-store`.
- **Der Pfad** passt zum Pfad der Operation oder zu diesem Pfad mit dem
  Base-Path eines Servers davor (oder umgekehrt), sodass ein aus der
  vollständigen URI `/api/v2/pets` gebauter Link `/pets` in einer
  Spezifikation findet, deren Server `…/api/v2` ist. Wird die Operation nicht
  gefunden, öffnet der Link ihren Tag.

Mit `hashNavigation` wird die Adresse danach durch den kanonischen Anker
ersetzt, sodass Neuladen oder Kopieren die eigene Form der Referenz ergibt.

`scalarSlug(text)` und `scalarDocumentSlug(version)` — die Slug-Regeln —
werden aus `@dskripchenko/openapi` exportiert, um solche Links anderswo zu
bauen.

## Vorausgefüllte Links

Ein vorausgefüllter Link öffnet eine Operation mit ausgefülltem
Try-it-Formular: Parameter, Body, Server, optional Anmeldedaten. **Nichts
wird von selbst gesendet**: Der Leser sieht neben dem ausgefüllten Formular,
zu dem die Seite scrollt, einen Hinweis — „Form filled from a link — check the
values before sending“ — und drückt „Send“, wenn er bereit ist.

### Copy link

Das Try-it-Panel jeder Operation hat eine Schaltfläche „Copy link“: Sie
kopiert einen vorausgefüllten Link mit dem Formular im aktuellen Zustand,
einschließlich seiner eigenen Query-, Header- und Cookie-Zeilen.
Anmeldedaten bleiben draußen, außer „Include credentials“ ist angehakt —
standardmäßig aus, mit der Warnung, dass jeder, der den Link bekommt, sie
verwenden kann.

Damit Links kurz bleiben, lässt der Encoder weg, was die Seite selbst
ausfüllen würde: leere Werte, den ersten Server (Index 0) und
Servervariablen mit ihren Standardwerten, den ersten Media Type und einen
Body, der dem erzeugten Beispiel gleicht. Dateien reisen nie in einem Link.

Ist das Formular ausgefüllt, wird die Adresse (mit `hashNavigation`) durch
den einfachen Anker der Operation ersetzt, sodass ein Neuladen es nicht
erneut ausfüllt und Anmeldedaten die Adressleiste verlassen.

### Das Format

Das Format ist stabil, Version 1. Andere Werkzeuge können solche Links bauen —
laravel-api tut es, in PHP.

```text
{page}#{anchor}?f={payload}        the payload in the hash
{page}?oa-f={payload}#{anchor}     or as a query parameter (the hash wins)
```

`{anchor}` ist ein Operationsanker, kanonisch (`[{spec}/]operation/{id}`)
oder eine Scalar-Form (`{doc}/tag/{tag}/{METHOD}{path}`). `{payload}` ist ein
Zeichen plus base64url (RFC 4648 §5, ohne Padding):

- `z` + base64url des UTF-8-JSON, komprimiert mit rohem DEFLATE (RFC 1951) —
  `CompressionStream('deflate-raw')` im Browser, `gzdeflate()` in PHP;
- `j` + base64url des UTF-8-JSON selbst.

Das JSON:

```json
{
  "v": 1,
  "server": 0,
  "vars": { "region": "us" },
  "path": { "id": "42" },
  "query": { "limit": "10" },
  "header": { "X-Trace": "abc" },
  "cookie": { "session": "…" },
  "mediaType": "application/json",
  "body": "{\"name\":\"Rex\"}",
  "auth": { "bearerAuth": "token", "basicAuth": { "username": "u", "password": "p" } },
  "xQuery": [["debug", "1"]],
  "xHeader": [["X-Request-Id", "42"]],
  "xCookie": [["theme", "dark"]]
}
```

| Schlüssel | |
|---|---|
| `v` | Die Version: `1`. Pflicht. |
| `server` | Ein Index in die Server der Operation oder eine Server-URL. Eine URL, die zu einem der Server passt (wie geschrieben oder mit eingesetzten `vars`), wählt ihn; jede andere URL wird zu einem eigenen Server. |
| `vars` | Servervariablen. |
| `path`, `query`, `header`, `cookie` | Parameterwerte wie eingegeben, als Strings, nach Parametername (Headernamen in beliebiger Schreibweise). |
| `mediaType` | Der Media Type des Bodys, wenn die Operation ihn annimmt. |
| `body` | Der Text des Bodys wie eingegeben. |
| `auth` | Anmeldedaten nach Name des Security-Schemas: ein Schlüssel oder Token oder `{ username, password }`. |
| `xQuery`, `xHeader`, `xCookie` | Query-Parameter, Header und Cookies, die die Spezifikation nicht deklariert — die eigenen Zeilen des Try-it-Formulars — als `[name, value]`-Paare, in Reihenfolge. |

Jeder Schlüssel außer `v` ist optional, und unbekannte Schlüssel werden
ignoriert. Zahlen und Wahrheitswerte unter den Werten werden als ihr Text
gelesen; andere Werte werden verworfen. Eine Payload, die fehlerhaft ist, auf
mehr als 1 MB anwächst oder ein anderes `v` als 1 hat, wird ignoriert (eine
spätere Version mit einer Warnung in der Konsole), und der Link öffnet
einfach die Operation. Die `x*`-Schlüssel kamen zu Version 1 hinzu, ohne sie
zu ändern: Ein Leser, der sie nicht kennt, ignoriert sie, und Links ohne sie
werden gelesen wie bisher.

In PHP:

```php
$data = [
    'v' => 1,
    'path' => ['id' => '42'],
    'body' => '{"name":"Rex"}',
    'xHeader' => [['X-Request-Id', '42']],
];
$payload = 'z' . rtrim(strtr(base64_encode(gzdeflate(json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))), '+/', '-_'), '=');
$link = "https://example.com/docs#v1/operation/updatePet?f={$payload}";
```

`path`, `query`, `header`, `cookie`, `vars` und `auth` sind assoziative
Arrays (JSON-Objekte); `xQuery`, `xHeader` und `xCookie` sind Listen aus
zweielementigen Listen (JSON-Arrays) — ein assoziatives Array würde dort als
Objekt kodiert und ignoriert.

In TypeScript, mit dem Kern:

```ts
import { encodePrefill, prefillHash } from '@dskripchenko/openapi'

const payload = await encodePrefill({ v: 1, path: { id: '42' } })
const link = `https://example.com/docs#${prefillHash('v1/operation/updatePet', payload)}`
```

`encodePrefill(data, { compress? })` erzeugt eine `z`-Payload, wo es
`CompressionStream` gibt, und sonst eine `j`-Payload;
`decodePrefill(payload)` liefert die Daten oder `null`;
`prefillHash(anchor, payload)` ergibt `{anchor}?f={payload}`.
`PREFILL_VERSION` ist `1`; die Typen heißen `PrefillData` und
`PrefillValues`.

## Die Kernfunktionen

Alle aus `@dskripchenko/openapi` exportiert:

| | |
|---|---|
| `splitLink(hash)` | `{ anchor, payload? }`: der Anker (dekodiert) und die `?f=`-Payload eines Hashs. |
| `pickSpec(anchor, specs)` | `{ spec?, rest }`: welche Spezifikation aus `LinkSpec[]` (`{ id, name? }`) das Dokumentsegment nennt, und der Rest des Ankers. |
| `resolveSection(rest, spec)` | Der kanonische Abschnitt einer geladenen Spezifikation — `operation/{id}`, `schema/{name}` oder `tag/{name}` — für unsere oder Scalars Form, oder `null`. |
| `scalarSlug(text)`, `scalarDocumentSlug(version)` | Die Slug-Regeln von Scalar. |
| `encodePrefill`, `decodePrefill`, `prefillHash`, `PREFILL_VERSION` | Vorausgefüllte Links, siehe oben. |
