# Codebeispiele

`generateSnippet(target, request)` gibt einen `HttpRequest` als Code aus, der
so, wie er ist, läuft: ein vollständiges Skript oder Kommando mit seinen
Imports, der URL mit Query-String, den Headern und dem Body. Die Referenz
zeigt dieselben Beispiele neben jeder Operation, gebaut aus dem, was in
Try-it eingegeben ist.

```ts
import { generateSnippet } from '@dskripchenko/openapi'

generateSnippet('curl', {
  method: 'GET',
  url: 'https://api.example.com/v1/pets/42',
  headers: [['Authorization', 'Bearer TOKEN']],
})
// curl 'https://api.example.com/v1/pets/42' \
//   -H 'Authorization: Bearer TOKEN'
```

## Ziele

`SNIPPET_TARGETS` listet sie in dieser Reihenfolge auf, jedes mit einer `id`,
einem `label` und der `language`-id für die Syntaxhervorhebung.

| `id` | Label | Sprache | Was es braucht |
|---|---|---|---|
| `curl` | cURL | `bash` | curl in einer POSIX-Shell |
| `javascript-fetch` | JavaScript (fetch) | `javascript` | einen Browser oder Node 18+; ein ES-Modul (Top-Level-`await`) |
| `node-axios` | Node.js (axios) | `javascript` | Node 20+ mit dem Paket `axios`; ein ES-Modul |
| `php-guzzle` | PHP (Guzzle) | `php` | PHP 7.3+ mit per Composer installiertem `guzzlehttp/guzzle` |
| `php-laravel` | PHP (Laravel Http) | `php` | eine Laravel-Anwendung (die Facade `Http`); PHP 7.3+ |
| `python-requests` | Python (requests) | `python` | Python 3 mit dem Paket `requests` |
| `go-native` | Go (net/http) | `go` | Go, nur Standardbibliothek |
| `java-httpclient` | Java (HttpClient) | `java` | Java 15+ (`java.net.http`) |
| `csharp-httpclient` | C# (HttpClient) | `csharp` | C# 11+ (.NET 7+), Top-Level-Anweisungen |
| `kotlin-okhttp` | Kotlin (OkHttp) | `kotlin` | Kotlin mit OkHttp 4 |
| `swift-urlsession` | Swift (URLSession) | `swift` | Swift mit Foundation |
| `http-raw` | HTTP | `http` | — die Anfrage, wie sie über die Leitung geht |
| `powershell` | PowerShell | `powershell` | PowerShell 7+ (`Invoke-RestMethod`) |

Die Versionsanforderungen stammen von den Sprachfeatures, die für mehrzeilige
Bodys verwendet werden: Java-Textblöcke (15), Raw-String-Literale in C# (11),
flexibles Nowdoc in PHP (7.3). PowerShell 7 wird für `-Form` gebraucht, das
die Multipart-Beispiele verwenden. Kotlin verwendet einen Raw-String mit
`trimIndent()`, Swift ein mehrzeiliges Literal, Go ein Raw-String-Literal,
PowerShell einen Here-String. Ein Body, der sich so nicht schreiben lässt —
er enthält Steuerzeichen oder würde das Literal vorzeitig beenden —, fällt
auf einen gewöhnlichen gequoteten String zurück; das Beispiel läuft also
immer.

Jede Sprache bekommt ihre Strings nach ihren eigenen Regeln escapet:
Shell-Single-Quotes für curl, verdoppelte Anführungszeichen in PowerShell,
oktale Escapes in Java, `$` in Kotlin-Raw-Strings und so weiter. Ein
JSON-Body wird zu einem nativen Literal, wo der Client eines annimmt (ein
PHP-Array für Guzzle und Laravel, ein Dict für Python, ein Objektliteral für
fetch und axios); sonst bleibt er Text. Ein Body mit Ganzzahlen, die für
einen Double zu groß sind, bleibt immer Text, damit keine Ziffern verloren
gehen.

## Bodys

- **JSON, XML, Text** — der Body als Text oder als natives Literal (siehe
  oben).
- **`application/x-www-form-urlencoded`** — der Formulartyp des Clients
  (`--data-urlencode` für curl, `URLSearchParams`, `form_params` von Guzzle,
  `data=` für requests …), Feld für Feld.
- **`multipart/form-data`** — der Multipart-Builder des Clients: `-F` für
  curl, `FormData`, `multipart` von Guzzle, `attach` von Laravel, `files=`
  für requests, `mime/multipart` in Go, `MultipartFormDataContent` in C#,
  `MultipartBody` in OkHttp, `-Form` in PowerShell. Java und Swift, die keinen
  Multipart-Builder haben, setzen den Body mit einer Boundary von Hand
  zusammen.

## Dateien

Ein Dateifeld eines Multipart-Bodys — `{ filename, contentType? }` in der
Anfrage — verweist auf die Datei über ihren Namen, als Pfad neben dem
Skript:

- curl: `-F 'photo=@rex.png;type=image/png'`;
- PHP: `fopen('rex.png', 'r')`; Python: `open('rex.png', 'rb')`;
- Node (axios): `await openAsBlob('rex.png', { type: 'image/png' })` aus
  `node:fs`;
- Go, Java, C#, Kotlin, Swift: Die Datei wird aus `rex.png` gelesen;
- PowerShell: `Get-Item -LiteralPath 'rex.png'`;
- JavaScript (fetch), gedacht für eine Seite, nimmt die Datei aus
  `document.querySelector('input[type="file"]')`;
- HTTP zeigt `<contents of rex.png>` anstelle der Bytes.

Der `contentType` der Datei wird weitergegeben, wo der Client es zulässt.

## Header

Header werden so ausgegeben, wie sie in der Anfrage stehen, mit einigen
Ausnahmen, die die Clients vorgeben. Einen Multipart-`Content-Type`
überlässt das Beispiel dem Client, der die Boundary ergänzt. Der
`HttpClient` von Java weigert sich, `Connection`, `Content-Length`,
`Expect`, `Host` und `Upgrade` zu setzen; das Java-Beispiel lässt sie daher
weg. Wo ein Client `Content-Type` selbst aus dem Body setzt (axios mit einem
Objekt zum Beispiel), wird der Header nicht wiederholt.

Das rohe HTTP-Beispiel zerlegt eine absolute URL in die Anfragezeile und
einen `Host`-Header; bei einer relativen URL gibt es kein `Host`.
