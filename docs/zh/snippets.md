# 代码示例

`generateSnippet(target, request)` 把 `HttpRequest` 打印为可直接运行的代码：
一个完整的脚本或命令，包含 import、带查询字符串的 URL、请求头和请求体。
参考页在每个操作旁边显示同样的示例，内容来自 try-it 中输入的值。

```ts
import { generateSnippet } from '@dskripchenko/openapi'

generateSnippet('curl', {
  method: 'GET',
  url: 'https://api.example.com/v1/pets/42',
  headers: [['Authorization', 'Bearer TOKEN']],
})
// curl 'https://api.example.com/v1/pets/42' \
//   -H 'Authorization: Bearer TOKEN'
```

## 目标

`SNIPPET_TARGETS` 按以下顺序列出它们，每个目标带有 `id`、`label`
以及用于语法高亮的 `language` id。

| `id` | 标签 | 语言 | 运行要求 |
|---|---|---|---|
| `curl` | cURL | `bash` | POSIX shell 中的 curl |
| `javascript-fetch` | JavaScript (fetch) | `javascript` | 浏览器或 Node 18+；ES 模块（顶层 `await`） |
| `node-axios` | Node.js (axios) | `javascript` | Node 20+ 并安装 `axios` 包；ES 模块 |
| `php-guzzle` | PHP (Guzzle) | `php` | PHP 7.3+，并通过 Composer 安装 `guzzlehttp/guzzle` |
| `php-laravel` | PHP (Laravel Http) | `php` | Laravel 应用（`Http` facade）；PHP 7.3+ |
| `python-requests` | Python (requests) | `python` | Python 3 并安装 `requests` 包 |
| `go-native` | Go (net/http) | `go` | Go，仅标准库 |
| `java-httpclient` | Java (HttpClient) | `java` | Java 15+（`java.net.http`） |
| `csharp-httpclient` | C# (HttpClient) | `csharp` | C# 11+（.NET 7+），顶级语句 |
| `kotlin-okhttp` | Kotlin (OkHttp) | `kotlin` | Kotlin 与 OkHttp 4 |
| `swift-urlsession` | Swift (URLSession) | `swift` | Swift 与 Foundation |
| `http-raw` | HTTP | `http` | —— 请求在线路上的原始形式 |
| `powershell` | PowerShell | `powershell` | PowerShell 7+（`Invoke-RestMethod`） |

版本要求来自用于多行请求体的语言特性：Java 文本块（15）、C# 原始字符串字面量（11）、
PHP 灵活 nowdoc（7.3）。multipart 示例使用的 `-Form` 需要 PowerShell 7。
Kotlin 使用 `trimIndent()` 原始字符串，Swift 使用多行字面量，Go 使用原始字符串字面量，
PowerShell 使用 here-string。无法这样书写的请求体——包含控制字符，或会提前结束字面量——
会退回为普通的带引号字符串，因此示例总能运行。

每种语言的字符串都按其自身规则转义：curl 使用 shell 单引号，PowerShell 使用双写引号，
Java 使用八进制转义，Kotlin 原始字符串中的 `$` 等等。在客户端接受原生字面量的地方，
JSON 请求体会变为原生字面量（Guzzle 和 Laravel 用 PHP 数组，Python 用 dict，
fetch 和 axios 用对象字面量）；否则保持为文本。含有超出 double 精度的整数的请求体
始终保持为文本，因此不会丢失数字。

## 请求体

- **JSON、XML、文本** —— 以文本或原生字面量（见上文）给出请求体。
- **`application/x-www-form-urlencoded`** —— 客户端的表单类型
  （curl 的 `--data-urlencode`、`URLSearchParams`、Guzzle 的 `form_params`、
  requests 的 `data=`……），逐个字段写出。
- **`multipart/form-data`** —— 客户端的 multipart 构建器：curl 的 `-F`、
  `FormData`、Guzzle 的 `multipart`、Laravel 的 `attach`、requests 的 `files=`、
  Go 的 `mime/multipart`、C# 的 `MultipartFormDataContent`、OkHttp 的
  `MultipartBody`、PowerShell 的 `-Form`。没有 multipart 构建器的 Java 和 Swift
  会用 boundary 手工拼装请求体。
- **二进制请求体**（`body.file`：图片、`application/octet-stream`……）—— 文件本身，
  连同其 `Content-Type`：curl 的 `--data-binary '@rex.png'`、PowerShell 的 `-InFile`、
  作为 Guzzle `body` 的 `fopen`、Laravel 的 `withBody(file_get_contents(…))`、requests 的
  `data=open(…, 'rb')`、axios 的 `readFile`、Go 的 `os.Open`、Java 的
  `BodyPublishers.ofFile`、C# 的 `ByteArrayContent`、OkHttp 的 `asRequestBody`、
  Swift 的 `Data(contentsOf:)`，fetch 则使用文件输入框中的文件。

## 文件

文件——multipart 请求体的字段或二进制请求体，在请求中为 `{ filename, contentType? }`——
按文件名引用，即脚本旁边的一个路径。对 multipart 字段：

- curl：`-F 'photo=@rex.png;type=image/png'`；
- PHP：`fopen('rex.png', 'r')`；Python：`open('rex.png', 'rb')`；
- Node (axios)：来自 `node:fs` 的 `await openAsBlob('rex.png', { type: 'image/png' })`；
- Go、Java、C#、Kotlin、Swift：从 `rex.png` 读取文件；
- PowerShell：`Get-Item -LiteralPath 'rex.png'`；
- JavaScript (fetch) 面向网页，从 `document.querySelector('input[type="file"]')`
  获取文件；
- HTTP 用 `<contents of rex.png>` 代替字节内容。

在客户端允许的地方，文件的 `contentType` 会被传递。

## 请求头

请求头按请求中的原样打印，只有客户端强加的少数例外。multipart 的 `Content-Type`
交给客户端，由它加上 boundary。Java 的 `HttpClient` 拒绝设置 `Connection`、
`Content-Length`、`Expect`、`Host` 和 `Upgrade`，因此 Java 示例会省略它们。
当客户端根据请求体自行设置 `Content-Type` 时（例如 axios 接收一个对象），该请求头不再重复。

原始 HTTP 示例会把绝对 URL 拆成请求行和 `Host` 请求头；相对 URL 则没有 `Host`。
