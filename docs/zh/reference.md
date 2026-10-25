# OpenApiReference

为 Swagger 2.0、OpenAPI 3.0 或 OpenAPI 3.1 规范文档生成的 API 参考页——
也可以同时展示多份规范文档，并带切换器（见 [多份规范文档](#多份规范文档)）。

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

页面分为两栏。左侧是导航：搜索框、按标签分组的操作、webhook 和 schema。
右侧是文档本身：标题、版本和描述，服务器与凭据面板，然后是每个操作及其参数、
请求体、响应（以带示例的 schema 树展示）、回调、请求示例和 "Try it" 面板，
最后是 `components.schemas` 中的 schema。

来自规范文档的链接——`info` 中的联系人、许可证和服务条款 URL，以及操作的
`externalDocs`——只有在是 `http(s)`、`mailto` 或相对地址时才会显示；其他链接一律省略。

宽度小于 1100 px 时，示例和 try-it 移到操作描述的下方；小于 760 px 时，
导航移到文档上方。

## Prop

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `spec` | `SpecInput` | — | 规范文档：YAML 或 JSON 文本、已解析的对象，或返回二者之一的 promise 的函数。 |
| `specs` | `SpecSource[]` | — | 在一个页面上放多份规范文档，替代 `spec`。见 [多份规范文档](#多份规范文档)。 |
| `active` | `string` | 第一份规范文档 | 当前打开的规范文档的 id；使用 `v-model:active`。 |
| `send` | `SendFn` | 页面的 `fetch` | 发送 try-it 请求。见 [代理](#通过你的服务器发送)。 |
| `tryIt` | `boolean` | `true` | `false` 隐藏 try-it 面板；示例保留。 |
| `locale` | `string` | — | `'en'` 或 `'ru'`。见 [语言](#语言)。 |
| `labels` | `Partial<OpenApiLabels>` | `{}` | 覆盖单个界面字符串。 |
| `snippetTargets` | `SnippetTarget[]` | 全部 13 个 | 请求示例中提供的语言。 |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | 首先显示的语言。 |
| `baseUrl` | `string` | 页面的 origin | 解析相对服务器 URL 时所基于的地址。 |
| `external` | `(url: string) => unknown \| undefined` | — | 加载外部 `$ref` 文档。没有它则不加载任何外部文档。 |
| `hashNavigation` | `boolean` | `true` | 从导航打开条目时写入 `location.hash`。 |

如果是函数，规范文档会在首次显示时加载，期间显示加载指示器。`spec` 或 `external`
变化时，规范文档会重新加载。两者都按引用比较：
请传入新对象，而不要原地修改旧对象；并保持 `external` 函数稳定
（在 `<script setup>` 中定义一次，而不是在模板里内联）。

## 事件

| 事件 | 载荷 | |
|---|---|---|
| `loaded` | `LoadedSpec`、`id: string` | 每次成功加载之后：归一化后的文档、其操作和分组（见 [`loadSpec`](core.md#加载规范文档)），以及该规范文档的 id。 |
| `error` | `Error`、`id: string` | 规范文档无法读取：`YamlError`、`JsonError` 或 `OpenApiError`，或加载函数自身抛出的错误。页面在参考内容的位置显示该消息。 |
| `update:active` | `id: string` | 通过切换器、深层链接或 `open` 打开了另一份规范文档。 |

只有单个 `spec` 时，id 为 `'spec'`。

## 暴露的成员

通过模板 ref 访问：

| | |
|---|---|
| `go(anchor: string): Promise<void>` | 在当前打开的规范文档中滚动到 `'operation/{id}'`、`'schema/{name}'` 或 `'tag/{name}'`，在导航中标记它，并在启用 `hashNavigation` 时写入 hash。 |
| `open(id: string): Promise<void>` | 打开 `specs` 中的另一份规范文档，必要时加载它。 |
| `spec` | 当前打开的规范文档的 `LoadedSpec`；加载期间或无法读取时为 `null`。 |
| `active` | 当前打开的规范文档的 id。 |

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const reference = ref<InstanceType<typeof OpenApiReference> | null>(null)
const openPets = () => reference.value?.go('operation/listPets')
</script>

<template>
  <button @click="openPets">List pets</button>
  <OpenApiReference ref="reference" :spec="text" />
</template>
```

## 深层链接

每个操作都有锚点 `#operation/{id}`，`components.schemas` 中的每个 schema 都有锚点
`#schema/{name}`。id 就是 `operationId`；没有 `operationId`（或其 `operationId`
已被占用）的操作会得到由方法和路径生成的 slug，例如 `GET /pets/{id}` 对应
`get-pets-id`。webhook 操作得到 `webhook-{method}-{name}`。

带多个标签的操作会显示在每个标签的分区中；只有第一份副本带有锚点，
因此深层链接会落在这一份上。

标签带有锚点 `#tag/{name}`。当页面打开时 `location.hash` 中带有这样的锚点，或之后
hash 变为这样的锚点时，参考页都会滚动到该处。启用
`hashNavigation`（默认）时，在导航中点击会替换 hash，因此地址可以复制和分享。
如果参考页嵌在一个用 hash 做自身路由的页面中，请关闭它：

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

## 多份规范文档

`specs` 把多份规范文档——多个 API，或同一 API 的多个版本——放在一个页面上：

```ts
interface SpecSource {
  id: string          // used in deep links and v-model:active
  name?: string       // shown in the switcher
  spec: SpecInput     // string | object | (() => Promise<string | object>)
}
```

这两个类型都从 `@dskripchenko/openapi/vue` 导出。规范文档多于一份时，导航顶部会出现
一个可搜索的下拉框，用来在它们之间切换。它显示每份规范文档的 `name`；没有时显示
已加载规范文档的标题；再没有时显示其 id。它的无障碍名称取自 `specs` 标签。

以函数形式给出的规范文档会在首次打开时加载——期间显示加载指示器；加载失败时，
切换器仍留在错误信息上方，以便选择另一份规范文档。已加载的规范文档按其 id
保留，因此切回时是即时的；设置了 `external` 时，只要来源变化，保留的规范文档就会被丢弃。

例如，后端按 API 版本提供的规范文档，每份只在读者打开时才获取：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference, type SpecSource } from '@dskripchenko/openapi/vue'

const specs: SpecSource[] = [
  { id: 'v1', name: 'API v1', spec: () => fetch('/api/doc/v1').then((r) => r.json()) },
  { id: 'admin', name: 'Admin API', spec: () => fetch('/api/doc/admin').then((r) => r.json()) },
]
const active = ref('v1')
</script>

<template>
  <OpenApiReference v-model:active="active" :specs="specs" locale="en" />
</template>
```

只要来源不变，保留的规范文档就会被复用。对加载函数而言，"不变"指"仍然是函数"：
同一 id 下的新函数会复用已加载的结果，因此在模板里内联书写的 `specs` 数组不会在每次渲染时
重新请求。文本和对象按引用比较：同一 id 下的新字符串或新对象是新的来源，会重新加载。

切换时哪些保留、哪些重置：

- 在认证面板中输入的凭据按规范文档分别保留，读者回到该规范文档时会恢复；
- 服务器选择重置为所打开规范文档的第一个服务器；
- 搜索框被清空；
- 为示例选择的语言保持不变。

有多份规范文档时，锚点带上规范文档的 id：`#{id}/operation/{opId}`、
`#{id}/schema/{name}` 和 `#{id}/tag/{name}`，单独的 `#{id}` 则打开该规范文档。
打开这样的地址——无论是页面加载时还是 hash 变化时——会先打开该规范文档，再打开对应分区。
`go` 接受不带 id 的锚点，作用于当前打开的规范文档；`open(id)` 用于切换规范文档。
只有一个元素的 `specs` 数组与 `spec` 的表现相同：没有切换器，锚点中也没有 id。

## Try it

每个操作（webhook 除外）都有一个 "Try it" 面板：每个参数一个输入框，按
`path`、`query`、`header` 和 `cookie` 分组；一个带媒体类型选择器的请求体文本框；
以及 "Send"。输入框的初始值是参数的 `example`、`default`，或者——对必填参数——
根据 schema 生成的示例值；请求体的初始值是该媒体类型的示例，或根据其 schema
生成的示例。

输入的内容按参数的 schema 解读：数字和布尔值会被转换，数组和对象按 JSON 读取
（数组也可以写成 `a, b, c`）。请求体按输入原样发送；对 JSON 媒体类型，
无效的请求体会显示警告，但仍会发送。对于 `application/x-www-form-urlencoded`
和 `multipart/form-data` 请求体，请把字段写成一个 JSON 对象。文本框没有文件选择器：
multipart 请求体中的文件字段发送时没有内容。

面板旁边的请求示例打印的正是 "Send" 将发出的请求，包含已输入的值和已填写的凭据。
在一个操作中选择的语言会被所有操作使用。

响应部分显示状态码、耗时、响应头和响应体；JSON 响应体会被格式化。如果请求没有到达服务器——
网络错误，或浏览器拦截了跨域请求——面板会用浏览器给出的消息说明这一点。

### 凭据与 cookie

默认情况下，请求通过页面的 `fetch` 以 `credentials: 'same-origin'` 发送：
浏览器只会把页面的 cookie 附加到发往页面自身 origin 的请求上，绝不会发给外部 API。

默认传输方式受两条浏览器规则约束。跨域的 API 必须允许页面的 origin（CORS），
否则浏览器会拦截响应。另外，浏览器会丢弃禁止脚本设置的请求头——`Cookie`、`Host`、
`Origin` 等——即使规范文档中声明了它们。

### 通过你的服务器发送

传入 `send`，即可让 try-it 经由你自己的后端发送。它接收面板构建好的请求，
并返回响应：

```ts
type SendFn = (request: HttpRequest) => Promise<HttpResponse>

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // absolute, with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

在页面中，一个把请求以 JSON 形式 POST 到你的后端的函数：

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`Proxy answered ${response.status}`)
    return (await response.json()) as HttpResponse
  } catch (error) {
    return {
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      duration: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

```vue
<OpenApiReference :spec="text" :send="send" />
```

URL 总是绝对地址：相对的服务器 URL，以及没有 `servers` 的文档所用的 `/`，
都会基于 `baseUrl` 解析。在后端，端点读取 `HttpRequest`，
检查其 URL 指向你允许的主机，执行请求，并以 `HttpResponse` 作答。在 Node 20+
中，发送这一步可以直接交给核心自带的 `sendRequest`：

```ts
import { sendRequest, type HttpRequest, type HttpResponse } from '@dskripchenko/openapi'

const ALLOWED_HOSTS = new Set(['api.example.com'])

export async function proxy(request: HttpRequest): Promise<HttpResponse> {
  const host = new URL(request.url).host
  if (!ALLOWED_HOSTS.has(host)) {
    return { status: 0, statusText: '', headers: [], body: '', duration: 0, error: `Host ${host} is not allowed` }
  }
  return sendRequest(request)
}
```

请像保护后台其他部分一样保护这个端点：一个替任何人调用任意主机的代理就是开放中继。
服务器不受浏览器禁止请求头列表的限制，因此经由它，`Cookie` 以及规范文档声明的其他请求头
确实能到达 API。文件字段到达时是不带数据的 `{ filename, contentType }`，
因为面板本来就没有数据可发送。

抛出异常的 `send` 会被当作网络错误处理。[认证面板](#获取-oauth2-令牌) 的 "Get token"
请求同样经过 `send`：代理也必须放行令牌端点所在的主机。[`OpenApiEditor`](editor.md)
也会把 `send` 传给它的预览。

## 认证

当文档声明了 `components.securitySchemes` 时，页面顶部有一个 "Authentication"
面板，每个方案一个输入项：

- **apiKey** —— 密钥；它会放进该方案指定的请求头、查询参数或 cookie；
- **http basic** —— 用户名和密码；
- **http bearer** 及其他 http 方案 —— 令牌，以 `Authorization: Bearer …`
  （或以该方案的名称）发送；
- **oauth2** 和 **openIdConnect** —— 访问令牌，以 `Authorization: Bearer …` 发送。

`mutualTLS` 方案不显示：浏览器无法通过脚本提供客户端证书。

这些值作用于页面上的每个操作——既用于 "Send"，也用于示例。对每个操作，
参考页取其 `security`（或文档的 `security`），并使用第一个所有方案都已填值的要求。
带有空要求（`security: [{}]` 或 `security: []`）的操作不带凭据发送。

### 获取 OAuth2 令牌

对于带有 `tokenUrl` 的 `clientCredentials` 或 `password` 流程的 oauth2 方案，
面板还提供 "Client ID"、"Client secret"（对 `password` 流程，还有 "Username" 和
"Password"）输入框以及一个 "Get token" 按钮。该按钮向 `tokenUrl` 发送令牌请求
（RFC 6749 §4.3 和 §4.4），并带上该流程声明的所有 scope；返回的访问令牌会填入该方案的令牌输入框。
有 client secret 时，客户端使用 HTTP Basic 认证；没有时，`client_id` 放入表单。
当方案同时具有两种流程时，使用 `clientCredentials`。

令牌请求与 try-it 一样经过 `send`。使用默认传输方式时，令牌端点必须接受来自页面的跨域请求；
使用 [代理](#通过你的服务器发送) 时，请求经由你的服务器发出，无需 CORS。
对于 `implicit` 和 `authorizationCode` 流程，请在别处获取令牌，然后粘贴到令牌输入框中。
同样的请求在组件之外以 [`fetchOAuthToken`](core.md#oauth2-令牌) 提供。

## 服务器

当文档有 `servers` 时，"Server" 面板会列出它们，另加 "…" 用于填写你自己的 URL。
每个服务器变量各有一个输入项——变量有 `enum` 时为下拉选择——并预填其 `default`。
声明了自己 `servers` 的操作或路径使用自己的列表，选中的位置相同。

相对的服务器 URL（`/v1`）会基于 `baseUrl` 解析，`baseUrl` 默认为页面的 origin；
没有 `servers` 的文档以 `baseUrl` 的 `/` 作为调用地址。
当参考页与 API 不在同一 origin 时，请设置它：

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## 请求示例

示例选择器按给定顺序提供 `snippetTargets` 中的语言；`defaultSnippet`
是首先显示的那个，若它不在列表中，则显示列表中的第一个。只提供其中几种：

```vue
<OpenApiReference
  :spec="text"
  :snippet-targets="['curl', 'javascript-fetch', 'php-laravel', 'python-requests']"
  default-snippet="php-laravel"
/>
```

各目标的 id 及其运行要求列在 [代码示例](snippets.md) 中。

## 语言

`locale` 选择界面字符串：本包自带英语（`'en'`）和俄语（`'ru'`）。不设置 `locale`
时字符串为英语。`labels` 在此基础上覆盖单个字符串：

```vue
<OpenApiReference :spec="text" locale="en" :labels="{ tryIt: 'Run', send: 'Run request' }" />
```

如需其他语言，请把完整的字典作为 `labels` 传入。其类型为 `OpenApiLabels`，
可以从英语字典 `en` 开始：

```ts
import { en, type OpenApiLabels } from '@dskripchenko/openapi/vue'

const de: OpenApiLabels = { ...en, search: 'Suche', tryIt: 'Ausprobieren', send: 'Senden' /* … */ }
```

```vue
<OpenApiReference :spec="text" :labels="de" />
```

`en`、`ru` 和 `LOCALES`（`{ en, ru }`）从 `@dskripchenko/openapi/vue` 导出。

### kit 自身的字符串

参考页内部的 kit 组件——下拉选择、代码块、输入框——有它们自己的字符串：复制按钮、
下拉选择中的搜索等。设置 `locale="en"` 或 `locale="ru"` 时，参考页会用 kit 的
`UidLocaleProvider` 包裹自身，并使用对应的 kit 语言包。不设置 `locale`（或设为其他值）时，
它不添加 provider，kit 组件跟随宿主的 `UidLocaleProvider`；如果宿主也没有，kit
的默认语言是俄语。因此，使用其他语言的页面要在参考页外面设置自己的 provider：

```vue
<UidLocaleProvider :locale="kitLocale"> <!-- a kit locale object -->
  <OpenApiReference :spec="text" :labels="de" />
</UidLocaleProvider>
```

## 外部引用

指向其他文件的 `$ref`（`common.yaml#/components/schemas/Error`）只能通过
`external` prop 解析。没有它，这类引用保持未解析状态，只显示其名称。该函数同步地接收
引用中原样书写的 URL 部分（`common.yaml`），并返回解析后的文档；没有该文档时返回
`undefined`。每次加载中，每个 URL 只会被询问一次。

由于调用是同步的，请先加载这些文件：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { parseSpec } from '@dskripchenko/openapi'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const text = ref<string | null>(null)
const files = new Map<string, unknown>()
const external = (url: string) => files.get(url)

onMounted(async () => {
  for (const name of ['common.yaml']) {
    files.set(name, parseSpec(await (await fetch(`/specs/${name}`)).text()).value)
  }
  text.value = await (await fetch('/specs/openapi.yaml')).text()
})
</script>

<template>
  <OpenApiReference v-if="text" :spec="text" :external="external" />
</template>
```

外部文档中指向同一文档内部的引用（`#/Pet`）在该文档内解析。本包自身从不主动获取任何内容。

## 固定页头下的布局

导航和示例栏是 sticky 的。在固定的站点页头下，把 `--oa-sticky-top`
设为页头高度，它们就会停在页头下方；锚点也滚动到相同的偏移处：

```css
:root {
  --oa-sticky-top: 64px;
}
```

其他变量——导航宽度、间距、方法颜色——列在 [主题](theming.md) 中。

## 上下文

`useReference` 和 `referenceKey` 提供参考页各部分共享的状态：规范文档、字符串、
所选服务器、凭据和传输方式（`ReferenceContext`、`ServerState`）。它们被导出，
用于在参考页内部构建自定义部件；它们读取 `OpenApiReference` 提供的上下文，不能在其外部使用。
