# API 块

API 块是富内容（WYSIWYG 编辑器、markdown 页面、任意 HTML 页面）中语言为 `openapi`
的代码块。它的 YAML 或 JSON 描述一个或多个 HTTP 请求。渲染后，它成为一个实时的 API
组件——即[嵌入](embed.md)的紧凑卡片：方法和路径、参数、请求体、响应、真正发送请求的
try-it、请求示例、TypeScript 类型和 PDF。可编辑时它有三个标签页：**预览**、**源码**和
**构造器**（请求的表单）。源码和构造器是同一段文本的两种视图：在一个里修改，另一个随之更新。

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

组件界面提供英语和俄语（`locale`），可通过 `blockLabels` 覆盖文本。

## 格式

一个块包含一个请求、多个请求或整个 OpenAPI 文档。YAML 和 JSON 都可以；由第一个字符决定
（`{` 表示 JSON）。

### 单个请求

| 键 | | |
|---|---|---|
| `url` | 必填 | 绝对 URL（`https://api.example.com/v1/users/{id}`）或路径（`/users/{id}`）。`{name}` 是路径参数；查询串（`?page=1`）会生成带这些示例的查询参数。 |
| `method` | `GET` | `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`、`TRACE`，大小写均可。 |
| `summary` | | 卡片标题。 |
| `description` | | Markdown。 |
| `auth` | | 见[认证](#认证)。 |
| `params` | | `path`、`query`、`header`、`cookie`——各为 名称 → 参数。 |
| `body` | | 见[请求体与响应](#请求体与响应)。 |
| `responses` | `200: OK` | 状态码（`200`、`4XX`、`default`）→ 描述或对象。 |
| `operationId`、`tags`、`deprecated` | | 同 OpenAPI。`operationId` 默认由方法和路径生成：`POST /v1/users/{id}` → `postV1UsersById`。 |
| `title`、`version` | | 文档标题（默认为 summary）和版本。 |
| `baseUrl`、`servers` | | 见[多个请求](#多个请求)。 |
| `x-…` | | 保留在操作上。 |

未知的键会在其所在行报错并给出提示（`Unknown key "respones" — did you mean "responses"?`）。

### 类型

参数、头或 schema 属性用简写类型表示——与 laravel-api 相同：`type(format)! 描述`。

| 简写 | 含义 |
|---|---|
| `string`、`integer`、`number`、`boolean`、`object`、`array` | 类型。 |
| `string(email)`、`integer(int64)`、`string(date-time)` | 带格式。 |
| `string[]`、`integer[][]` | 数组。 |
| `file` | 文件上传：`string(binary)`。 |
| `integer!` | 必填（路径参数总是必填）。 |
| `integer! The user's id` | 第一个空格之后的文字是描述。 |

或者用对象——参数字段（`description`、`required`、`deprecated`、`example`、`style`、
`explode`、`schema`）与 schema 字段（`type`，也可用简写，`format`、`enum`、`default`、
`minimum`……）并列：

```yaml
params:
  query:
    sort: { type: string, enum: [name, date], description: Order, example: name }
    page: { type: integer!, minimum: 1 }
```

URL 中未在 `params.path` 声明的路径参数是字符串。

### 请求体与响应

```yaml
body:
  type: json            # 默认；还有 form、multipart、text、xml、binary 或任意媒体类型
  example: { name: Ann }
  schema: { ... }       # 可选：缺省时由示例推断
  description: The new user
  required: true        # 默认
responses:
  200:
    description: OK     # 默认为状态短语
    type: json
    example: { id: 7 }
    headers: { X-Rate-Limit: integer Calls left }
  404: Not found        # 仅描述
  default:              # 空："Error"
```

`schema` 是 JSON Schema，其中同样可以使用简写：属性可以是类型字符串，以 `!` 结尾的属性名
表示必填，`items` 也可以是简写。

```yaml
schema:
  type: object
  properties:
    name: string!
    email: string(email) Where receipts go
    tags!: { type: array, items: string }
```

没有 schema 时由示例推断（`inferSchema`）：按 JSON 种类推断类型，整数与其他数字区分，识别
`date-time`、`date`、`uuid`、`email` 和 `uri` 格式，数组项由所有元素合并而来。

### 认证

| `auth` | 安全方案 |
|---|---|
| `bearer` | HTTP bearer；`{ type: bearer, format: JWT }` 添加格式。 |
| `basic` | HTTP basic。 |
| `apiKey` | 位于 `X-API-Key` 头的 API 密钥；`{ type: apiKey, in: header \| query \| cookie, name: X-Key }`。 |
| `{ type: oauth2, flow, authorizationUrl, tokenUrl, scopes }` | OAuth 2.0。`flow` 为 `authorizationCode`、`clientCredentials`、`password` 或 `implicit`；省略时由 URL 决定。`scopes` 是列表或 名称 → 描述。 |
| `{ type: openIdConnect, url }` | OpenID Connect discovery。 |
| `none` | 无认证——覆盖共享的认证。 |

卡片会像参考页一样在设置抽屉中询问凭据。

### 多个请求

```yaml
title: Orders
baseUrl: https://api.example.com/v2
auth: bearer              # 每个请求的默认值
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

共享键：`title`、`description`（卡片上方的 markdown）、`version`、`baseUrl`（路径相对于它
解析，并成为服务器）、`servers`（URL 列表或 `{ url, description }`）、`auth` 和 `x-…`。没有
基础 URL 时，第一个绝对 URL 的主机就是服务器；指向其他主机的请求有自己的服务器。

### 整个文档

带有 `openapi` 或 `swagger` 键的块是 OpenAPI 3.x 或 Swagger 2.0 文档，按原样使用：每个操作
都成为一张卡片。构造器不编辑这类块，源码可以。

## 核心 API

来自 `@dskripchenko/openapi`：

```ts
import { parseBlock, stringifyBlock, blockToDocument, inferSchema } from '@dskripchenko/openapi'

const r = parseBlock(text)
if (r.ok) {
  r.document // OpenAPI 3.1
  r.kind     // 'requests' | 'document'
  r.format   // 'yaml' | 'json'
  r.data     // 解析后的文本
} else {
  r.error    // { message, line?, column?, pointer? }
}
stringifyBlock(r.data, 'json')   // YAML ↔ JSON
```

- `parseBlock(text)` 从不抛出异常。语法错误和结构错误都带有行号和列号。
- `blockToDocument(data)` 转换已解析的紧凑数据；抛出 `BlockError`（带 `pointer`）。
- `inferSchema(value)`——由示例生成 JSON Schema。
- `parseShorthand`、`formatShorthand`、`expandSchema`——类型简写。
- `blockToModel(data, format)` / `modelToBlock(model, base, format)`——构造器的表单模型及
  回写。回写是对 `base` 打补丁：表单未改动的字段保持原样（简写或对象形式、`enum`、响应头、
  `x-` 键……），因此 `modelToBlock(blockToModel(data), data).data` 等于 `data`。无法读取的
  文本（不是 JSON 的示例）保留旧值并出现在 `errors` 中。写入后调用 `syncOrigins(model)`，
  修改 URL 后调用 `syncPathParams(request)`。

## 在 Vue 中：OpenApiBlock

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiBlock } from '@dskripchenko/openapi/vue'

const source = ref('url: https://api.example.com/health\nsummary: Health check\n')
</script>

<template>
  <OpenApiBlock v-model:source="source" editable locale="en" />
</template>
```

| 属性 | 类型 | 默认值 | |
|---|---|---|---|
| `source` | `string` | — | 块的文本。修改以 `update:source` 发出，保持文本原有格式。 |
| `editable` | `boolean` | `false` | 预览 / 源码 / 构造器标签页；只读时只有预览。 |
| `tab` | `'preview' \| 'source' \| 'constructor'` | `'preview'` | 可编辑块打开时的标签页。 |
| `locale` | `string` | — | `en` 或 `ru`。 |
| `labels` | `Partial<OpenApiLabels>` | | 卡片的文本。 |
| `blockLabels` | `Partial<BlockLabels>` | | 组件自身的文本（`blockEn`、`blockRu`）。 |
| `debounce` | `number` | `300` | 构造器最后一次修改到 `update:source` 的毫秒数。 |
| `send`、`tryIt`、`snippetTargets`、`defaultSnippet`、`baseUrl`、`persistCredentials`、`oauthRedirectUrl` | | | 同 [`OpenApiOperation`](embed.md)。 |

对外暴露：`tab`、`text`、`parsed` 和 `flush()`（立即写入待处理的构造器修改）。源码标签页的
YAML / JSON 开关会转换文本（YAML 注释在转换或构造器修改后不会保留）；解析错误会显示行号。
构造器只改动你在其中改动的内容：它无法表达的内容按原样保留在源码中。

### 不用模板挂载

```ts
import { mountOpenApiBlock } from '@dskripchenko/openapi/vue'

const handle = mountOpenApiBlock(el, {
  source,
  editable: true,
  onChange: (next) => save(next),
  appContext: app._context, // 可选：宿主的 provide（kit 主题、i18n）可传到组件
})
handle.update(newSource) // 外部修改；当前标签页保持不变
handle.destroy()
```

## 块渲染器约定

按语言渲染代码块的编辑器和 markdown 视图接受**块渲染器**。`openApiBlockRenderer(options?)`
为 ` ```openapi ` 返回一个：

```ts
type BlockRenderer = (code: string, ctx: { language: string; index: number }) => BlockRenderResult | Promise<BlockRenderResult>

interface BlockRenderResult {
  html?: string
  error?: string
  /** 实时岛：以岛元素调用，返回一个 handle。 */
  mount?: (el: HTMLElement, ctx: BlockMountContext) => BlockMountHandle | (() => void) | void
}

interface BlockMountContext {
  code: string
  language: string
  /** 只读视图中为 false。 */
  editable: boolean
  /** 替换块的代码（仅可编辑时）；宿主不会因此重新渲染该岛。 */
  setCode(code: string): void
}

interface BlockMountHandle { update?(code: string): void; destroy?(): void }
```

渲染器总是返回 `{ mount }`，即使块无法读取：组件自己显示错误，可编辑时用户可以在源码或构造器
中修正。`mount` 在 `ctx.editable` 为真时以可编辑方式挂载组件，把修改交给 `ctx.setCode`，其
`update(code)` 接收外部修改（撤销、重做）而不丢失当前标签页。

```ts
import { openApiBlockRenderer } from '@dskripchenko/openapi/vue'

const renderers = { openapi: openApiBlockRenderer({ locale: 'en', appContext: app._context }) }
```

这些类型同样从 `@dskripchenko/openapi/vue` 导出。

## 无需构建：renderBlocks

[独立包](standalone.md)可在任意页面渲染块。markdown 渲染器会把 ` ```openapi ` 变成
`<pre><code class="language-openapi">`；`language-openapi-yaml` 和 `language-openapi-json`
也会被识别。

```html
<pre><code class="language-openapi">url: https://api.example.com/health
summary: Health check
</code></pre>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

带 `data-auto` 时，脚本在文档解析完成后渲染所有这样的块（并挂载 `[data-openapi-operation]`
嵌入）；标签上的 `data-openapi-theme`、`data-openapi-locale` 和 `data-openapi-proxy` 同样
作用于这些块。通过脚本：

```js
const blocks = DskOpenApi.renderBlocks('#article', { locale: 'auto', theme: 'system', proxy: '/try-it-proxy' })
blocks[0].element // 替代 <pre> 的组件元素
blocks[0].destroy()
```

`renderBlocks(root?, options?)` 接受节点或选择器（默认为整个文档），返回本次渲染的块：
`{ element, update(source), destroy() }`。已渲染的块不再是代码元素，因此添加内容后再次调用只会
渲染新块。选项：`theme`、`locale`（`en`、`ru`、`auto`）、`proxy`，以及组件选项 `tryIt`、
`labels`、`blockLabels`、`snippetTargets`、`defaultSnippet`、`baseUrl`、
`persistCredentials`、`oauthRedirectUrl`。这里的块是只读的；
`DskOpenApi.mountOpenApiBlock(el, options)` 可挂载可编辑的块。
