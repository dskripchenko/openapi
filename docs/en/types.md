# TypeScript types

The package writes TypeScript declarations for a spec: per operation in the
reference's "Types" tab, for the whole document as a `.d.ts` download, and
from code through the core.

## In the reference

Every operation card has a "Types" tab next to "Try it" and "Request
samples". At the top are the generated names as chips — a click copies one —
then the declarations, followed by the component schemas they refer to, so
the snippet compiles on its own. The code is generated the first time the
tab is opened.

The header's "TS" button (and "TS" in the settings drawer) downloads the
whole document as `{title}-{version}.d.ts`: a header comment, every
component schema in alphabetical order, then every operation's types in
document order.

## Names

The names of an operation start with a stem: the `operationId` in
PascalCase (`listPets` → `ListPets`, `order_item` → `OrderItem`), or, without
one, the method and path (`GET /pets/{id}` → `GetPetsId`) — the way
laravel-api names its generated types. Then:

| Name | |
|---|---|
| `{Op}PathParams`, `{Op}QueryParams`, `{Op}Headers`, `{Op}Cookies` | The parameters by location, as interfaces. |
| `{Op}RequestBody` | The request body. |
| `{Op}Response` | The union of the 2xx response bodies, or `void` when none has a body. |
| `{Op}{Status}` | The body of one response, named by what the status means (below). |
| `{Op}{Status}Headers` | The headers of that response. |

Statuses are named by meaning, not number:

| Code | Name |
|---|---|
| `200` | `Success` |
| `201` | `Created` |
| `204` | `NoContent` |
| `301` | `Redirect` |
| `404` | `NotFound` |
| `500` | `Error` |
| any other standard code | its reason phrase: `400` `BadRequest`, `401` `Unauthorized`, `409` `Conflict`, `422` `UnprocessableEntity`, `503` `ServiceUnavailable`, … |
| `1XX`, `2XX`, `3XX`, `4XX`, `5XX` | `Informational`, `AnySuccess`, `AnyRedirect`, `ClientError`, `ServerError` |
| `default` | `Default` |
| a code not in the table | `Status{code}`, e.g. `Status499` |

So `getOrder` gets `GetOrderSuccess`, `GetOrderNotFound`, `GetOrderDefault`.
When the media types of one body carry different types, each gets a suffix —
`Json`, `Xml`, `FormData`, `Form`, `Text`, `Binary`, or the subtype in
PascalCase — and the plain name is their union: `GetTreesIdSuccess =
GetTreesIdSuccessJson | GetTreesIdSuccessText`.

Names never clash: a stem already taken by another operation, or one whose
names would collide with a component (a schema `PetsResponse` and an
operation `pets`), gets a number — `Pets2`. Component schemas are named in
PascalCase too; two that come out the same, or one named `Blob`, get a
number as well (`OrderItem2`, `Blob2`).

For the operation `listPets` of the Petstore spec:

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

## Shapes

The types describe what travels over the wire:

- a `readOnly` property is `readonly` (it comes in responses), a `writeOnly`
  one carries a `@writeOnly` note; both keep the optionality the schema
  gives them;
- a `$ref` to `#/components/schemas/X` is the type `X`, so recursive schemas
  are named types referring to each other; other references are inlined;
- `nullable` and `type: [x, 'null']` give `x | null`, `enum` and `const`
  literal unions, `allOf` an intersection, `oneOf` / `anyOf` a union (with
  the `discriminator` value pinned per branch), `prefixItems` a tuple,
  `additionalProperties` an index signature;
- a body without a schema is `Blob` for binary media types and `unknown`
  for textual ones;
- descriptions, `format`, `default`, examples and `deprecated` become JSDoc
  (`@format`, `@default`, `@example`, `@deprecated`).

## The core API

All exported from `@dskripchenko/openapi`:

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
| `operationTypes(spec, entry, { components?, statusNames? })` | `{ names, code }` for one operation. `code` is the declarations followed by the component types they reach; `components: false` leaves those out. |
| `documentTypes(spec, { statusNames? })` | The whole document as one module (what the "TS" button saves). |
| `schemaToTs(schema, ctx?)` | One schema as a type expression. |
| `declareType(name, schema, ctx, doc?)` | An exported declaration: `export interface` for an object literal, else `export type`, with JSDoc. |
| `createTsContext(document?)` | The context the two above share: how a `$ref` prints, and which component types were used (`ctx.used`). |
| `tsTypeName(text)` | The PascalCase rule: `tsTypeName('get /pets/{id}')` → `'GetPetsId'`. |
| `statusTypeName(code, overrides?)` | The name part for a status: `'404'` → `'NotFound'`, `'499'` → `'Status499'`. |
| `STATUS_TYPE_NAMES` | The built-in table, code → name. |

`names` (`OperationTypeNames`) has `base` (the stem), `pathParams`,
`queryParams`, `headers`, `cookies`, `requestBody` and `requestBodies` (per
media type, when they differ), `response`, `responses` (per status),
`responseBodies` (per status and media type, when they differ),
`responseHeaders` (per status) and `all` — every name, in the order of the
code. `statusNames` overrides entries of the table: `{ '422': 'Invalid' }`
makes `{Op}Invalid`.

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

The types are `TsContext`, `OperationTypes`, `OperationTypeNames` and
`OperationTypesOptions`.
