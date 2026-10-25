# @dskripchenko/openapi — дизайн

Пакет читает, показывает, проверяет и редактирует спецификации OpenAPI
(Swagger 2.0, OpenAPI 3.0 и 3.1) в YAML и JSON. Ядро написано на чистом
TypeScript без зависимостей, а Vue-компоненты строятся поверх
`@dskripchenko/ui`. Пакет заменяет Scalar/Swagger UI в `laravel-api` и даёт
laravel-admin просмотрщик и конструктор спецификаций.

## Решения автора (2026-10-25)

- Один пакет с двумя точками входа:
  - `@dskripchenko/openapi` — ядро, без Vue;
  - `@dskripchenko/openapi/vue` — компоненты, peer-зависимости `vue` и
    `@dskripchenko/ui`.
- Сниппеты на 13 целях: curl, JavaScript (fetch), PHP (Guzzle), PHP (Laravel
  Http), Python (requests), Go (net/http), Java (java.net.http), C#
  (HttpClient), Kotlin (OkHttp), Swift (URLSession), сырой HTTP, PowerShell
  (Invoke-RestMethod). Плюс Node (axios) — его почти всегда просят; итого 13.
- Try-it отправляет запросы из браузера через `fetch`. Хост может передать
  свою функцию `send`; ядро laravel-admin даёт прокси-эндпоинт под правом
  доступа и с белым списком хостов.
- YAML-парсер свой, без зависимостей.

## Карта модулей ядра

```
src/
  yaml/       parse(text) → { value, positions }, stringify(value, opts)
  json/       parse(text) → { value, positions }, stringify
  model/      load(text|object) → OpenApiDocument (нормализованный 3.1)
              detect version, swagger2 → 3.0, 3.0 → 3.1 (nullable, example)
              $ref: resolve(pointer), deref with cycle markers, external refs
              через хост-лоадер; listOperations(), tags, webhooks
  validate/   структурная проверка документа: [{ pointer, message, line }]
  schema/     sample(schema, opts) — пример из схемы
              validate(value, schema) — JSON Schema 2020-12 / OAS 3.0 subset
              describe(schema) — короткое описание типа для UI
  request/    build(operation, values, security, server) → HttpRequest
              сериализация параметров по style/explode, тела по media type
              (формы, multipart с файлами, бинарное тело body.file)
              send: fetch, текстовые ответы → body, прочие → blob; signal
              oauth: токен (client credentials, password), PKCE, authorize URL,
              разбор колбэка, обмен кода, OIDC discovery
  snippets/   generate(target, HttpRequest) → string; targets[]
  links/      якоря: свои и Scalar (pickSpec, resolveSection, scalarSlug),
              предзаполненные ссылки, формат v1 (encode/decodePrefill)
  standalone/ отдельная сборка: createApiReference, sources в форме Scalar,
              proxySend — транспорт через прокси хоста
  index.ts    публичное API
```

Отдельная сборка `dist/standalone.js` — IIFE с глобальным `DskOpenApi`:
внутри Vue, кит и все стили (CSS вставляется скриптом, тот же CSS лежит в
`dist/standalone.css`). Это `OpenApiPage`, упакованный для страницы без
сборки; поля опций повторяют `Scalar.createApiReference`, чтобы Blade-вью
`laravel-api` переключалась сменой скрипта и глобала.

`HttpRequest` — общая промежуточная форма для сниппетов и try-it:

```ts
interface HttpRequest {
  method: string            // GET, POST, …
  url: string               // полный URL с query
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string
    form?: [string, FormValue][]
    file?: { filename: string; contentType?: string; data?: Blob } // бинарное тело
  }
}
```

`HttpResponse` несёт `body` (текст) для текстовых типов (`isTextualMediaType`)
и `blob` для остальных — на этом стоят превью картинок и скачивание в try-it.

## Позиции в исходнике

Парсеры YAML и JSON возвращают `positions: Map<string, Position>`, где ключ —
JSON Pointer (`/paths/~1pets/get`), а `Position` — `{ line, column }` начала
значения (с 1). Позиции нужны валидатору для ошибок со строкой и редактору для
перехода к месту в исходнике.

## YAML

Поддерживаем то, что встречается в спецификациях:

- блочные маппинги и последовательности, вложенность по отступам;
- flow-коллекции `{}` и `[]`;
- скаляры: plain, `'single'`, `"double"` с escape-последовательностями;
- блочные скаляры `|` и `>` с индикаторами `-`, `+` и явным отступом;
- комментарии, документ-маркер `---`, `...`;
- якоря `&a`, алиасы `*a`, merge-ключ `<<`;
- core schema: null, true/false, int (dec, hex `0x`, oct `0o`), float, `.inf`,
  `.nan`;
- теги `!!str` и прочие: тег игнорируется, кроме `!!str`.

Ошибки бросают `YamlError(message, line, column)`.

`stringify` пишет детерминированно: порядок ключей сохраняется, строки в
кавычках только когда без них значение прочиталось бы иначе, а многострочные
строки идут блоком `|`.

## Нормализация

Внутри всё приводится к OpenAPI 3.1:

- **2.0:**
  - `host`/`basePath`/`schemes` → `servers`;
  - `consumes`/`produces` и body-параметр → `requestBody`;
  - `formData` → `application/x-www-form-urlencoded` или `multipart/form-data`;
  - `definitions` → `components.schemas`;
  - `securityDefinitions` → `components.securitySchemes`;
  - `$ref` переписываются.
- **3.0:**
  - `nullable: true` → тип с `null`;
  - `example` у схемы остаётся (`examples` для 3.1 тоже понимаем);
  - `exclusiveMinimum: true` → числовая форма.

Исходный документ не теряется: модель хранит `source` (`version`, `format`,
сырой объект) — редактор правит исходник, а не нормализованную копию.

## Примеры (sample)

Порядок источников:

1. `example`, затем первый из `examples`;
2. `default`, `const`, первый `enum`;
3. генерация по типу.

- Форматы: `date-time`, `date`, `time`, `email`, `uuid`, `uri`, `hostname`,
  `ipv4`, `ipv6`, `byte`, `binary`, `password`.
- `allOf` сливается, у `oneOf` и `anyOf` берётся первая ветка.
- Для запроса пропускаются `readOnly`, для ответа — `writeOnly`.
- Глубина рекурсии ограничена (`maxDepth`), цикл даёт `{}`.
- Результат детерминирован: фиксированные значения, без случайности.

## Try-it

`request/` строит `HttpRequest` из значений формы.

- **Параметры** сериализуются по `style` и `explode`:
  - path: simple, label, matrix;
  - query: form, spaceDelimited, pipeDelimited, deepObject;
  - header: simple;
  - cookie: form.
- **Тело:** JSON/XML/текст — текстом; multipart и urlencoded с объектной
  схемой — формой по свойствам, поля `format: binary` — выбор файла (массив —
  несколько файлов), переключатель «Raw JSON»; бинарное тело (octet-stream,
  картинки, PDF, `format: binary`) — один файл.
- **Безопасность:**
  - apiKey в header, query или cookie;
  - http basic и bearer;
  - oauth2: все четыре потока. Client credentials и password — запрос к
    `tokenUrl`; authorization code (PKCE S256) и implicit — во всплывающем
    окне. Результат возвращается двумя путями: опрос окна, пока оно на
    redirect URI того же origin, или страница redirect URI шлёт ответ
    opener'у (`relayOAuthCallback`, сообщение `OAUTH_MESSAGE`); `state`
    проверяется всегда. Redirect URI — `oauthRedirectUrl`, по умолчанию адрес
    страницы без query и fragment;
  - openIdConnect: discovery-документ при открытии панели, потоки и scopes
    из него;
  - scopes выбираются галочками; срок токена (`expires_in`) показывается,
    есть «Log out»;
  - токен, обмен кода и discovery идут через `send`, как и try-it: с прокси
    хоста CORS у IdP не нужен.
- **Хранение учётных данных** — по выбору хоста (`persistCredentials`:
  session/local), по спецификации, ключ
  `dsk-openapi:credentials:{specId}:{info.title}`. Хранятся ключи, токены со
  сроком, логины basic; не хранятся пароли basic, client id/secret, пароли
  потока password.

Отправка идёт через `send(request, { signal }) → Promise<HttpResponse>`. По
умолчанию это `fetch`; хост подменяет её прокси. «Cancel» обрывает запрос
через `signal`; хост-транспорт должен пробрасывать его дальше.

Предзаполненные ссылки (`#{anchor}?f={payload}` или `?oa-f=`) только
заполняют форму и показывают уведомление — ничего не отправляют. Формат v1
стабилен, описан в `src/links/prefill.ts` и в `docs/*/links.md`; его же
строит laravel-api на PHP.

## Vue

- `OpenApiReference` — просмотрщик спецификации:
  - навигация по тегам и операциям, схемы;
  - полнотекстовый поиск по открытой спецификации (операции, теги, схемы,
    заголовки описания; все слова обязательны, ранжирование по полю и
    качеству совпадения), список результатов с клавиатурой, `/` и Ctrl/Cmd+K;
  - операция: параметры, тело, ответы, дерево схемы, именованные примеры
    (чипы, описание, ссылка на `externalValue`), сниппеты;
  - try-it-панель: формы, файлы, отмена, размер ответа, pretty/raw, превью
    картинок, скачивание; «Copy link» с предзаполнением;
  - «Download spec» — исходный документ в JSON или YAML;
  - несколько спецификаций (`specs`) с переключателем и ленивой загрузкой;
  - вебхуки и колбэки;
  - глубокие ссылки `[{spec}/]operation/{id}`, `schema/{name}`,
    `tag/{name}` и алиасы Scalar (`{doc}/tag/{tag}/{METHOD}{path}`,
    `model/{name}`) — со сдвигом на base path сервера и откатом к тегу;
  - темы через токены кита.
- `OpenApiPage` — справочник целой страницей: липкая панель с заголовком,
  переключатели темы (light/dark/system, `data-theme` на `<html>`) и языка;
  высота панели уходит в `--oa-sticky-top`.
- `OpenApiEditor` — конструктор:
  - визуальные формы для info, servers, tags, paths и операций, параметров,
    тел, ответов, components (схемы через конструктор схем),
    securitySchemes;
  - режим исходника YAML/JSON с двусторонней синхронизацией, как source mode
    в WYSIWYG;
  - ошибки валидации со ссылкой на строку;
  - превью через `OpenApiReference`.
- v-model — строка (YAML или JSON — формат исходника сохраняется).

## Безопасность

- `description` — markdown, рисуется UidMarkdown кита: экранирование там же.
- Внешние `$ref` грузятся только через лоадер хоста; по умолчанию они не
  грузятся.
- Try-it не отправляет куки на чужой домен (`credentials: 'same-origin'` по
  умолчанию).
- Ссылки из спецификации (контакт, лицензия, условия, `externalDocs`,
  `externalValue`) проходят `safeHref`: только http(s), mailto и
  относительные адреса.
- Ссылка ничего не отправляет сама; учётные данные попадают в неё только по
  галочке «Include credentials»; после заполнения адрес заменяется чистым
  якорем. Полезная нагрузка — не больше 1 МБ после распаковки.
- OAuth: проверка `state`, PKCE, relay только к opener'у того же origin,
  приём сообщения только с origin redirect URI.
- Хранение учётных данных — только по явному `persistCredentials`.

## Тесты

- Модульные тесты на каждый модуль ядра.
- Корпус спецификаций в `tests/fixtures`: petstore 2.0/3.0/3.1, большой
  реальный пример, крайние случаи YAML.
- Проверка сниппетов снапшотами.
- Браузерная проверка компонентов (Playwright) со скриншотами светлой и тёмной
  темы. Перед проверкой собирается `dist/standalone.js`;
  `OA_CHECK_SKIP_BUILD=1` берёт уже собранный, `OA_CHECK_PORT` задаёт порт.
