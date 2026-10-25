# API-блоки

API-блок — это блок кода с языком `openapi` внутри насыщенного контента:
WYSIWYG-редактора, markdown-страницы, любой HTML-страницы. Его YAML или JSON
описывает один или несколько HTTP-запросов. При показе он становится живым
API-виджетом — компактной карточкой [встраивания](embed.md): метод и путь,
параметры, тело, ответы, try-it, который действительно отправляет запрос,
примеры запроса, типы TypeScript и PDF. В режиме редактирования у него три
вкладки: **Просмотр**, **Исходник** и **Конструктор** — форма запросов.
Исходник и конструктор — два вида одного текста: правка в одном сразу видна
в другом.

````markdown
```openapi
method: POST
url: https://api.example.com/v1/users/{id}
summary: Update a user
auth: bearer
params:
  path: { id: integer }
body:
  example: { name: Ann, age: 31 }
responses:
  200: { description: The updated user, example: { id: 7, name: Ann } }
  404: Not found
```
````

## Формат

В блоке один запрос, несколько запросов или целый документ OpenAPI. Подходят
и YAML, и JSON; решает первый символ (`{` — это JSON).

### Один запрос

| Ключ | | |
|---|---|---|
| `url` | обязателен | Абсолютный URL (`https://api.example.com/v1/users/{id}`) или путь (`/users/{id}`). `{name}` — параметр пути; строка запроса (`?page=1`) даёт query-параметры с этими примерами. |
| `method` | `GET` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`, в любом регистре. |
| `summary` | | Заголовок карточки. |
| `description` | | Markdown. |
| `auth` | | См. [аутентификацию](#аутентификация). |
| `params` | | `path`, `query`, `header`, `cookie` — в каждом имя → параметр. |
| `body` | | См. [тело и ответы](#тело-и-ответы). |
| `responses` | `200: OK` | Статус (`200`, `4XX`, `default`) → описание или объект. |
| `operationId`, `tags`, `deprecated` | | Как в OpenAPI. `operationId` по умолчанию собирается из метода и пути: `POST /v1/users/{id}` → `postV1UsersById`. |
| `title`, `version` | | Заголовок документа (по умолчанию — summary) и версия. |
| `baseUrl`, `servers` | | См. [несколько запросов](#несколько-запросов). |
| `x-…` | | Остаются на операции. |

Неизвестный ключ — ошибка с подсказкой (`Unknown key "respones" — did you
mean "responses"?`) на его строке.

### Типы

Параметр, заголовок или свойство схемы записывается сокращённо — так же, как
в laravel-api: `type(format)! Описание`.

| Запись | Значит |
|---|---|
| `string`, `integer`, `number`, `boolean`, `object`, `array` | Тип. |
| `string(email)`, `integer(int64)`, `string(date-time)` | С форматом. |
| `string[]`, `integer[][]` | Массивы. |
| `file` | Загрузка файла: `string(binary)`. |
| `integer!` | Обязательный (параметры пути обязательны всегда). |
| `integer! The user's id` | Текст после первого пробела — описание. |

Или объект — поля параметра (`description`, `required`, `deprecated`,
`example`, `style`, `explode`, `schema`) рядом с полями схемы (`type`, в том
числе сокращённый, `format`, `enum`, `default`, `minimum`, …):

```yaml
params:
  query:
    sort: { type: string, enum: [name, date], description: Order, example: name }
    page: { type: integer!, minimum: 1 }
```

Параметр пути из URL, не объявленный в `params.path`, — строка.

### Тело и ответы

```yaml
body:
  type: json            # по умолчанию; ещё form, multipart, text, xml, binary или media type
  example: { name: Ann }
  schema: { ... }       # необязательно: без неё схема выводится из примера
  description: The new user
  required: true        # по умолчанию
responses:
  200:
    description: OK     # по умолчанию — стандартная фраза статуса
    type: json
    example: { id: 7 }
    headers: { X-Rate-Limit: integer Calls left }
  404: Not found        # только описание
  default:              # пусто: "Error"
```

`schema` — это JSON Schema, внутри которой тоже работает сокращённая запись:
свойство может быть строкой-типом, имя свойства с `!` на конце делает его
обязательным, `items` тоже может быть строкой.

```yaml
schema:
  type: object
  properties:
    name: string!
    email: string(email) Where receipts go
    tags!: { type: array, items: string }
```

Без схемы её даёт пример (`inferSchema`): типы по видам JSON, целые отдельно
от прочих чисел, форматы `date-time`, `date`, `uuid`, `email` и `uri`,
элементы массива сливаются из всех элементов.

### Аутентификация

| `auth` | Схема безопасности |
|---|---|
| `bearer` | HTTP bearer; `{ type: bearer, format: JWT }` добавляет формат. |
| `basic` | HTTP basic. |
| `apiKey` | API-ключ в заголовке `X-API-Key`; `{ type: apiKey, in: header \| query \| cookie, name: X-Key }`. |
| `{ type: oauth2, flow, authorizationUrl, tokenUrl, scopes }` | OAuth 2.0. `flow` — `authorizationCode`, `clientCredentials`, `password` или `implicit`; без него поток выбирается по URL. `scopes` — список или имя → описание. |
| `{ type: openIdConnect, url }` | OpenID Connect discovery. |
| `none` | Без аутентификации — перекрывает общую. |

Учётные данные карточка спрашивает в панели настроек, как и справочник.

### Несколько запросов

```yaml
title: Orders
baseUrl: https://api.example.com/v2
auth: bearer              # по умолчанию для каждого запроса
requests:
  - url: /orders?page=1
    summary: List orders
  - method: POST
    url: /orders
    summary: Create an order
    body: { type: form, example: { item: book, qty: 2 } }
  - url: https://files.example.com/upload
    method: PUT
    auth: none
```

Общие ключи: `title`, `description` (markdown над карточками), `version`,
`baseUrl` (пути разрешаются от него, он становится сервером), `servers`
(список URL или `{ url, description }`), `auth` и `x-…`. Без базового URL
сервером становится хост первого абсолютного URL; запрос на другой хост
получает свой.

### Целый документ

Блок с ключом `openapi` или `swagger` — документ OpenAPI 3.x или Swagger 2.0,
он берётся как есть: каждая операция становится карточкой. Конструктор такие
блоки не правит, исходник — правит.

## API ядра

Из `@dskripchenko/openapi`:

```ts
import { parseBlock, stringifyBlock, blockToDocument, inferSchema } from '@dskripchenko/openapi'

const r = parseBlock(text)
if (r.ok) {
  r.document // OpenAPI 3.1
  r.kind     // 'requests' | 'document'
  r.format   // 'yaml' | 'json'
  r.data     // разобранный текст
} else {
  r.error    // { message, line?, column?, pointer? }
}
stringifyBlock(r.data, 'json')   // YAML ↔ JSON
```

- `parseBlock(text)` не бросает исключений. И синтаксические ошибки, и ошибки
  формы приходят со строкой и колонкой.
- `blockToDocument(data)` преобразует разобранные компактные данные; бросает
  `BlockError` (с `pointer`).
- `inferSchema(value)` — JSON Schema по примеру.
- `parseShorthand`, `formatShorthand`, `expandSchema` — сокращённая запись
  типов.
- `blockToModel(data, format)` / `modelToBlock(model, base, format)` — модель
  формы конструктора и обратный путь. Обратный путь правит `base`: поля,
  которые форма не меняла, сохраняют значение ровно как написано
  (сокращённая или объектная запись, `enum`, заголовки ответов, ключи `x-`…),
  поэтому `modelToBlock(blockToModel(data), data).data` равно `data`. Тексты,
  которые не читаются (пример — не JSON), оставляют старое значение и
  приходят в `errors`. `syncOrigins(model)` — после записи,
  `syncPathParams(request)` — после смены URL.

## Во Vue: OpenApiBlock

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiBlock } from '@dskripchenko/openapi/vue'

const source = ref('url: https://api.example.com/health\nsummary: Health check\n')
</script>

<template>
  <OpenApiBlock v-model:source="source" editable locale="ru" />
</template>
```

| Свойство | Тип | По умолчанию | |
|---|---|---|---|
| `source` | `string` | — | Текст блока. Правки приходят в `update:source` в формате текста. |
| `editable` | `boolean` | `false` | Вкладки «Просмотр / Исходник / Конструктор»; только чтение — один просмотр. |
| `tab` | `'preview' \| 'source' \| 'constructor'` | `'preview'` | Вкладка, с которой открывается редактируемый блок. |
| `locale` | `string` | — | `en` или `ru`. |
| `labels` | `Partial<OpenApiLabels>` | | Строки карточек. |
| `blockLabels` | `Partial<BlockLabels>` | | Строки самого виджета (`blockEn`, `blockRu`). |
| `debounce` | `number` | `300` | Миллисекунды от последней правки в конструкторе до `update:source`. |
| `send`, `tryIt`, `snippetTargets`, `defaultSnippet`, `baseUrl`, `persistCredentials`, `oauthRedirectUrl` | | | Как у [`OpenApiOperation`](embed.md). |

Наружу доступны `tab`, `text`, `parsed` и `flush()` (записывает отложенные
правки конструктора сразу). Переключатель YAML / JSON на вкладке исходника
конвертирует текст (комментарии YAML не переживают ни конвертацию, ни правку
в конструкторе); ошибка разбора показывается со строкой. Конструктор меняет
только то, что поменяли в нём: всё, что он не умеет выразить, остаётся в
исходнике как написано.

### Монтирование без шаблона

```ts
import { mountOpenApiBlock } from '@dskripchenko/openapi/vue'

const handle = mountOpenApiBlock(el, {
  source,
  editable: true,
  onChange: (next) => save(next),
  appContext: app._context, // необязательно: provide хоста (тема kit, i18n) доходят до виджета
})
handle.update(newSource) // изменение снаружи; открытая вкладка остаётся
handle.destroy()
```

## Контракт рендерера блоков

Редакторы и markdown-просмотрщики, которые рисуют блоки кода по языку,
принимают **рендерер блоков**. `openApiBlockRenderer(options?)` возвращает
такой рендерер для ` ```openapi `:

```ts
type BlockRenderer = (code: string, ctx: { language: string; index: number }) => BlockRenderResult | Promise<BlockRenderResult>

interface BlockRenderResult {
  html?: string
  error?: string
  /** Живой остров: вызывается с элементом острова, возвращает handle. */
  mount?: (el: HTMLElement, ctx: BlockMountContext) => BlockMountHandle | (() => void) | void
}

interface BlockMountContext {
  code: string
  language: string
  /** false в режиме только для чтения. */
  editable: boolean
  /** Заменяет код блока (только при редактировании); хост не перерисовывает остров из-за этой правки. */
  setCode(code: string): void
}

interface BlockMountHandle { update?(code: string): void; destroy?(): void }
```

Рендерер всегда возвращает `{ mount }`, даже для блока, который не читается:
ошибку показывает сам виджет, а в редактируемом её можно исправить в
исходнике или конструкторе. `mount` монтирует виджет редактируемым там, где
`ctx.editable`, отдаёт правки в `ctx.setCode`, а его `update(code)`
принимает изменения снаружи (undo, redo), не теряя открытую вкладку.

```ts
import { openApiBlockRenderer } from '@dskripchenko/openapi/vue'

const renderers = { openapi: openApiBlockRenderer({ locale: 'ru', appContext: app._context }) }
```

Типы тоже экспортируются из `@dskripchenko/openapi/vue`.

## Без сборки: renderBlocks

[Standalone-сборка](standalone.md) рисует блоки на любой странице.
Markdown-рендерер превращает ` ```openapi ` в
`<pre><code class="language-openapi">`; `language-openapi-yaml` и
`language-openapi-json` тоже находятся.

```html
<pre><code class="language-openapi">url: https://api.example.com/health
summary: Health check
</code></pre>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

С `data-auto` скрипт рисует все такие блоки, как только документ разобран
(и монтирует встраивания `[data-openapi-operation]`); атрибуты тега
`data-openapi-theme`, `data-openapi-locale` и `data-openapi-proxy` действуют
и на блоки. Из скрипта:

```js
const blocks = DskOpenApi.renderBlocks('#article', { locale: 'auto', theme: 'system', proxy: '/try-it-proxy' })
blocks[0].element // элемент виджета на месте <pre>
blocks[0].destroy()
```

`renderBlocks(root?, options?)` принимает узел или селектор (по умолчанию
документ) и возвращает нарисованные блоки: `{ element, update(source),
destroy() }`. Нарисованный блок больше не элемент кода, поэтому повторный
вызов после добавления контента рисует только новые. Параметры: `theme`,
`locale` (`en`, `ru`, `auto`), `proxy` и параметры виджета `tryIt`,
`labels`, `blockLabels`, `snippetTargets`, `defaultSnippet`, `baseUrl`,
`persistCredentials`, `oauthRedirectUrl`. Здесь блоки только для чтения;
`DskOpenApi.mountOpenApiBlock(el, options)` монтирует редактируемый.
