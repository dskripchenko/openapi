# TypeScript-Typen

Das Paket schreibt TypeScript-Deklarationen für eine Spezifikation: pro
Operation im Tab „Types“ der Referenz, für das ganze Dokument als
`.d.ts`-Download und aus Code über den Kern.

## In der Referenz

Jede Operationskarte hat einen Tab „Types“ neben „Try it“ und „Request
samples“. Oben stehen die erzeugten Namen als Chips — ein Klick kopiert einen
—, dann die Deklarationen, gefolgt von den Komponentenschemas, auf die sie
verweisen, sodass der Ausschnitt für sich kompiliert. Der Code wird erzeugt,
wenn der Tab zum ersten Mal geöffnet wird.

Die Schaltfläche „TS“ der Kopfzeile (und „TS“ in der Einstellungsleiste) lädt
das ganze Dokument als `{title}-{version}.d.ts` herunter: ein Kopfkommentar,
jedes Komponentenschema in alphabetischer Reihenfolge, dann die Typen jeder
Operation in der Reihenfolge des Dokuments.

## Namen

Die Namen einer Operation beginnen mit einem Stamm: der `operationId` in
PascalCase (`listPets` → `ListPets`, `order_item` → `OrderItem`) oder, ohne
sie, Methode und Pfad (`GET /pets/{id}` → `GetPetsId`) — so, wie laravel-api
seine erzeugten Typen benennt. Dann:

| Name | |
|---|---|
| `{Op}PathParams`, `{Op}QueryParams`, `{Op}Headers`, `{Op}Cookies` | Die Parameter nach Ort, als Interfaces. |
| `{Op}RequestBody` | Der Request-Body. |
| `{Op}Response` | Die Vereinigung der Bodys der 2xx-Antworten oder `void`, wenn keine einen Body hat. |
| `{Op}{Status}` | Der Body einer Antwort, benannt nach der Bedeutung des Status (unten). |
| `{Op}{Status}Headers` | Die Header dieser Antwort. |

Status werden nach Bedeutung benannt, nicht nach Zahl:

| Code | Name |
|---|---|
| `200` | `Success` |
| `201` | `Created` |
| `204` | `NoContent` |
| `301` | `Redirect` |
| `404` | `NotFound` |
| `500` | `Error` |
| jeder andere Standardcode | seine Reason Phrase: `400` `BadRequest`, `401` `Unauthorized`, `409` `Conflict`, `422` `UnprocessableEntity`, `503` `ServiceUnavailable`, … |
| `1XX`, `2XX`, `3XX`, `4XX`, `5XX` | `Informational`, `AnySuccess`, `AnyRedirect`, `ClientError`, `ServerError` |
| `default` | `Default` |
| ein Code, der nicht in der Tabelle steht | `Status{code}`, z. B. `Status499` |

`getOrder` bekommt also `GetOrderSuccess`, `GetOrderNotFound`,
`GetOrderDefault`. Tragen die Media Types eines Bodys unterschiedliche Typen,
bekommt jeder ein Suffix — `Json`, `Xml`, `FormData`, `Form`, `Text`,
`Binary` oder den Subtyp in PascalCase —, und der einfache Name ist ihre
Vereinigung: `GetTreesIdSuccess = GetTreesIdSuccessJson | GetTreesIdSuccessText`.

Namen kollidieren nie: Ein Stamm, den schon eine andere Operation hat, oder
einer, dessen Namen mit einer Komponente kollidieren würden (ein Schema
`PetsResponse` und eine Operation `pets`), bekommt eine Zahl — `Pets2`.
Komponentenschemas werden ebenfalls in PascalCase benannt; zwei, die gleich
ausfallen, oder eines namens `Blob` bekommen ebenfalls eine Zahl
(`OrderItem2`, `Blob2`).

Für die Operation `listPets` der Petstore-Spezifikation:

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

## Formen

Die Typen beschreiben, was über die Leitung geht:

- eine `readOnly`-Eigenschaft ist `readonly` (sie kommt in Antworten), eine
  `writeOnly`-Eigenschaft trägt einen Vermerk `@writeOnly`; beide behalten
  die Optionalität, die das Schema ihnen gibt;
- ein `$ref` auf `#/components/schemas/X` ist der Typ `X`, rekursive Schemas
  sind also benannte Typen, die aufeinander verweisen; andere Referenzen
  werden eingesetzt;
- `nullable` und `type: [x, 'null']` ergeben `x | null`, `enum` und `const`
  Literal-Vereinigungen, `allOf` eine Schnittmenge, `oneOf` / `anyOf` eine
  Vereinigung (mit dem `discriminator`-Wert pro Zweig festgelegt),
  `prefixItems` ein Tupel, `additionalProperties` eine Index-Signatur;
- ein Body ohne Schema ist `Blob` bei binären Media Types und `unknown` bei
  textuellen;
- Beschreibungen, `format`, `default`, Beispiele und `deprecated` werden zu
  JSDoc (`@format`, `@default`, `@example`, `@deprecated`).

## Die Kern-API

Alles aus `@dskripchenko/openapi` exportiert:

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
| `operationTypes(spec, entry, { components?, statusNames? })` | `{ names, code }` für eine Operation. `code` sind die Deklarationen, gefolgt von den Komponententypen, die sie erreichen; `components: false` lässt diese weg. |
| `documentTypes(spec, { statusNames? })` | Das ganze Dokument als ein Modul (was die Schaltfläche „TS“ speichert). |
| `schemaToTs(schema, ctx?)` | Ein Schema als Typausdruck. |
| `declareType(name, schema, ctx, doc?)` | Eine exportierte Deklaration: `export interface` für ein Objektliteral, sonst `export type`, mit JSDoc. |
| `createTsContext(document?)` | Der Kontext, den die beiden obigen teilen: wie ein `$ref` ausgegeben wird und welche Komponententypen verwendet wurden (`ctx.used`). |
| `tsTypeName(text)` | Die PascalCase-Regel: `tsTypeName('get /pets/{id}')` → `'GetPetsId'`. |
| `statusTypeName(code, overrides?)` | Der Namensteil für einen Status: `'404'` → `'NotFound'`, `'499'` → `'Status499'`. |
| `STATUS_TYPE_NAMES` | Die eingebaute Tabelle, Code → Name. |

`names` (`OperationTypeNames`) hat `base` (den Stamm), `pathParams`,
`queryParams`, `headers`, `cookies`, `requestBody` und `requestBodies` (pro
Media Type, wenn sie sich unterscheiden), `response`, `responses` (pro
Status), `responseBodies` (pro Status und Media Type, wenn sie sich
unterscheiden), `responseHeaders` (pro Status) und `all` — jeden Namen, in
der Reihenfolge des Codes. `statusNames` überschreibt Einträge der Tabelle:
`{ '422': 'Invalid' }` ergibt `{Op}Invalid`.

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

Die Typen heißen `TsContext`, `OperationTypes`, `OperationTypeNames` und
`OperationTypesOptions`.
