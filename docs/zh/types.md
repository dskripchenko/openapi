# TypeScript 类型

本包为规范文档生成 TypeScript 声明：在参考页的 "Types" 标签页中按操作生成，作为 `.d.ts`
下载为整个文档生成，也可以在代码中通过核心生成。

## 在参考页中

每张操作卡片在 "Try it" 和 "Request samples" 旁边都有一个 "Types" 标签页。顶部以标签形式
列出生成的名称——点击即可复制——然后是声明，接着是它们引用的组件 schema，因此这段代码
可以独立编译。代码在首次打开该标签页时生成。

页头的 "TS" 按钮（以及设置抽屉中的 "TS"）把整个文档下载为 `{title}-{version}.d.ts`：
一段头部注释，按字母顺序排列的所有组件 schema，然后按文档顺序排列的每个操作的类型。

## 名称

一个操作的名称以一个词干开头：PascalCase 形式的 `operationId`（`listPets` → `ListPets`，
`order_item` → `OrderItem`），没有 `operationId` 时则用方法和路径（`GET /pets/{id}` →
`GetPetsId`）——与 laravel-api 为其生成的类型命名的方式相同。然后是：

| 名称 | |
|---|---|
| `{Op}PathParams`、`{Op}QueryParams`、`{Op}Headers`、`{Op}Cookies` | 按位置划分的参数，以接口形式给出。 |
| `{Op}RequestBody` | 请求体。 |
| `{Op}Response` | 所有 2xx 响应体的联合类型；都没有响应体时为 `void`。 |
| `{Op}{Status}` | 某个响应的响应体，按状态码的含义命名（见下文）。 |
| `{Op}{Status}Headers` | 该响应的响应头。 |

状态码按含义而不是数字命名：

| 状态码 | 名称 |
|---|---|
| `200` | `Success` |
| `201` | `Created` |
| `204` | `NoContent` |
| `301` | `Redirect` |
| `404` | `NotFound` |
| `500` | `Error` |
| 其他任何标准状态码 | 其原因短语：`400` `BadRequest`、`401` `Unauthorized`、`409` `Conflict`、`422` `UnprocessableEntity`、`503` `ServiceUnavailable`…… |
| `1XX`、`2XX`、`3XX`、`4XX`、`5XX` | `Informational`、`AnySuccess`、`AnyRedirect`、`ClientError`、`ServerError` |
| `default` | `Default` |
| 表中没有的状态码 | `Status{code}`，例如 `Status499` |

因此 `getOrder` 得到 `GetOrderSuccess`、`GetOrderNotFound`、`GetOrderDefault`。
同一个请求体或响应体的各媒体类型对应不同类型时，每个都加一个后缀——`Json`、`Xml`、
`FormData`、`Form`、`Text`、`Binary`，或 PascalCase 形式的子类型——不带后缀的名称则是它们的
联合类型：`GetTreesIdSuccess = GetTreesIdSuccessJson | GetTreesIdSuccessText`。

名称永不冲突：已被其他操作占用的词干，或其名称会与某个组件冲突的词干（schema
`PetsResponse` 与操作 `pets`），会加上一个数字——`Pets2`。组件 schema 同样以 PascalCase
命名；结果相同的两个，或名为 `Blob` 的一个，也会加上数字（`OrderItem2`、`Blob2`）。

Petstore 规范文档中操作 `listPets` 的类型：

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

## 形状

这些类型描述的是实际在网络上传输的形状：

- `readOnly` 属性是 `readonly`（它出现在响应中），`writeOnly` 属性带有 `@writeOnly` 注释；
  二者都保留 schema 给定的可选性；
- 指向 `#/components/schemas/X` 的 `$ref` 就是类型 `X`，因此递归 schema 是相互引用的具名类型；
  其他引用会被内联；
- `nullable` 和 `type: [x, 'null']` 得到 `x | null`，`enum` 和 `const` 得到字面量联合类型，
  `allOf` 得到交叉类型，`oneOf` / `anyOf` 得到联合类型（每个分支固定其 `discriminator` 值），
  `prefixItems` 得到元组，`additionalProperties` 得到索引签名；
- 没有 schema 的请求体或响应体，对二进制媒体类型为 `Blob`，对文本类型为 `unknown`；
- 描述、`format`、`default`、示例和 `deprecated` 会变成 JSDoc
  （`@format`、`@default`、`@example`、`@deprecated`）。

## 核心 API

全部从 `@dskripchenko/openapi` 导出：

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
| `operationTypes(spec, entry, { components?, statusNames? })` | 单个操作的 `{ names, code }`。`code` 是声明，后接它们用到的组件类型；`components: false` 会省略后者。 |
| `documentTypes(spec, { statusNames? })` | 整个文档作为一个模块（"TS" 按钮保存的内容）。 |
| `schemaToTs(schema, ctx?)` | 把一个 schema 写成类型表达式。 |
| `declareType(name, schema, ctx, doc?)` | 一条导出的声明：对象字面量用 `export interface`，否则用 `export type`，并带 JSDoc。 |
| `createTsContext(document?)` | 上面两个函数共享的上下文：`$ref` 如何输出，以及用到了哪些组件类型（`ctx.used`）。 |
| `tsTypeName(text)` | PascalCase 规则：`tsTypeName('get /pets/{id}')` → `'GetPetsId'`。 |
| `statusTypeName(code, overrides?)` | 状态码对应的名称部分：`'404'` → `'NotFound'`，`'499'` → `'Status499'`。 |
| `STATUS_TYPE_NAMES` | 内置的表，状态码 → 名称。 |

`names`（`OperationTypeNames`）包含 `base`（词干）、`pathParams`、`queryParams`、`headers`、
`cookies`、`requestBody` 和 `requestBodies`（按媒体类型，在它们不同时）、`response`、
`responses`（按状态码）、`responseBodies`（按状态码和媒体类型，在它们不同时）、
`responseHeaders`（按状态码）以及 `all`——按代码中的顺序列出的所有名称。`statusNames`
覆盖表中的条目：`{ '422': 'Invalid' }` 得到 `{Op}Invalid`。

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

类型为 `TsContext`、`OperationTypes`、`OperationTypeNames` 和 `OperationTypesOptions`。
