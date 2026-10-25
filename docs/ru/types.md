# Типы TypeScript

Пакет пишет объявления TypeScript для спецификации: для каждой операции — во
вкладке «Types» справочника, для всего документа — загрузкой `.d.ts`, и из
кода — через ядро.

## В справочнике

У каждой карточки операции рядом с «Try it» и «Request samples» есть вкладка
«Types». Вверху — сгенерированные имена в виде чипов (щелчок копирует имя),
затем объявления, а за ними — схемы компонентов, на которые они ссылаются,
так что фрагмент компилируется сам по себе. Код генерируется при первом
открытии вкладки.

Кнопка «TS» в шапке (и «TS» в панели настроек) загружает весь документ как
`{title}-{version}.d.ts`: комментарий-заголовок, все схемы компонентов по
алфавиту, затем типы каждой операции в порядке документа.

## Имена

Имена операции начинаются с основы: `operationId` в PascalCase (`listPets` →
`ListPets`, `order_item` → `OrderItem`), а без него — метод и путь
(`GET /pets/{id}` → `GetPetsId`), так же как laravel-api называет свои
сгенерированные типы. Дальше:

| Имя | |
|---|---|
| `{Op}PathParams`, `{Op}QueryParams`, `{Op}Headers`, `{Op}Cookies` | Параметры по месту, в виде интерфейсов. |
| `{Op}RequestBody` | Тело запроса. |
| `{Op}Response` | Объединение тел ответов 2xx или `void`, если ни у одного нет тела. |
| `{Op}{Status}` | Тело одного ответа, названное по смыслу статуса (ниже). |
| `{Op}{Status}Headers` | Заголовки этого ответа. |

Статусы называются по смыслу, а не по номеру:

| Код | Имя |
|---|---|
| `200` | `Success` |
| `201` | `Created` |
| `204` | `NoContent` |
| `301` | `Redirect` |
| `404` | `NotFound` |
| `500` | `Error` |
| любой другой стандартный код | его reason phrase: `400` `BadRequest`, `401` `Unauthorized`, `409` `Conflict`, `422` `UnprocessableEntity`, `503` `ServiceUnavailable`, … |
| `1XX`, `2XX`, `3XX`, `4XX`, `5XX` | `Informational`, `AnySuccess`, `AnyRedirect`, `ClientError`, `ServerError` |
| `default` | `Default` |
| код, которого нет в таблице | `Status{code}`, например `Status499` |

Так `getOrder` получает `GetOrderSuccess`, `GetOrderNotFound`,
`GetOrderDefault`. Если типы содержимого одного тела дают разные типы,
каждый получает суффикс — `Json`, `Xml`, `FormData`, `Form`, `Text`,
`Binary` или подтип в PascalCase, — а простое имя становится их
объединением: `GetTreesIdSuccess = GetTreesIdSuccessJson | GetTreesIdSuccessText`.

Имена никогда не конфликтуют: основа, уже занятая другой операцией, или
такая, чьи имена совпали бы с компонентом (схема `PetsResponse` и операция
`pets`), получает номер — `Pets2`. Схемы компонентов тоже именуются в
PascalCase; две, давшие одно имя, или схема с именем `Blob` тоже получают
номер (`OrderItem2`, `Blob2`).

Для операции `listPets` спецификации Petstore:

```ts
export interface ListPetsQueryParams {
  /** @format int32 */
  limit?: number
}

/** The body of a successful (2xx) response. */
export type ListPetsResponse = ListPetsSuccess

/**
 * 200: A paged array of pets
 * Media type: application/json.
 */
export type ListPetsSuccess = Pets

/** Headers of the 200 response. */
export interface ListPetsSuccessHeaders {
  /** Next page link */
  'x-next'?: string | null
}

/**
 * default: unexpected error
 * Media type: application/json.
 */
export type ListPetsDefault = Error
```

## Форма типов

Типы описывают то, что идёт по сети:

- свойство `readOnly` — `readonly` (оно приходит в ответах), у `writeOnly`
  есть пометка `@writeOnly`; оба сохраняют необязательность, заданную
  схемой;
- `$ref` на `#/components/schemas/X` — это тип `X`, поэтому рекурсивные
  схемы — именованные типы, ссылающиеся друг на друга; прочие ссылки
  подставляются на месте;
- `nullable` и `type: [x, 'null']` дают `x | null`, `enum` и `const` —
  объединения литералов, `allOf` — пересечение, `oneOf` / `anyOf` —
  объединение (со значением `discriminator`, закреплённым в каждой ветке),
  `prefixItems` — кортеж, `additionalProperties` — индексную сигнатуру;
- тело без схемы — `Blob` для двоичных типов содержимого и `unknown` для
  текстовых;
- описания, `format`, `default`, примеры и `deprecated` становятся JSDoc
  (`@format`, `@default`, `@example`, `@deprecated`).

## API ядра

Всё экспортируется из `@dskripchenko/openapi`:

```ts
import { loadSpec, operationTypes, documentTypes } from '@dskripchenko/openapi'

const spec = loadSpec(text)
const op = spec.operations.find((o) => o.id === 'listPets')!

const { names, code } = operationTypes(spec, op)
names.response     // 'ListPetsResponse'
names.responses    // { '200': 'ListPetsSuccess', default: 'ListPetsDefault' }

const dts = documentTypes(spec, { statusNames: { '422': 'Invalid' } })
```

| | |
|---|---|
| `operationTypes(spec, entry, { components?, statusNames? })` | `{ names, code }` для одной операции. `code` — объявления, за которыми следуют достижимые из них типы компонентов; `components: false` их опускает. |
| `documentTypes(spec, { statusNames? })` | Весь документ одним модулем (то, что сохраняет кнопка «TS»). |
| `schemaToTs(schema, ctx?)` | Одна схема как выражение типа. |
| `declareType(name, schema, ctx, doc?)` | Экспортируемое объявление: `export interface` для объектного литерала, иначе `export type`, с JSDoc. |
| `createTsContext(document?)` | Контекст, общий для двух предыдущих: как печатается `$ref` и какие типы компонентов использованы (`ctx.used`). |
| `tsTypeName(text)` | Правило PascalCase: `tsTypeName('get /pets/{id}')` → `'GetPetsId'`. |
| `statusTypeName(code, overrides?)` | Часть имени для статуса: `'404'` → `'NotFound'`, `'499'` → `'Status499'`. |
| `STATUS_TYPE_NAMES` | Встроенная таблица, код → имя. |

`names` (`OperationTypeNames`) содержит `base` (основу), `pathParams`,
`queryParams`, `headers`, `cookies`, `requestBody` и `requestBodies` (по
типам содержимого, если они различаются), `response`, `responses` (по
статусам), `responseBodies` (по статусам и типам содержимого, если они
различаются), `responseHeaders` (по статусам) и `all` — все имена в порядке
кода. `statusNames` переопределяет записи таблицы: `{ '422': 'Invalid' }`
даёт `{Op}Invalid`.

```ts
import { createTsContext, declareType, schemaToTs } from '@dskripchenko/openapi'

const ctx = createTsContext(spec.document)
schemaToTs({ type: 'object', properties: { id: { type: 'integer', readOnly: true } }, required: ['id'] }, ctx)
// {
//   readonly id: number
// }
declareType('Pet', spec.document.components!.schemas!.Pet, ctx)
// export type Pet = NewPet & { … }
```

Типы: `TsContext`, `OperationTypes`, `OperationTypeNames` и
`OperationTypesOptions`.
