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

页面分为两栏。左侧是导航：全文搜索、按标签分组的操作、webhook 和 schema。
右侧是文档本身：标题、版本和描述，"Download spec" 控件，服务器与凭据面板，
然后是每个操作及其参数、请求体、响应（以带示例的 schema 树展示）、回调、请求示例和
"Try it" 面板，最后是 `components.schemas` 中的 schema。

"Download spec" 按给定时的原样保存文档——而不是归一化后的 3.1 副本——格式为 JSON 或
YAML，文件名为 `{title}-{version}.json` / `.yaml`。

如果需要带标题栏以及主题和语言切换器的整页，或者不经过构建步骤的页面，请参阅
[独立页面与 OpenApiPage](standalone.md)。

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
| `persistCredentials` | `boolean \| 'session' \| 'local'` | `false` | 在多次访问之间保存 API 密钥和令牌；见 [保存凭据](#保存凭据)。 |
| `oauthRedirectUrl` | `string` | 页面 URL | OAuth 重定向 URI；见 [OAuth2 与 OpenID Connect](#oauth2-与-openid-connect)。 |

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
| `go(anchor: string, options?: { tryIt?: boolean }): Promise<void>` | 在当前打开的规范文档中滚动到 `'operation/{id}'`、`'schema/{name}'` 或 `'tag/{name}'`——设置 `tryIt: true` 时滚动到该操作的 try-it 面板——在导航中标记它，并在启用 `hashNavigation` 时写入 hash。 |
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
`#schema/{name}`，每个标签都有锚点 `#tag/{name}`。id 就是 `operationId`；没有
`operationId`（或其 `operationId` 已被占用）的操作会得到由方法和路径生成的 slug，
例如 `GET /pets/{id}` 对应 `get-pets-id`。webhook 操作得到 `webhook-{method}-{name}`。
带多个标签的操作会显示在每个标签的分区中；只有第一份副本带有锚点，因此深层链接会落在这一份上。

当页面打开时 `location.hash` 中带有这样的锚点，或之后 hash 变为这样的锚点时，
参考页都会滚动到该处。启用 `hashNavigation`（默认）时，在导航中点击会替换 hash，
因此地址可以复制和分享；每个操作的标题处也有一个复制其链接的按钮。
如果参考页嵌在一个用 hash 做自身路由的页面中，请关闭它：

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

为 Scalar 构建的链接（`#{doc}/tag/{tag}/{METHOD}{path}`、`#model/{name}`）
会打开相同的分区，而且链接还可以携带已填好的 try-it 表单。两者都在
[深层链接与预填链接](links.md) 中说明。

## 搜索

导航顶部的搜索框在当前打开的规范文档中查找：操作（摘要、路径、操作 id、方法、标签、
参数名称和描述、描述本身、请求体和响应的属性名）、标签（名称和描述）、schema
（名称、标题、描述、属性名）以及文档描述中的标题。查询中的每个词都必须匹配；
结果按词匹配的位置排序——标题或路径比描述更重要——也按匹配方式排序：整个字段、
词的开头，或任意位置。

输入时，导航会收窄到匹配的条目，搜索框下方会展开最佳结果列表，并标出匹配的词。
**↑** 和 **↓** 在列表中移动，**Enter** 打开所选结果，**Esc** 关闭列表，
再按一次则清空搜索框。**/**（不在文本框中时）和 **Ctrl+K** / **⌘K** 把光标移到搜索框。
有多份规范文档时，搜索只覆盖当前打开的那份。

## 示例

当某个媒体类型有多个具名示例时——无论在请求体还是各个响应中——它们以标签按钮的形式显示在示例上方；
所选示例会显示其描述，通过 `externalValue` 给出的示例显示为指向它的链接（从不获取）。
没有示例时，请求体显示根据其 schema 生成的示例。

在 try-it 中，有多个示例的请求体会出现一个 "Example" 下拉框（"Generated sample"
排在第一）；选择一项会替换请求体文本。参数的具名示例以标签按钮的形式显示在参数旁，
点击其中值为简单值的一项，会把它填入 try-it 的输入框。

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
`path`、`query`、`header` 和 `cookie` 分组；带媒体类型选择器的请求体；以及 "Send"。
输入框的初始值是参数的 `example`、`default`，或者——对必填参数——根据 schema
生成的示例值；请求体的初始值是该媒体类型的第一个示例，或根据其 schema 生成的示例。

输入的内容按参数的 schema 解读：数字和布尔值会被转换，数组和对象按 JSON 读取
（数组也可以写成 `a, b, c`）。

**请求体**取决于媒体类型：

- **JSON、XML、文本** —— 一个文本框；请求体按输入原样发送。对 JSON 媒体类型，
  无效的请求体会显示警告，但仍会发送。
- 带对象 schema 的 **`multipart/form-data`** 和 **`application/x-www-form-urlencoded`**
  —— 每个属性一个字段的表单（`readOnly` 属性除外）。在 multipart 中，`format: binary`
  （或带 `contentMediaType`）的属性有文件选择器，此类属性的数组可以选择多个文件；
  可接受的类型来自 `encoding` 或 schema。"Raw JSON" 切换为以 JSON 文本编辑这些字段，
  "Form" 切换回来。
- **二进制请求体** —— `application/octet-stream`、图片、音频、视频、PDF、`format: binary`
  的 schema —— 一个文件选择器；该文件就是整个请求体。

请求进行中时，"Send" 显示 "Sending…"，并出现一个 "Cancel" 按钮；取消会中止请求
（见 [下文](#通过你的服务器发送) 的 `signal`），丢弃迟到的响应，并显示 "Cancelled"。

**响应**部分显示状态码、耗时、大小、响应头和响应体。JSON 响应体会被格式化，并有
"Pretty" / "Raw" 切换。非文本响应体（`HttpResponse.blob`）对 `image/*` 显示图片预览，
其他情况显示一个 "Download" 按钮，文件名取自 `Content-Disposition` 或
`response.{subtype}`。如果请求没有到达服务器——网络错误，或浏览器拦截了跨域请求——
面板会用浏览器给出的消息说明这一点。

面板旁边的请求示例打印的正是 "Send" 将发出的请求，包含已输入的值、已选的文件（按文件名）
和已填写的凭据。在一个操作中选择的语言会被所有操作使用。

面板中的 "Copy link" 生成一个链接，打开该操作并带上当前的表单内容；见
[预填链接](links.md#预填链接)。

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
type SendFn = (request: HttpRequest, options?: SendFnOptions) => Promise<HttpResponse>

interface SendFnOptions {
  signal?: AbortSignal                // aborted when the user presses "Cancel"
}

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // absolute, with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
    file?: { filename: string; contentType?: string; data?: Blob } // a binary body
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string                        // the body of a textual response
  blob?: Blob                         // the body of any other response
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

在页面中，一个把请求以 JSON 形式 POST 到你的后端的函数：

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request, options) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
      signal: options?.signal,
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

像上面这样把 `options.signal` 传给你自己的 `fetch`，"Cancel" 就能同时中止发往你后端的请求。
文件（表单字段的 `data` 和 `body.file` 的 `data`）是 `Blob`，经过 `JSON.stringify`
后会丢失：需要传递文件的代理应改用 `multipart/form-data` 发送请求。JSON 响应同样没有
`blob`，因此二进制响应的图片预览和下载需要一个能返回 `blob` 的传输方式。

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
确实能到达 API。

抛出异常的 `send` 会被当作网络错误处理。[认证面板](#oauth2-与-openid-connect) 的令牌请求和
discovery 请求同样经过 `send`：代理也必须放行这些主机。[`OpenApiEditor`](editor.md)
也会把 `send` 传给它的预览。独立包自带一个此类传输方式，契约固定：见
[代理](standalone.md#代理)。

## 认证

当文档声明了 `components.securitySchemes` 时，页面顶部有一个 "Authentication"
面板，每个方案一个输入项：

- **apiKey** —— 密钥；它会放进该方案指定的请求头、查询参数或 cookie；
- **http basic** —— 用户名和密码；
- **http bearer** 及其他 http 方案 —— 令牌，以 `Authorization: Bearer …`
  （或以该方案的名称）发送；
- **oauth2** 和 **openIdConnect** —— 访问令牌，以 `Authorization: Bearer …` 发送，
  可以手动输入，也可以在面板中获取。

`mutualTLS` 方案不显示：浏览器无法通过脚本提供客户端证书。

这些值作用于页面上的每个操作——既用于 "Send"，也用于示例。对每个操作，
参考页取其 `security`（或文档的 `security`），并使用第一个所有方案都已填值的要求。
带有空要求（`security: [{}]` 或 `security: []`）的操作不带凭据发送。

### OAuth2 与 OpenID Connect

对于 oauth2 方案，面板提供该方案声明的流程——有多个时提供切换：
"Authorization code"（需要 `authorizationUrl` 和 `tokenUrl`）、"Implicit"
（`authorizationUrl`）、"Client credentials" 和 "Password"（`tokenUrl`）。
openIdConnect 方案在面板打开时读取其 discovery 文档（`openIdConnectUrl`），
并提供其支持的流程，以 `scopes_supported` 作为 scope。

每个流程以复选框列出其 scope，初始时全部勾选；令牌按勾选的 scope 申请。

- **Client credentials** 和 **Password**："Client ID"、"Client secret"（以及
  "Username" / "Password"）和 "Get token"。令牌请求发往 `tokenUrl`
  （RFC 6749 §4.4、§4.3）；有 client secret 时客户端使用 HTTP Basic 认证，
  没有时 `client_id` 放入表单。
- **Authorization code**（带 PKCE，S256）和 **Implicit**："Client ID"
  （授权码流程还有可选的 "Client secret"）、"Redirect URI" 和 "Authorize"。
  登录窗口在身份提供方处打开；窗口返回后，参考页检查 `state`，对授权码流程还会在
  `tokenUrl` 处用授权码换取令牌，填写了 client secret 时 `client_secret` 放入表单
  （公共客户端只依赖 PKCE）。

令牌会填入该方案的输入框。如果服务器给出了有效期（`expires_in`），面板会显示
"expires in N min"，之后显示 "expired"；"Log out" 清除令牌。

令牌、授权码交换和 discovery 请求与 try-it 一样经过 `send`。使用默认传输方式时，
这些端点必须接受来自页面的跨域请求；使用 [代理](#通过你的服务器发送) 时，请求经由
你的服务器发出，无需 CORS。登录窗口本身是身份提供方处的普通浏览器窗口。

**重定向 URI** 是 `oauthRedirectUrl`，默认为页面自身不带 query 和 fragment 的地址；
可以在面板中修改。身份提供方必须允许它。登录结果通过以下两种方式之一到达参考页，以先到者为准：

- 参考页监视该窗口，一旦它回到重定向 URI（与页面同 origin），就读取响应；
- 重定向 URI 处的页面把响应发送给打开它的窗口，然后自行关闭。`OpenApiReference`
  在挂载时会这样做，因此文档页面本身就可以作为重定向 URI。专用的重定向页面调用
  `@dskripchenko/openapi/vue` 中的 `relayOAuthCallback()`；它只会把类型为
  `OAUTH_MESSAGE` 的消息发给同 origin 的 opener。

浏览器会拦截不是由点击打开的窗口；面板会报告窗口被拦截或被关闭，以及 `state`
不匹配的情况。同样的请求在组件之外也可使用：[`fetchOAuthToken`](core.md#oauth2-令牌)、
`buildAuthorizeUrl`、`exchangeAuthorizationCode` 等。

### 保存凭据

默认情况下，凭据在页面存续期间保存在内存中。设置 `persistCredentials` 后，
它们会在多次访问之间保留：

| 值 | 保存位置 |
|---|---|
| `false` | 不保存（默认） |
| `true` 或 `'session'` | `sessionStorage` —— 直到标签页关闭 |
| `'local'` | `localStorage` —— 直到被删除 |

它们按规范文档分别保存，键为 `dsk-openapi:credentials:{specId}:{info.title}`
（只有单个规范文档时 `specId` 为 `spec`）。会保存：API 密钥、bearer 令牌、OAuth 和
OpenID Connect 访问令牌及其有效期（过期的不会恢复），以及 basic 认证的用户名。
从不保存：basic 认证的密码、client ID 和 secret，以及 password 流程的密码。
开启保存后，面板显示 "Saved in this browser"，并有一个 "Forget" 按钮，
用于清除当前打开的规范文档的凭据，包括内存中和存储中的。

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

### 所有字符串

`OpenApiLabels` 的键及其英文文本。`expiresIn` 用分钟数替换 `{n}`。
[`OpenApiPage`](standalone.md#openapipage) 的标题栏使用 `theme`、`themeLight`、
`themeDark`、`themeSystem` 和 `language`。

| 键 | 英文 |
|---|---|
| `search` | Search |
| `operations` | Operations |
| `schemas` | Schemas |
| `webhooks` | Webhooks |
| `servers` | Server |
| `authentication` | Authentication |
| `noAuth` | No authentication |
| `parameters` | Parameters |
| `requestBody` | Request body |
| `responses` | Responses |
| `headers` | Headers |
| `required` | required |
| `deprecated` | deprecated |
| `default` | Default |
| `example` | Example |
| `examples` | Examples |
| `schema` | Schema |
| `enum` | Allowed values |
| `noBody` | No body |
| `samples` | Request samples |
| `tryIt` | Try it |
| `send` | Send |
| `sending` | Sending… |
| `response` | Response |
| `status` | Status |
| `time` | Time |
| `body` | Body |
| `clear` | Clear |
| `invalidJson` | The body is not valid JSON; it is sent as typed. |
| `networkError` | The request did not reach the server |
| `token` | Token |
| `username` | Username |
| `password` | Password |
| `getToken` | Get token |
| `clientId` | Client ID |
| `clientSecret` | Client secret |
| `scopes` | Scopes |
| `loadError` | The specification could not be read |
| `issues` | Problems in the specification |
| `callbacks` | Callbacks |
| `links` | Links |
| `externalDocs` | More |
| `terms` | Terms of service |
| `specs` | API |
| `noResults` | Nothing found |
| `version` | Version |
| `copy` | Copy |
| `show` | Show |
| `hide` | Hide |
| `copyLink` | Copy link |
| `linkCopied` | Copied |
| `includeCredentials` | Include credentials |
| `credentialsWarning` | The link will carry your keys and passwords: anyone who gets it can use them. |
| `prefilled` | Form filled from a link — check the values before sending |
| `theme` | Theme |
| `themeLight` | Light |
| `themeDark` | Dark |
| `themeSystem` | System |
| `language` | Language |
| `generatedSample` | Generated sample |
| `externalExample` | Open the example |
| `useExample` | Put into try-it |
| `searchResults` | Search results |
| `tag` | Tag |
| `section` | Section |
| `authorize` | Authorize |
| `redirectUri` | Redirect URI |
| `redirectHint` | The identity provider must allow this redirect URI. |
| `flowAuthorizationCode` | Authorization code |
| `flowImplicit` | Implicit |
| `flowClientCredentials` | Client credentials |
| `flowPassword` | Password |
| `logOut` | Log out |
| `forget` | Forget |
| `savedInBrowser` | Saved in this browser |
| `expiresIn` | expires in {n} min |
| `tokenExpired` | expired |
| `popupBlocked` | The browser blocked the sign-in window. Allow pop-ups for this page and try again. |
| `popupClosed` | The sign-in window was closed before it finished. |
| `stateMismatch` | The sign-in response does not match the request. Try again. |
| `formView` | Form |
| `rawJson` | Raw JSON |
| `file` | File |
| `cancel` | Cancel |
| `cancelled` | Cancelled |
| `pretty` | Pretty |
| `raw` | Raw |
| `download` | Download |
| `downloadSpec` | Download spec |
| `copyOperationLink` | Copy link to this operation |
| `operationLinkCopied` | Link copied |


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

[`OpenApiPage`](standalone.md#openapipage) 会把它设为自身标题栏的高度。其他变量——
导航宽度、间距、方法颜色——列在 [主题](theming.md) 中。

## 上下文

`useReference` 和 `referenceKey` 提供参考页各部分共享的状态：规范文档、字符串、
所选服务器、凭据和传输方式（`ReferenceContext`、`ServerState`）。它们被导出，
用于在参考页内部构建自定义部件；它们读取 `OpenApiReference` 提供的上下文，不能在其外部使用。
