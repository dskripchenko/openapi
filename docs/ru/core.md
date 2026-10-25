# API ядра

Всё на этой странице экспортируется из `@dskripchenko/openapi`. У ядра нет
зависимостей, и оно не трогает DOM, поэтому одинаково работает в браузере,
в Node 20+ и в скрипте сборки.

## Загрузка спецификации

```ts
import { loadSpec } from '@dskripchenko/openapi'

const spec = loadSpec(text)
```

`loadSpec(input, options?)` принимает текст YAML или JSON либо уже
разобранный объект и возвращает `LoadedSpec`:

| Поле | |
|---|---|
| `source` | `{ family, version, raw, format? }` — вход как он был: `family` — `'swagger2'`, `'openapi30'` или `'openapi31'`, `version` — объявленная версия, `raw` — разобранный объект, `format` — `'yaml'` или `'json'`, если передан текст. |
| `document` | Документ, нормализованный к OpenAPI 3.1 (см. [нормализацию](#нормализация)). |
| `resolver` | Разрешает `$ref` в `document` (см. [ссылки](#ссылки)). |
| `operations` | Все операции из `paths` и `webhooks` в порядке документа (`OperationEntry[]`). |
| `groups` | Операции, сгруппированные по тегам (`OperationGroup[]`). |
| `tagGroups` | Группы тегов из `x-tagGroups`, если они есть в документе. |
| `warnings` | Заметки нормализации, например об отсутствующем `info`. |
| `positions` | Позиции в исходнике для `raw` (если передан текст). |

Единственный параметр — `external`, загрузчик внешних ссылок, описанный в
разделе [ссылки](#ссылки).

`loadSpec` бросает `YamlError` или `JsonError`, если текст не читается, и
`OpenApiError`, если значение — не документ Swagger 2.0 или OpenAPI 3.x.
Версии выше 3.1 (3.2) читаются как 3.1.

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

`loadDocument(raw, { positions?, format?, external? })` делает то же для
объекта, который вы разобрали сами, сохраняя переданные позиции.

### Операции

У `OperationEntry` есть:

| Поле | |
|---|---|
| `id` | `operationId` или слаг из метода и пути (`get-pets-id`); уникален в пределах документа. |
| `method` | `'get'`, `'post'`, … (в нижнем регистре). |
| `path` | Шаблон пути или имя вебхука. |
| `operation`, `pathItem` | Объекты из документа. |
| `tags` | Теги операции, `['default']`, если их нет. |
| `parameters` | Параметры уровня пути и уровня операции, объединённые (побеждают параметры операции) и разыменованные. |
| `deprecated` | `boolean`. |
| `webhook` | Имя вебхука — для операций из `webhooks`. |

`OperationGroup` — это `{ name, displayName, description?, tag?, operations }`.
`displayName` — это `x-displayName` тега или его имя. Сначала идут
объявленные теги в их порядке, затем теги, встреченные только у операций;
операция с несколькими тегами есть в группе каждого из них.

`listOperations(document, resolver)` и `groupByTag(document, operations)` —
эти два шага по отдельности; `groupByTag` возвращает `GroupedOperations`,
`{ groups, tagGroups? }`. `DEFAULT_TAG` равен `'default'`.

## Парсеры

```ts
import { parseSpec, parseYaml, parseJson, detectFormat } from '@dskripchenko/openapi'

const { value, positions, format } = parseSpec(text)   // format detected
const yaml = parseYaml(text)                           // { value, positions }
const json = parseJson(text)                           // { value, positions }
detectFormat('  {"openapi": "3.1.0"}')                 // 'json'
```

`detectFormat` отвечает `'json'`, если первый символ, не являющийся
пробельным, — `{` или `[`, и `'yaml'` в остальных случаях.
`parseSpec(text, format?)` использует её, если формат не назван.

Оба парсера возвращают `positions`: `Map` из JSON Pointer в место текста,
где начинается значение, `{ line, column }`, оба с 1. Член объекта
указывает на свой ключ, элемент массива — на сам элемент, корень (`''`) — на
1:1.

```ts
const { positions } = parseYaml(text)
positions.get('/paths/~1pets~1{id}/get')   // { line: 9, column: 5 }
```

**YAML.** Парсер покрывает то, что встречается в спецификациях: блочные
маппинги и последовательности, flow-коллекции `{}` и `[]`, plain-скаляры,
скаляры в одинарных и двойных кавычках с escape-последовательностями,
блочные скаляры `|` и `>` с индикаторами chomping (`-`, `+`) и отступа,
комментарии, `---` и `...`, якоря `&a`, алиасы `*a` и merge-ключ `<<`.
Скаляры следуют core schema: `null`, `true`/`false`, десятичные,
шестнадцатеричные (`0x`) и восьмеричные (`0o`) целые, дробные, `.inf` и
`.nan`. Теги игнорируются, кроме `!!str`, который оставляет скаляр строкой.
Один документ на текст. Синтаксическая ошибка бросает `YamlError`.

**JSON.** Строгий RFC 8259. UTF-8 BOM допускается. В отличие от
`JSON.parse`, повторяющийся ключ — ошибка: в спецификации это всегда
опечатка. Синтаксическая ошибка бросает `JsonError`.

### Запись

```ts
import { stringifySpec, stringifyYaml, stringifyJson } from '@dskripchenko/openapi'

stringifySpec(value, 'yaml')                 // YAML, 2-space indent
stringifySpec(value, 'json')                 // JSON, 2-space indent
stringifyYaml(value, { indent: 4, lineWidth: 0 })
stringifyJson(value, 2)
```

`stringifyYaml` детерминирован: порядок ключей сохраняется, скаляр
берётся в кавычки, только если без них прочитался бы иначе, а многострочные
строки пишутся блоками `|`. `indent` — от 1 до 8 пробелов (по умолчанию 2);
однострочные строки длиннее `lineWidth` (по умолчанию 80) переносятся по
пробелам блоками `>-`, а `lineWidth: 0` отключает перенос. Комментарии
разобранного текста не сохраняются: парсер их не запоминает.

## Нормализация

```ts
import { normalize, detectVersion } from '@dskripchenko/openapi'

detectVersion(raw)                    // { family: 'swagger2', version: '2.0' }
const { document, warnings } = normalize(raw)
document.openapi                      // '3.1.0'
```

`normalize` приводит любой поддерживаемый документ к форме OpenAPI 3.1.
Вход он не меняет; результат не делит с ним ничего.

Из **Swagger 2.0**:

- `host`, `basePath` и `schemes` становятся `servers`;
- параметр `body` и `consumes` / `produces` становятся `requestBody` и
  `content` ответов;
- параметры `formData` становятся телом `application/x-www-form-urlencoded`
  или `multipart/form-data`;
- `definitions` становятся `components.schemas`, `securityDefinitions` —
  `components.securitySchemes`, и каждый `$ref` переписывается под них.

Из **OpenAPI 3.0**:

- `nullable: true` становится типом с `'null'` (`type: [string, 'null']`);
- логические `exclusiveMinimum` / `exclusiveMaximum` становятся числовой
  формой;
- `example` схемы тоже сохраняется.

`upgradeSchema30(schema)` применяет правила схем 3.0 → 3.1 к одной схеме и
возвращает результат копией; входной объект остаётся как был.

## Ссылки

```ts
import { createResolver } from '@dskripchenko/openapi'

const resolver = createResolver(document, { external })

resolver.get('#/components/schemas/Pet')          // one step
resolver.deref({ $ref: '#/components/schemas/Pet' }) // the whole chain
resolver.isCircular('#/components/schemas/Node')  // true for a self-referencing schema
```

- `get(ref)` возвращает то, на что указывает ссылка, или `undefined`.
- `deref(value)` проходит цепочку ссылок до конкретного значения, а
  значение, не являющееся ссылкой, возвращает без изменений; оборванная или
  циклическая цепочка даёт `undefined`.
- `isCircular(ref)` говорит, ведёт ли структура за `ref` обратно к ней.

`loadSpec` создаёт резолвер сам — это `spec.resolver`.

**Внешние ссылки** (`common.yaml#/Pet`) разрешаются только через параметр
`external`: синхронную функцию, которая получает URL-часть ссылки как она
написана и возвращает разобранный документ или `undefined`. Её результат
кэшируется по URL; исключение считается `undefined`. Без `external` ничего
вне документа не загружается:

```ts
const common = parseSpec(commonText).value
const spec = loadSpec(text, { external: (url) => (url === 'common.yaml' ? common : undefined) })
```

## Валидация

```ts
import { parseSpec, validateDocument } from '@dskripchenko/openapi'

const { value, positions } = parseSpec(text)
const issues = validateDocument(value, { positions })
// [{ pointer: '/paths/~1a~1{id}/get', message: 'Path parameter "id" of "/a/{id}" is not defined',
//    severity: 'error', line: 6, column: 5 }]
```

`validateDocument(raw, { positions? })` проверяет сырой документ — 2.0, 3.0
или 3.1, до нормализации — и возвращает `DocumentIssue[]`:
`{ pointer, message, severity: 'error' | 'warning', line?, column? }`. С
`positions` из парсера у каждой проблемы есть строка. Функция никогда не
бросает исключений; объект, который не является спецификацией, даёт одну
ошибку.

Проверяется структура, на которую опирается отрисовка, а не каждое правило
спецификации: обязательные поля (`info.title`, `info.version`, `paths`,
`responses`, `description` ответа, `name` и `in` параметра), пути,
начинающиеся с `/`, параметры пути — объявленные и обязательные,
повторяющиеся параметры и `operationId`, коды статуса, переменные серверов,
поля, нужные каждому типу схемы авторизации, использованные, но не
объявленные теги, неразрешимые ссылки и неизвестные поля верхнего уровня.

## Схемы

Функции схем принимают функцию `resolve`, `(ref: string) => Schema |
undefined`, чтобы следовать `$ref`. С загруженной спецификацией:

```ts
import { loadSpec, sampleSchema, sampleXml, validateValue, describeSchema, type Schema } from '@dskripchenko/openapi'

const spec = loadSpec(text)
const resolve = (ref: string) => spec.resolver.get(ref) as Schema | undefined
const pet: Schema = { $ref: '#/components/schemas/Pet' }
```

### Примеры значений

```ts
sampleSchema(pet, { resolve, mode: 'response' })  // { id: 0, name: 'Rex', tag: 'string' }
sampleSchema(pet, { resolve, mode: 'request' })   // { name: 'Rex', tag: 'string' } — readOnly id left out
sampleXml(pet, { resolve })                       // '<?xml version="1.0" encoding="UTF-8"?>\n<Pet>…</Pet>'
```

`sampleSchema(schema, options?)` строит значение-пример. Берётся по
порядку `example`, первый из `examples`, `default`, `const`, первое значение
`enum`, а иначе значение генерируется по типу. Строки с известным `format`
получают фиксированное значение (`FORMAT_SAMPLES`: `date-time`, `date`,
`time`, `email`, `uuid`, `uri`, `hostname`, `ipv4`, `ipv6`, `byte`,
`binary`, `password` и другие); `minLength`, `pattern`, числовые диапазоны и
`minItems` соблюдаются. `allOf` сливается, у `oneOf` и `anyOf` берётся
первая ветка.

Параметры: `mode` — `'request'` пропускает свойства `readOnly`,
`'response'` — свойства `writeOnly`; `maxDepth` — предел вложенности, более
глубокие уровни становятся `{}` или `[]` (по умолчанию 8);
`preferExamples` — использовать `example` / `examples` (по умолчанию
`true`). Схема, ссылающаяся на себя, даёт `{}` там, где замыкается цикл.
Результат детерминирован: одна и та же схема всегда даёт один и тот же
пример.

`sampleXml(schema, options?)` записывает пример как документ XML, следуя
подсказкам `xml` схемы (`name`, `attribute`, `wrapped`, пространства имён).
Корневой элемент называется по `xml.name`, по имени схемы, на которую
указывает ссылка, или `root`.

### Проверка значения

```ts
validateValue({ name: 5 }, pet, { resolve })
// [{ path: '', message: "must have required property 'id'", keyword: 'required' },
//  { path: '/name', message: 'must be string', keyword: 'type' }]
```

`validateValue(value, schema, { resolve?, mode? })` проверяет значение по
JSON Schema 2020-12 в том виде, в каком её использует OpenAPI 3.1, допуская
`nullable` из 3.0 и логические исключающие границы. Возвращает все
`ValidationIssue` — `{ path, message, keyword }`, где `path` — JSON Pointer
внутрь значения, — и пустой список, если значение корректно. С
`mode: 'request'` свойство `readOnly` — ошибка, с `'response'` — свойство
`writeOnly`.

### Описание типа

```ts
describeSchema(pet)                                       // 'Pet'
describeSchema({ type: 'array', items: pet })             // 'array<Pet>'
describeSchema({ type: ['string', 'null'], format: 'uuid' }) // 'string<uuid> | null'
```

`describeSchema(schema, { resolve? })` даёт короткую метку типа, которую
справочник показывает рядом с полем: `string<uuid>`, `array<Pet>`,
`oneOf: Cat | Dog`, `string | null` и так далее.

## Запросы

`HttpRequest` — форма, которую печатают примеры и отправляет try-it:
`{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`.

### Сборка запроса

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

`buildRequest(input)` принимает:

| Поле | |
|---|---|
| `method`, `path` | Метод и шаблон пути. |
| `server` | Базовый URL, уже разрешённый через `serverUrl`; может быть относительным. |
| `parameters` | Разыменованные параметры операции (`OperationEntry.parameters`). |
| `values` | Значения по месту и имени: `{ path?, query?, header?, cookie? }`. |
| `body` | `{ mediaType, value, encoding? }` — объект для структурированных типов содержимого, текст как набран или, для любого другого типа содержимого, файловое значение `{ filename, contentType?, data? }`, которое и есть всё тело. |
| `security` | `AppliedSecurity[]`: `{ scheme, value }` — ключ или токен, либо `{ username, password }` для basic. |

Функция следует правилам спецификации:

- параметры сериализуются по `style` и `explode` — path `simple`, `label`,
  `matrix`; query `form`, `spaceDelimited`, `pipeDelimited`, `deepObject`;
  header `simple`; cookie `form`, — а параметры с `content` записываются в
  этом типе содержимого;
- плейсхолдер пути без значения остаётся `{name}`;
- пустые необязательные значения пропускаются; пустая строка сохраняется
  только при `allowEmptyValue`;
- параметры-заголовки с именами `Accept`, `Content-Type` и `Authorization`
  игнорируются, как требует спецификация;
- куки — из параметров и ключей API — идут в один заголовок `Cookie`;
- `Content-Type` ставится по типу содержимого тела, кроме multipart, где
  HTTP-клиент добавляет его вместе с boundary;
- тело JSON сериализуется, urlencoded-тело кодируется по своему
  `encoding`, а тело multipart хранит файловые поля как
  `{ filename, contentType?, data? }` (`data` — `Blob` или строка); объекты в
  полях multipart становятся JSON, массивы повторяют поле;
- файловое значение в качестве тела другого типа содержимого (`image/png`,
  `application/octet-stream`, …) становится `body.file` —
  `{ filename, contentType?, data? }`, где `data` — `Blob`; без `data` запрос
  не несёт байтов, а примеры читают файл по имени.

### Параметры и серверы по отдельности

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

`serializeParam(param, value)` возвращает готовые к использованию значения
для path и header и уже percent-кодированные пары для query и cookie;
`undefined` означает «пропустить параметр». `serializeValue(location, name,
value, { style, explode, allowReserved, raw })` — то же без объекта
параметра, а `defaultStyle(location)` даёт стиль по умолчанию для места.
`serverUrl(server, variables?)` подставляет переменные сервера (сначала
переданные значения, затем значения по умолчанию); `joinUrl(base, path)`
ставит между ними ровно одну косую черту и оставляет относительную базу
относительной.

`applySecurity(list)` превращает `AppliedSecurity[]` в
`{ headers, query, cookies }`, а `basicAuth(username, password)` даёт
значение заголовка `Basic …`. Небольшие кодировщики, которые использует
сборщик, тоже экспортируются: `encodeComponent`, `encodeCookie`,
`base64Utf8`, `baseMediaType`, `isJsonMediaType`, `isFormUrlEncoded`,
`isMultipart` и `isTextualMediaType` — читается ли ответ такого типа как
текст (пустой тип, `text/*`, JSON, urlencoded и подтипы `xml`, `yaml`,
`javascript`, `ndjson`, `graphql`, `csv`) или сохраняется как байты.

### Отправка

```ts
import { sendRequest } from '@dskripchenko/openapi'

const response = await sendRequest(request, { credentials: 'same-origin' })
response.status     // 0 when there was no response
response.error      // the reason in that case: network, CORS
response.body       // the body of a textual response
response.blob       // the body of any other response (images, archives, …)
response.duration   // milliseconds
```

`sendRequest(request, { fetch?, signal?, credentials? })` отправляет через
`fetch` (глобальный, если не передан другой). Ответ с текстовым
`Content-Type` (`isTextualMediaType`) читается в `body`; любой другой
сохраняется в `blob`, а `body` остаётся пустым. Функция никогда не бросает
исключений: сбой до ответа возвращается как
`status: 0` с заполненным `error`. `credentials` по умолчанию
`'same-origin'`, поэтому куки никогда не уходят на чужой API. Для тела
multipart она убирает `Content-Type`, чтобы `fetch` поставил его с
boundary. В браузере заголовки, которые браузер запрещает (`Cookie`,
`Host`, `Origin`, …), отбрасывает сам браузер.

`toFetchBody(request)` даёт тело для `fetch` отдельно: `Blob` файла для
бинарного тела, `FormData` для multipart, `URLSearchParams` для
urlencoded-форм, иначе текст.

`SendFn` — `(request: HttpRequest, options?: SendFnOptions) => Promise<HttpResponse>`,
где `SendFnOptions` — это `{ signal?: AbortSignal }`, — тип транспорта,
который принимает справочник; см.
[отправку через свой сервер](reference.md#отправка-через-свой-сервер).

### Токены OAuth2

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

`fetchOAuthToken(flow, options)` запрашивает токен с грантом
`client_credentials` (RFC 6749 §4.4) или `password` (§4.3, с `username` и
`password` в параметрах). С секретом клиент аутентифицируется через HTTP
Basic; без него `client_id` уходит в форму. Параметры принимают также
`fetch` и `signal`. При неудаче промис отклоняется с ошибкой, содержащей
`error_description` или `error` сервера либо HTTP-статус.

Потоки с редиректом собираются из частей; панель авторизации справочника
использует именно их:

```ts
import {
  buildAuthorizeUrl,
  codeChallenge,
  createCodeVerifier,
  exchangeAuthorizationCode,
  parseCallbackUrl,
  randomToken,
} from '@dskripchenko/openapi'

const state = randomToken(16)
const verifier = createCodeVerifier()
const url = buildAuthorizeUrl({
  authorizationUrl: 'https://auth.example.com/authorize',
  responseType: 'code',
  clientId: 'my-client',
  redirectUri: 'https://example.com/docs',
  scopes: ['pets:read'],
  state,
  codeChallenge: await codeChallenge(verifier),
})
// … the user signs in at `url` and comes back to the redirect URI …
const callback = parseCallbackUrl(location.href)
if (callback?.code && callback.state === state) {
  const token = await exchangeAuthorizationCode({
    tokenUrl: 'https://auth.example.com/token',
    code: callback.code,
    redirectUri: 'https://example.com/docs',
    clientId: 'my-client',
    codeVerifier: verifier,
  })
}
```

| | |
|---|---|
| `randomToken(bytes = 32)` | Случайная строка, безопасная для URL (Web Crypto), для `state`. |
| `createCodeVerifier()` | Code verifier PKCE (RFC 7636 §4.1): 43 символа. |
| `codeChallenge(verifier)` | Его challenge S256: base64url от SHA-256. Асинхронная. |
| `base64Url(bytes)` | Base64url без дополнения. |
| `buildAuthorizeUrl(options)` | URL запроса авторизации: `{ authorizationUrl, responseType: 'code' \| 'token', clientId, redirectUri, scopes?, state, codeChallenge? }`. Query, уже имеющийся в URL, сохраняется. |
| `parseCallbackUrl(url)` | Ответ на redirect URL — `{ state?, code?, accessToken?, tokenType?, expiresIn?, error?, errorDescription? }` — из query и fragment (query важнее); `null`, если ответа нет. |
| `exchangeAuthorizationCode(options)` | Обменивает код на токен (RFC 6749 §4.1.3): `{ tokenUrl, code, redirectUri, clientId, clientSecret?, codeVerifier?, fetch?, signal? }`. `client_secret`, если передан, уходит в форму. |
| `fetchOpenIdConfiguration(url, { fetch?, signal? })` | Читает discovery-документ OpenID Connect: `{ authorizationEndpoint?, tokenEndpoint?, scopesSupported, responseTypesSupported, grantTypesSupported }`. |

Типы — `AuthorizeUrlOptions`, `OAuthCallback`, `CodeExchangeOptions` и
`OpenIdConfiguration`.

## Глубокие ссылки

`splitLink`, `pickSpec`, `resolveSection`, `scalarSlug`,
`scalarDocumentSlug`, `encodePrefill`, `decodePrefill`, `prefillHash` и
`PREFILL_VERSION` читают и строят глубокие ссылки справочника, ссылки Scalar
и предзаполненные ссылки try-it. Они описаны вместе с форматами в разделе
[глубокие ссылки и предзаполненные ссылки](links.md).

## Примеры кода

```ts
import { generateSnippet, SNIPPET_TARGETS } from '@dskripchenko/openapi'

generateSnippet('python-requests', request)
SNIPPET_TARGETS   // [{ id: 'curl', label: 'cURL', language: 'bash' }, …]
```

`generateSnippet(target, request)` печатает `HttpRequest` как запускаемый
код; неизвестная цель вызывает исключение. 13 целей перечислены в
[примерах кода](snippets.md).

## Типы

Типы документа (`OpenApiDocument`, `Operation`, `Parameter`, `Schema`,
`SecurityScheme` и остальные), типы HTTP (`HttpRequest`, `HttpResponse`,
`FormValue`), `Position` и `PositionMap` экспортируются как типы.
`HTTP_METHODS` — список восьми методов элемента пути. Типы документа
намеренно нестрогие: каждый объект допускает расширения `x-*`, а `$ref`
может стоять там, где ожидается объект.
