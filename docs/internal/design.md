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
  snippets/   generate(target, HttpRequest) → string; targets[]
  index.ts    публичное API
```

`HttpRequest` — общая промежуточная форма для сниппетов и try-it:

```ts
interface HttpRequest {
  method: string            // GET, POST, …
  url: string               // полный URL с query
  headers: [string, string][]
  body?: { mediaType: string; text?: string; form?: [string, FormValue][] }
}
```

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
- **Безопасность:**
  - apiKey в header, query или cookie;
  - http basic и bearer;
  - oauth2 и openIdConnect: токен вводится, для clientCredentials и password
    его можно получить кнопкой.

Отправка идёт через `send(request) → Promise<HttpResponse>`. По умолчанию это
`fetch`; хост подменяет её прокси.

## Vue

- `OpenApiReference` — просмотрщик спецификации:
  - навигация по тегам и операциям, схемы, поиск;
  - операция: параметры, тело, ответы, дерево схемы, примеры, сниппеты;
  - try-it-панель;
  - вебхуки и колбэки;
  - глубокие ссылки `#operation/{id}`;
  - темы через токены кита.
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

## Тесты

- Модульные тесты на каждый модуль ядра.
- Корпус спецификаций в `tests/fixtures`: petstore 2.0/3.0/3.1, большой
  реальный пример, крайние случаи YAML.
- Проверка сниппетов снапшотами.
- Браузерная проверка компонентов (Playwright) со скриншотами светлой и тёмной
  темы.
