# Примеры кода

`generateSnippet(target, request)` печатает `HttpRequest` как код, который
запускается как есть: полный скрипт или команда с импортами, URL со строкой
запроса, заголовки и тело. Справочник показывает те же примеры рядом с
каждой операцией, собранные из того, что введено в try-it.

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

## Цели

`SNIPPET_TARGETS` перечисляет их в этом порядке, у каждой — `id`, `label` и
идентификатор языка `language` для подсветки синтаксиса.

| `id` | Название | Язык | Что нужно |
|---|---|---|---|
| `curl` | cURL | `bash` | curl в POSIX-оболочке |
| `javascript-fetch` | JavaScript (fetch) | `javascript` | браузер или Node 18+; ES-модуль (`await` верхнего уровня) |
| `node-axios` | Node.js (axios) | `javascript` | Node 20+ с пакетом `axios`; ES-модуль |
| `php-guzzle` | PHP (Guzzle) | `php` | PHP 7.3+ с `guzzlehttp/guzzle`, установленным через Composer |
| `php-laravel` | PHP (Laravel Http) | `php` | приложение Laravel (фасад `Http`); PHP 7.3+ |
| `python-requests` | Python (requests) | `python` | Python 3 с пакетом `requests` |
| `go-native` | Go (net/http) | `go` | Go, только стандартная библиотека |
| `java-httpclient` | Java (HttpClient) | `java` | Java 15+ (`java.net.http`) |
| `csharp-httpclient` | C# (HttpClient) | `csharp` | C# 11+ (.NET 7+), инструкции верхнего уровня |
| `kotlin-okhttp` | Kotlin (OkHttp) | `kotlin` | Kotlin с OkHttp 4 |
| `swift-urlsession` | Swift (URLSession) | `swift` | Swift с Foundation |
| `http-raw` | HTTP | `http` | — запрос в том виде, в каком он идёт по сети |
| `powershell` | PowerShell | `powershell` | PowerShell 7+ (`Invoke-RestMethod`) |

Требования к версиям вытекают из возможностей языков, используемых для
многострочных тел: текстовые блоки Java (15), raw string literals C# (11),
гибкий nowdoc PHP (7.3). PowerShell 7 нужен для `-Form`, который используют
примеры multipart. Kotlin использует raw-строку с `trimIndent()`, Swift —
многострочный литерал, Go — raw string literal, PowerShell — here-string.
Тело, которое так записать нельзя — в нём есть управляющие символы или оно
закончило бы литерал раньше времени, — записывается обычной строкой в
кавычках, так что пример всегда запускается.

Строки в каждом языке экранируются по его правилам: одинарные кавычки
оболочки для curl, удвоенные кавычки PowerShell, восьмеричные
escape-последовательности в Java, `$` внутри raw-строк Kotlin и так далее.
Тело JSON становится литералом языка там, где клиент его принимает (массив
PHP для Guzzle и Laravel, dict для Python, объектный литерал для fetch и
axios); иначе остаётся текстом. Тело с целыми, слишком большими для double,
всегда остаётся текстом, чтобы ни одна цифра не потерялась.

## Тела

- **JSON, XML, текст** — тело как текст или как литерал языка (см. выше).
- **`application/x-www-form-urlencoded`** — тип формы клиента
  (`--data-urlencode` для curl, `URLSearchParams`, `form_params` Guzzle,
  `data=` для requests …), поле за полем.
- **`multipart/form-data`** — построитель multipart клиента: `-F` для curl,
  `FormData`, `multipart` Guzzle, `attach` Laravel, `files=` для requests,
  `mime/multipart` в Go, `MultipartFormDataContent` в C#, `MultipartBody` в
  OkHttp, `-Form` в PowerShell. Java и Swift, где построителя multipart нет,
  собирают тело с boundary вручную.

## Файлы

Файловое поле тела multipart — `{ filename, contentType? }` в запросе —
ссылается на файл по имени, как на путь рядом со скриптом:

- curl: `-F 'photo=@rex.png;type=image/png'`;
- PHP: `fopen('rex.png', 'r')`; Python: `open('rex.png', 'rb')`;
- Node (axios): `await openAsBlob('rex.png', { type: 'image/png' })` из
  `node:fs`;
- Go, Java, C#, Kotlin, Swift: файл читается из `rex.png`;
- PowerShell: `Get-Item -LiteralPath 'rex.png'`;
- JavaScript (fetch), рассчитанный на страницу, берёт файл из
  `document.querySelector('input[type="file"]')`;
- HTTP показывает `<contents of rex.png>` вместо байтов.

`contentType` файла передаётся там, где клиент это позволяет.

## Заголовки

Заголовки печатаются такими, как в запросе, с несколькими исключениями,
которых требуют клиенты. `Content-Type` для multipart оставлен клиенту,
который добавляет boundary. `HttpClient` в Java отказывается ставить
`Connection`, `Content-Length`, `Expect`, `Host` и `Upgrade`, поэтому пример
на Java их пропускает. Там, где клиент сам ставит `Content-Type` по телу
(например, axios с объектом), заголовок не повторяется.

Пример сырого HTTP разбивает абсолютный URL на строку запроса и заголовок
`Host`; при относительном URL заголовка `Host` нет.
