# Code samples

`generateSnippet(target, request)` prints an `HttpRequest` as code that runs
as it is: a complete script or command with its imports, the URL with the
query string, the headers and the body. The reference shows the same samples
next to every operation, built from what is typed into try-it.

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

## Targets

`SNIPPET_TARGETS` lists them in this order, each with an `id`, a `label` and
the `language` id for syntax highlighting.

| `id` | Label | Language | What it needs |
|---|---|---|---|
| `curl` | cURL | `bash` | curl in a POSIX shell |
| `javascript-fetch` | JavaScript (fetch) | `javascript` | a browser or Node 18+; an ES module (top-level `await`) |
| `node-axios` | Node.js (axios) | `javascript` | Node 20+ with the `axios` package; an ES module |
| `php-guzzle` | PHP (Guzzle) | `php` | PHP 7.3+ with `guzzlehttp/guzzle` installed by Composer |
| `php-laravel` | PHP (Laravel Http) | `php` | a Laravel application (the `Http` facade); PHP 7.3+ |
| `python-requests` | Python (requests) | `python` | Python 3 with the `requests` package |
| `go-native` | Go (net/http) | `go` | Go, standard library only |
| `java-httpclient` | Java (HttpClient) | `java` | Java 15+ (`java.net.http`) |
| `csharp-httpclient` | C# (HttpClient) | `csharp` | C# 11+ (.NET 7+), top-level statements |
| `kotlin-okhttp` | Kotlin (OkHttp) | `kotlin` | Kotlin with OkHttp 4 |
| `swift-urlsession` | Swift (URLSession) | `swift` | Swift with Foundation |
| `http-raw` | HTTP | `http` | — the request as it goes over the wire |
| `powershell` | PowerShell | `powershell` | PowerShell 7+ (`Invoke-RestMethod`) |

The version requirements come from the language features used for bodies
that span several lines: Java text blocks (15), C# raw string literals (11),
PHP flexible nowdoc (7.3). PowerShell 7 is needed for `-Form`, which the
multipart samples use. Kotlin uses a `trimIndent()`
raw string, Swift a multi-line literal, Go a raw string literal, PowerShell
a here-string. A body that cannot be written that way — it has control
characters or would end the literal early — falls back to an ordinary quoted
string, so the sample always runs.

Each language gets its strings escaped by its own rules: shell single quotes
for curl, PowerShell's doubled quotes, octal escapes in Java, `$` inside
Kotlin raw strings, and so on. A JSON body becomes a native literal where
the client takes one (a PHP array for Guzzle and Laravel, a dict for Python,
an object literal for fetch and axios); otherwise it stays as text. A body
with integers too large for a double is always kept as text, so no digits are
lost.

## Bodies

- **JSON, XML, text** — the body as text, or as a native literal (see above).
- **`application/x-www-form-urlencoded`** — the client's form type
  (`--data-urlencode` for curl, `URLSearchParams`, Guzzle's `form_params`,
`data=` for requests …), field by field.
- **`multipart/form-data`** — the client's multipart builder: `-F` for curl,
  `FormData`, Guzzle's `multipart`, Laravel's `attach`, `files=` for
  requests, `mime/multipart` in Go, `MultipartFormDataContent` in C#,
  `MultipartBody` in OkHttp, `-Form` in PowerShell. Java and Swift, which
  have no multipart builder, assemble the body with a boundary by hand.
- **A binary body** (`body.file`: an image, `application/octet-stream`, …) —
  the file itself, with its `Content-Type`: `--data-binary '@rex.png'` for
  curl, `-InFile` for PowerShell, `fopen` as Guzzle's `body`, Laravel's
  `withBody(file_get_contents(…))`, `data=open(…, 'rb')` for requests,
  `readFile` for axios, `os.Open` in Go, `BodyPublishers.ofFile` in Java,
  `ByteArrayContent` in C#, `asRequestBody` in OkHttp, `Data(contentsOf:)` in
  Swift, and the file input's file for fetch.

## Files

A file — a field of a multipart body or a binary body, `{ filename,
contentType? }` in the request — is referred to by its name, as a path next
to the script. For multipart fields:

- curl: `-F 'photo=@rex.png;type=image/png'`;
- PHP: `fopen('rex.png', 'r')`; Python: `open('rex.png', 'rb')`;
- Node (axios): `await openAsBlob('rex.png', { type: 'image/png' })` from
  `node:fs`;
- Go, Java, C#, Kotlin, Swift: the file is read from `rex.png`;
- PowerShell: `Get-Item -LiteralPath 'rex.png'`;
- JavaScript (fetch), meant for a page, takes the file from
  `document.querySelector('input[type="file"]')`;
- HTTP shows `<contents of rex.png>` in place of the bytes.

The file's `contentType` is passed on where the client allows it.

## Headers

Headers are printed as they are in the request, with a few exceptions the
clients impose. A multipart `Content-Type` is left to the client, which adds
the boundary. Java's `HttpClient` refuses to set `Connection`,
`Content-Length`, `Expect`, `Host` and `Upgrade`, so the Java sample leaves
them out. Where a client sets `Content-Type` itself from the body (axios
with an object, for example), the header is not repeated.

The raw HTTP sample splits an absolute URL into the request line and a
`Host` header; with a relative URL there is no `Host`.
