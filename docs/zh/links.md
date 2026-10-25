# 深层链接与预填链接

参考页能读取两类地址：指向某个分区的链接，以及打开某个操作并预先填好其 try-it 表单的链接。

## 分区锚点

参考页自身的锚点就是其各分区元素的 id：

| 锚点 | 打开 |
|---|---|
| `#operation/{id}` | 一个操作——`{id}` 是 `operationId`，或诸如 `get-pets-id` 的 slug |
| `#schema/{name}` | `components.schemas` 中的一个 schema |
| `#tag/{name}` | 一个标签的分区 |

页面上有 [多份规范文档](reference.md#多份规范文档) 时，每个锚点都以规范文档的 id
开头——`#v1/operation/getPet`——单独的 `#v1` 则打开该规范文档。

地址在页面打开时读取，之后每次 hash 变化时也会读取。启用 `hashNavigation`（默认）时，
在导航中点击会把该分区的锚点写入地址，每个操作的标题处也有一个复制其链接的按钮。

## Scalar 链接

为 Scalar 页面构建的链接同样能被理解，因此已有的链接——来自 laravel-api 的 `DocLink`、
它的 IDE 插件、书签——在切换之后依然有效：

| Scalar 形式 | 打开 |
|---|---|
| `#[{doc}/]tag/{tagSlug}/{METHOD}{path}` | 具有该方法和路径的操作 |
| `#[{doc}/]tag/{tagSlug}` | 该标签的分区 |
| `#[{doc}/]model/{name}` | 该 schema |

例如 `#v1/tag/pets/GET/pets/{id}` 打开规范文档 `v1` 中的 `GET /pets/{id}`。

各部分的匹配方式：

- **文档段**指向 id 与它相同的规范文档；否则指向 id 或名称按 Scalar 规则 slug 化后与它相同的
  规范文档（对于版本号，点和斜杠变为连字符，因此名为 `v1.1` 的规范文档对应 `v1-1`）。
  不指向任何规范文档、但位于某个分区之前的段——单规范文档页面上的 `v1/tag/…`——会被忽略，
  此时指的是当前打开的规范文档。
- **标签名和 schema 名**按 slug 比较：`Pet Store` 匹配 `pet-store`。
- **路径**匹配操作的路径，或在其前面加上某个服务器的 base path 后的路径（反之亦然），
  因此由完整 URI `/api/v2/pets` 构建的链接，能在服务器为 `…/api/v2` 的规范文档中找到 `/pets`。
  找不到该操作时，链接打开其标签。

启用 `hashNavigation` 时，地址随后会被替换为规范的锚点，因此重新加载或复制时得到的是参考页自身的形式。

`scalarSlug(text)` 和 `scalarDocumentSlug(version)`——即 slug 规则——从
`@dskripchenko/openapi` 导出，便于在别处构建此类链接。

## 预填链接

预填链接打开一个操作，并填好其 try-it 表单：参数、请求体、服务器，以及可选的凭据。
**它本身不会发送任何请求**：读者会在已填好的表单旁看到一条提示——"Form filled from a link —
check the values before sending"——页面会滚动到该表单，读者准备好后再按 "Send"。

### Copy link

每个操作的 try-it 面板都有一个 "Copy link" 按钮：它复制一个带有当前表单内容的预填链接，
其中包括表单自己添加的 query、header 和 cookie 行。
除非勾选 "Include credentials"，否则凭据不会包含在内——该选项默认关闭，并会警告：
任何拿到链接的人都能使用这些凭据。

为了让链接保持简短，编码器会省略页面能自行填充的内容：空值、第一个服务器（索引 0）
以及取默认值的服务器变量、第一个媒体类型，以及与生成的示例相同的请求体。文件从不放进链接。

表单填好之后（启用 `hashNavigation` 时），地址会被替换为该操作的普通锚点，
因此重新加载不会再次填写表单，凭据也会离开地址栏。

### 格式

该格式是稳定的，版本为 1。其他工具也可以构建这种链接——laravel-api 就用 PHP 构建。

```text
{page}#{anchor}?f={payload}        the payload in the hash
{page}?oa-f={payload}#{anchor}     or as a query parameter (the hash wins)
```

`{anchor}` 是一个操作锚点，可以是规范形式（`[{spec}/]operation/{id}`），也可以是
Scalar 形式（`{doc}/tag/{tag}/{METHOD}{path}`）。`{payload}` 是一个字符加上 base64url
（RFC 4648 §5，不带填充）：

- `z` + 用原始 DEFLATE（RFC 1951）压缩后的 UTF-8 JSON 的 base64url——浏览器中用
  `CompressionStream('deflate-raw')`，PHP 中用 `gzdeflate()`；
- `j` + UTF-8 JSON 本身的 base64url。

JSON：

```json
{
  "v": 1,
  "server": 0,
  "vars": { "region": "us" },
  "path": { "id": "42" },
  "query": { "limit": "10" },
  "header": { "X-Trace": "abc" },
  "cookie": { "session": "…" },
  "mediaType": "application/json",
  "body": "{\"name\":\"Rex\"}",
  "auth": { "bearerAuth": "token", "basicAuth": { "username": "u", "password": "p" } },
  "xQuery": [["debug", "1"]],
  "xHeader": [["X-Request-Id", "42"]],
  "xCookie": [["theme", "dark"]]
}
```

| 键 | |
|---|---|
| `v` | 版本：`1`。必填。 |
| `server` | 操作的服务器列表中的索引，或一个服务器 URL。与某个服务器匹配的 URL（按原样，或填入 `vars` 后）会选中该服务器；其他任何 URL 成为自定义服务器。 |
| `vars` | 服务器变量。 |
| `path`、`query`、`header`、`cookie` | 按输入原样给出的参数值，均为字符串，按参数名给出（header 名不区分大小写）。 |
| `mediaType` | 请求体的媒体类型，前提是该操作接受它。 |
| `body` | 按输入原样给出的请求体文本。 |
| `auth` | 按安全方案名给出的凭据：密钥或令牌，或 `{ username, password }`。 |
| `xQuery`、`xHeader`、`xCookie` | 规范文档未声明的 query 参数、请求头和 cookie——即 try-it 表单自己添加的行——以 `[name, value]` 对的形式按顺序给出。 |

除 `v` 以外的所有键都是可选的，未知的键会被忽略。值中的数字和布尔值按其文本读取；
其他值被丢弃。格式错误、解压后超过 1 MB，或 `v` 不等于 1 的载荷会被忽略
（更高版本会在控制台给出警告），此时链接只是打开该操作。`x*` 键是在不改变版本号的情况下
加入版本 1 的：不认识它们的读取方会忽略它们，不带它们的链接仍按原来的方式读取。

在 PHP 中：

```php
$data = [
    'v' => 1,
    'path' => ['id' => '42'],
    'body' => '{"name":"Rex"}',
    'xHeader' => [['X-Request-Id', '42']],
];
$payload = 'z' . rtrim(strtr(base64_encode(gzdeflate(json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))), '+/', '-_'), '=');
$link = "https://example.com/docs#v1/operation/updatePet?f={$payload}";
```

`path`、`query`、`header`、`cookie`、`vars` 和 `auth` 是关联数组（JSON 对象）；
`xQuery`、`xHeader` 和 `xCookie` 是由两元素列表组成的列表（JSON 数组）——在这里用关联数组
会被编码为对象，从而被忽略。

在 TypeScript 中，使用核心：

```ts
import { encodePrefill, prefillHash } from '@dskripchenko/openapi'

const payload = await encodePrefill({ v: 1, path: { id: '42' } })
const link = `https://example.com/docs#${prefillHash('v1/operation/updatePet', payload)}`
```

`encodePrefill(data, { compress? })` 在有 `CompressionStream` 时生成 `z` 载荷，
否则生成 `j` 载荷；`decodePrefill(payload)` 返回数据或 `null`；`prefillHash(anchor, payload)`
给出 `{anchor}?f={payload}`。`PREFILL_VERSION` 为 `1`；类型为 `PrefillData` 和
`PrefillValues`。

## 核心函数

全部从 `@dskripchenko/openapi` 导出：

| | |
|---|---|
| `splitLink(hash)` | `{ anchor, payload? }`：hash 中的锚点（已解码）和 `?f=` 载荷。 |
| `pickSpec(anchor, specs)` | `{ spec?, rest }`：文档段指向 `LinkSpec[]`（`{ id, name? }`）中的哪份规范文档，以及锚点的其余部分。 |
| `resolveSection(rest, spec)` | 对于参考页自身或 Scalar 的形式，给出已加载规范文档中的规范分区——`operation/{id}`、`schema/{name}` 或 `tag/{name}`——或 `null`。 |
| `scalarSlug(text)`、`scalarDocumentSlug(version)` | Scalar 的 slug 规则。 |
| `encodePrefill`、`decodePrefill`、`prefillHash`、`PREFILL_VERSION` | 预填链接，见上文。 |
