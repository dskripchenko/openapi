# 核心 API

本页的所有内容都从 `@dskripchenko/openapi` 导出。核心没有依赖，也不接触 DOM，
因此在浏览器、Node 20+ 和构建脚本中的行为完全一致。

## 加载规范文档

```ts
import { loadSpec } from '@dskripchenko/openapi'

const spec = loadSpec(text)
```

`loadSpec(input, options?)` 接受 YAML 或 JSON 文本，或已解析的对象，返回一个 `LoadedSpec`：

| 字段 | |
|---|---|
| `source` | `{ family, version, raw, format? }` —— 原始输入：`family` 为 `'swagger2'`、`'openapi30'` 或 `'openapi31'`，`version` 为声明的版本，`raw` 为解析后的对象；传入文本时，`format` 为 `'yaml'` 或 `'json'`。 |
| `document` | 归一化为 OpenAPI 3.1 的文档（见 [归一化](#归一化)）。 |
| `resolver` | 解析 `document` 中的 `$ref`（见 [引用](#引用)）。 |
| `operations` | `paths` 和 `webhooks` 中的所有操作，按文档顺序（`OperationEntry[]`）。 |
| `groups` | 按标签分组的操作（`OperationGroup[]`）。 |
| `tagGroups` | 文档中有 `x-tagGroups` 时，来自它的标签分组。 |
| `warnings` | 归一化过程中的提示，例如缺少 `info`。 |
| `positions` | `raw` 在源文本中的位置（传入文本时）。 |

唯一的选项是 `external`，即外部引用的加载器，见 [引用](#引用)。

文本无法读取时，`loadSpec` 抛出 `YamlError` 或 `JsonError`；值不是 Swagger 2.0
或 OpenAPI 3.x 文档时，抛出 `OpenApiError`。高于 3.1 的版本（3.2）按 3.1 读取。

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

`loadDocument(raw, { positions?, format?, external? })` 对你自己解析好的对象做同样的事，
并保留你传入的位置信息。

### 操作

`OperationEntry` 包含：

| 字段 | |
|---|---|
| `id` | `operationId`，或由方法和路径生成的 slug（`get-pets-id`）；在文档内唯一。 |
| `method` | `'get'`、`'post'`……（小写）。 |
| `path` | 路径模板，或 webhook 的名称。 |
| `operation`、`pathItem` | 文档中的对象。 |
| `tags` | 操作的标签；没有标签时为 `['default']`。 |
| `parameters` | 合并后的路径级和操作级参数（操作级优先），已解引用。 |
| `deprecated` | `boolean`。 |
| `webhook` | 对 `webhooks` 中的操作，为 webhook 的名称。 |

`OperationGroup` 为 `{ name, displayName, description?, tag?, operations }`。
`displayName` 是标签的 `x-displayName`，或其名称。已声明的标签按声明顺序排在前面，
之后是只在操作上出现的标签；带多个标签的操作会出现在每个对应的分组中。

`listOperations(document, resolver)` 和 `groupByTag(document, operations)`
是可单独使用的这两个步骤；`groupByTag` 返回 `GroupedOperations`，即
`{ groups, tagGroups? }`。`DEFAULT_TAG` 为 `'default'`。

## 解析器

```ts
import { parseSpec, parseYaml, parseJson, detectFormat } from '@dskripchenko/openapi'

const { value, positions, format } = parseSpec(text)   // format detected
const yaml = parseYaml(text)                           // { value, positions }
const json = parseJson(text)                           // { value, positions }
detectFormat('  {"openapi": "3.1.0"}')                 // 'json'
```

当第一个非空白字符是 `{` 或 `[` 时，`detectFormat` 返回 `'json'`，否则返回 `'yaml'`。
`parseSpec(text, format?)` 在未指定格式时使用它。

两个解析器都返回 `positions`：一个从 JSON Pointer 到该值在文本中起始位置
`{ line, column }` 的 `Map`，两者都从 1 开始。对象成员指向其键，数组元素指向元素本身，
根（`''`）指向 1:1。

```ts
const { positions } = parseYaml(text)
positions.get('/paths/~1pets~1{id}/get')   // { line: 9, column: 5 }
```

**YAML。** 解析器覆盖规范文档中会用到的内容：块映射和块序列，流式集合 `{}` 和 `[]`，
普通、单引号和带转义的双引号标量，带截断（`-`、`+`）和缩进指示符的块标量 `|` 和 `>`，
注释，`---` 和 `...`，锚点 `&a`、别名 `*a` 以及合并键 `<<`。标量遵循 core schema：
`null`、`true`/`false`、十进制、十六进制（`0x`）和八进制（`0o`）整数、浮点数、
`.inf` 和 `.nan`。标签被忽略，`!!str` 除外，它使标量保持为字符串。每段文本一个文档。
语法错误抛出 `YamlError`。

**JSON。** 严格遵循 RFC 8259。接受 UTF-8 BOM。与 `JSON.parse` 不同，重复的键是错误，
因为在规范文档中这总是失误。语法错误抛出 `JsonError`。

### 写出

```ts
import { stringifySpec, stringifyYaml, stringifyJson } from '@dskripchenko/openapi'

stringifySpec(value, 'yaml')                 // YAML, 2-space indent
stringifySpec(value, 'json')                 // JSON, 2-space indent
stringifyYaml(value, { indent: 4, lineWidth: 0 })
stringifyJson(value, 2)
```

`stringifyYaml` 的输出是确定的：保持键的顺序；只有当不加引号会被读回成别的东西时，
标量才加引号；多行字符串写成 `|` 块。`indent` 为 1–8 个空格（默认 2）；长度超过
`lineWidth`（默认 80）的单行字符串会在空格处折叠为 `>-` 块，`lineWidth: 0` 关闭折叠。
解析文本中的注释不会保留：解析器不记录它们。

## 归一化

```ts
import { normalize, detectVersion } from '@dskripchenko/openapi'

detectVersion(raw)                    // { family: 'swagger2', version: '2.0' }
const { document, warnings } = normalize(raw)
document.openapi                      // '3.1.0'
```

`normalize` 把任何受支持的文档转换为 OpenAPI 3.1 的结构。它不修改输入；
结果与输入不共享任何对象。

从 **Swagger 2.0**：

- `host`、`basePath` 和 `schemes` 变为 `servers`；
- `body` 参数以及 `consumes` / `produces` 变为 `requestBody` 和响应的 `content`；
- `formData` 参数变为 `application/x-www-form-urlencoded` 或 `multipart/form-data` 请求体；
- `definitions` 变为 `components.schemas`，`securityDefinitions` 变为
  `components.securitySchemes`，每个 `$ref` 也相应改写。

从 **OpenAPI 3.0**：

- `nullable: true` 变为包含 `'null'` 的类型（`type: [string, 'null']`）；
- 布尔形式的 `exclusiveMinimum` / `exclusiveMaximum` 变为数值形式；
- schema 的 `example` 也会保留。

`upgradeSchema30(schema)` 对单个 schema 应用 3.0 → 3.1 的 schema 规则并以副本形式返回结果；
输入保持不变。

## 引用

```ts
import { createResolver } from '@dskripchenko/openapi'

const resolver = createResolver(document, { external })

resolver.get('#/components/schemas/Pet')          // one step
resolver.deref({ $ref: '#/components/schemas/Pet' }) // the whole chain
resolver.isCircular('#/components/schemas/Node')  // true for a self-referencing schema
```

- `get(ref)` 返回引用所指向的内容，或 `undefined`。
- `deref(value)` 沿引用链找到具体的值；不是引用的值原样返回；断开或循环的链返回 `undefined`。
- `isCircular(ref)` 判断 `ref` 背后的结构是否又指回它自身。

`loadSpec` 会替你创建 resolver，即 `spec.resolver`。

**外部引用**（`common.yaml#/Pet`）只能通过 `external` 选项解析：这是一个同步函数，
接收引用中原样书写的 URL 部分，返回解析后的文档或 `undefined`。其结果按 URL 缓存；
抛出异常视为 `undefined`。没有 `external` 时，不会加载文档之外的任何内容：

```ts
const common = parseSpec(commonText).value
const spec = loadSpec(text, { external: (url) => (url === 'common.yaml' ? common : undefined) })
```

## 校验

```ts
import { parseSpec, validateDocument } from '@dskripchenko/openapi'

const { value, positions } = parseSpec(text)
const issues = validateDocument(value, { positions })
// [{ pointer: '/paths/~1a~1{id}/get', message: 'Path parameter "id" of "/a/{id}" is not defined',
//    severity: 'error', line: 6, column: 5 }]
```

`validateDocument(raw, { positions? })` 检查原始文档——2.0、3.0 或 3.1，归一化之前——
并返回 `DocumentIssue[]`：`{ pointer, message, severity: 'error' | 'warning', line?, column? }`。
传入解析器给出的 `positions` 时，每个问题都带有行号。它从不抛出异常；
不是规范文档的对象会得到一条错误。

它检查渲染器所依赖的结构，而不是规范的每一条规则：必填字段（`info.title`、
`info.version`、`paths`、`responses`、响应的 `description`、参数的 `name` 和 `in`），
路径以 `/` 开头，路径参数已声明且为必填，重复的参数和 `operationId`，状态码，
服务器变量，各安全方案类型所需的字段，已使用但未声明的标签，无法解析的引用，
以及未知的顶层字段。

## Schema

schema 相关函数接受一个 `resolve` 函数 `(ref: string) => Schema | undefined`，
用于跟随 `$ref`。配合已加载的规范文档：

```ts
import { loadSpec, sampleSchema, sampleXml, validateValue, describeSchema, type Schema } from '@dskripchenko/openapi'

const spec = loadSpec(text)
const resolve = (ref: string) => spec.resolver.get(ref) as Schema | undefined
const pet: Schema = { $ref: '#/components/schemas/Pet' }
```

### 示例值

```ts
sampleSchema(pet, { resolve, mode: 'response' })  // { id: 0, name: 'Rex', tag: 'string' }
sampleSchema(pet, { resolve, mode: 'request' })   // { name: 'Rex', tag: 'string' } — readOnly id left out
sampleXml(pet, { resolve })                       // '<?xml version="1.0" encoding="UTF-8"?>\n<Pet>…</Pet>'
```

`sampleSchema(schema, options?)` 构建一个示例值。它依次取 `example`、`examples`
的第一项、`default`、`const`、`enum` 的第一个值，否则按类型生成。带已知 `format`
的字符串得到固定值（`FORMAT_SAMPLES`：`date-time`、`date`、`time`、`email`、
`uuid`、`uri`、`hostname`、`ipv4`、`ipv6`、`byte`、`binary`、`password` 等）；
`minLength`、`pattern`、数值范围和 `minItems` 都会被遵守。`allOf` 会被合并，
`oneOf` 和 `anyOf` 取第一个分支。

选项：`mode` —— `'request'` 省略 `readOnly` 属性，`'response'` 省略 `writeOnly`
属性；`maxDepth` —— 嵌套深度上限，更深的层级变为 `{}` 或 `[]`（默认 8）；
`preferExamples` —— 使用 `example` / `examples`（默认 `true`）。引用自身的 schema
在循环闭合处产生 `{}`。结果是确定的：同一个 schema 总是得到同样的示例。

`sampleXml(schema, options?)` 把示例写成 XML 文档，并遵循 schema 的 `xml` 提示
（`name`、`attribute`、`wrapped`、命名空间）。根元素的名称取自 `xml.name`、
被引用 schema 的名称，或 `root`。

### 校验值

```ts
validateValue({ name: 5 }, pet, { resolve })
// [{ path: '', message: "must have required property 'id'", keyword: 'required' },
//  { path: '/name', message: 'must be string', keyword: 'type' }]
```

`validateValue(value, schema, { resolve?, mode? })` 按 OpenAPI 3.1 所使用的
JSON Schema 2020-12 检查一个值，并兼容 3.0 的 `nullable` 和布尔形式的排他边界。
它返回所有 `ValidationIssue` —— `{ path, message, keyword }`，其中 `path`
是指向该值内部的 JSON Pointer——值有效时返回空列表。`mode: 'request'` 时
`readOnly` 属性算作错误，`'response'` 时 `writeOnly` 属性算作错误。

### 描述类型

```ts
describeSchema(pet)                                       // 'Pet'
describeSchema({ type: 'array', items: pet })             // 'array<Pet>'
describeSchema({ type: ['string', 'null'], format: 'uuid' }) // 'string<uuid> | null'
```

`describeSchema(schema, { resolve? })` 给出参考页在字段旁显示的简短类型标签：
`string<uuid>`、`array<Pet>`、`oneOf: Cat | Dog`、`string | null` 等。

## 请求

`HttpRequest` 是示例打印、try-it 发送所用的结构：
`{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`。

### 构建请求

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

`buildRequest(input)` 接受：

| 字段 | |
|---|---|
| `method`、`path` | 方法和路径模板。 |
| `server` | 基础 URL，已用 `serverUrl` 解析；可以是相对地址。 |
| `parameters` | 操作已解引用的参数（`OperationEntry.parameters`）。 |
| `values` | 按位置和名称给出的值：`{ path?, query?, header?, cookie? }`。 |
| `body` | `{ mediaType, value, encoding? }` —— 结构化媒体类型用对象，否则为输入的文本。 |
| `security` | `AppliedSecurity[]`：`{ scheme, value }` —— 密钥或令牌，basic 方案则为 `{ username, password }`。 |

它遵循规范中的规则：

- 参数按 `style` 和 `explode` 序列化——path 支持 `simple`、`label`、`matrix`；
  query 支持 `form`、`spaceDelimited`、`pipeDelimited`、`deepObject`；header 支持
  `simple`；cookie 支持 `form`——带 `content` 的参数按该媒体类型写出；
- 没有值的路径占位符保持为 `{name}`；
- 空的可选值被省略；空字符串只有在 `allowEmptyValue` 时才保留；
- 名为 `Accept`、`Content-Type` 和 `Authorization` 的 header 参数会被忽略，这是规范的要求；
- 来自参数和 API 密钥的 cookie 合并到同一个 `Cookie` 请求头中；
- `Content-Type` 根据请求体的媒体类型设置，multipart 除外——由 HTTP 客户端连同 boundary 一起添加；
- JSON 请求体会被序列化，urlencoded 请求体按其 `encoding` 编码，multipart 请求体中的文件字段保持为
  `{ filename, contentType?, data? }`（`data` 是 `Blob` 或字符串）；multipart 字段中的对象变为 JSON，
  数组则重复该字段。

### 单独处理参数和服务器

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

`serializeParam(param, value)` 返回可直接使用的 path 和 header 值，以及已做百分号编码的
query 和 cookie 键值对；`undefined` 表示"省略该参数"。`serializeValue(location, name, value,
{ style, explode, allowReserved, raw })` 功能相同，但不需要参数对象；`defaultStyle(location)`
给出某个位置的默认 style。`serverUrl(server, variables?)` 填充服务器变量（先用给定的值，
再用默认值）；`joinUrl(base, path)` 在两者之间恰好放一个斜杠，并让相对的 base 保持相对。

`applySecurity(list)` 把 `AppliedSecurity[]` 转换为 `{ headers, query, cookies }`，
`basicAuth(username, password)` 给出 `Basic …` 请求头的值。构建器使用的小型编码函数也已导出：
`encodeComponent`、`encodeCookie`、`base64Utf8`、`baseMediaType`、`isJsonMediaType`、
`isFormUrlEncoded`、`isMultipart`。

### 发送

```ts
import { sendRequest } from '@dskripchenko/openapi'

const response = await sendRequest(request, { credentials: 'same-origin' })
response.status     // 0 when there was no response
response.error      // the reason in that case: network, CORS
response.body       // the body as text
response.duration   // milliseconds
```

`sendRequest(request, { fetch?, signal?, credentials? })` 用 `fetch`（除非你传入另一个，
否则为全局的 `fetch`）发送请求，并以文本形式读取响应体。它从不抛出异常：在得到响应之前的失败会以
`status: 0` 并设置 `error` 的形式返回。`credentials` 默认为 `'same-origin'`，因此 cookie
绝不会发给外部 API。对 multipart 请求体，它会移除 `Content-Type`，以便 `fetch` 连同 boundary
一起设置。在浏览器中，浏览器禁止的请求头（`Cookie`、`Host`、`Origin`……）会被浏览器自身丢弃。

`toFetchBody(request)` 单独给出 `fetch` 的请求体：multipart 为 `FormData`，urlencoded
表单为 `URLSearchParams`，其他情况为文本。

`SendFn` —— `(request: HttpRequest) => Promise<HttpResponse>` —— 是参考页所接受的传输函数的类型；
见 [通过你的服务器发送](reference.md#通过你的服务器发送)。

### OAuth2 令牌

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

`fetchOAuthToken(flow, options)` 使用 `client_credentials`（RFC 6749 §4.4）或
`password`（§4.3，选项中需提供 `username` 和 `password`）授权方式请求令牌。有 client secret
时客户端使用 HTTP Basic 认证；没有时 `client_id` 放入表单。选项还接受 `fetch` 和 `signal`。
失败时它以一个错误拒绝（reject），错误中带有服务器的 `error_description` 或 `error`，或 HTTP 状态码。

## 代码示例

```ts
import { generateSnippet, SNIPPET_TARGETS } from '@dskripchenko/openapi'

generateSnippet('python-requests', request)
SNIPPET_TARGETS   // [{ id: 'curl', label: 'cURL', language: 'bash' }, …]
```

`generateSnippet(target, request)` 把 `HttpRequest` 打印为可运行的代码；未知的目标会抛出异常。
13 个目标列在 [代码示例](snippets.md) 中。

## 类型

文档类型（`OpenApiDocument`、`Operation`、`Parameter`、`Schema`、`SecurityScheme`
等）、HTTP 类型（`HttpRequest`、`HttpResponse`、`FormValue`）、`Position` 和
`PositionMap` 都以类型的形式导出。`HTTP_METHODS` 是路径项中八种方法的列表。
文档类型刻意定义得较为宽松：每个对象都接受 `x-*` 扩展，并且在需要对象的地方也可以是 `$ref`。
