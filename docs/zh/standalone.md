# 独立页面与 OpenApiPage

如果想得到一整个文档页面，而不是应用内部的一个组件，有两种方式：

- **独立包**——在任意 HTML 页面上放一个 `<script>`，无需构建步骤，项目中也不需要 Vue；
- **`OpenApiPage`**——一个 Vue 组件：带顶部标题栏的参考页，标题栏上有标题以及主题和语言切换器。

独立包就是连同 Vue、kit 和所有样式一起打包的 `OpenApiPage`。

## 独立包

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
    <script>
      DskOpenApi.createApiReference('#app', {
        sources: [
          { url: '/docs/v1.json', title: 'API v1', slug: 'v1' },
          { url: '/docs/admin.yaml', title: 'Admin API', slug: 'admin' },
        ],
      })
    </script>
  </body>
</html>
```

`dist/standalone.js` 是一个经典脚本（IIFE），定义全局变量 `DskOpenApi`。它内含 Vue、
`@dskripchenko/ui` 和所有样式表，并自行把 CSS 加到页面上（只加一次，即使脚本被引入两次）。
它还会设置 `body { margin: 0 }`：该页面本就打算占据整个窗口。同样的 CSS 也以
`dist/standalone.css` 发布，供更喜欢用 `<link>` 的页面使用。在打包工具中，这两个文件分别是
`@dskripchenko/openapi/standalone` 和 `@dskripchenko/openapi/standalone.css`。

### createApiReference

```ts
DskOpenApi.createApiReference(target, options) // → { app, unmount, setTheme, setLocale }
```

`target` 是一个 CSS 选择器或一个元素；没有匹配的元素时会抛出异常。返回值：

| | |
|---|---|
| `app` | Vue 应用。 |
| `unmount()` | 移除页面。 |
| `setTheme(theme)` | `'light'`、`'dark'` 或 `'system'`。 |
| `setLocale(locale)` | `'en'`、`'ru'` 或 `'auto'`。 |

选项：

| 选项 | 类型 | 默认值 | |
|---|---|---|---|
| `sources` | `{ url?, content?, title?, slug? }[]` | — | 规范文档，每份一项。 |
| `url` | `string` | — | 不使用 `sources` 时的单份规范文档：从哪里获取。 |
| `content` | `string \| object` | — | 不使用 `sources` 时的单份规范文档：规范文档本身。 |
| `locale` | `'en' \| 'ru' \| 'auto'` | `'auto'` | `'auto'` 跟随浏览器语言：任何 `ru*` 为俄语，否则为英语。 |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | `'system'` 实时跟随 `prefers-color-scheme`。 |
| `persistTheme` | `boolean` | `false` | 记住访问者选择的主题（localStorage）；之后记住的主题优先于 `theme`。 |
| `proxy` | `string` | — | 执行 try-it 请求的端点；见 [代理](#代理)。 |
| `baseUrl` | `string` | 页面的 origin | 解析相对服务器 URL 时所基于的地址。 |
| `snippetTargets` | `SnippetTarget[]` | 全部 13 个 | 提供的示例语言。 |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | 首先显示的语言。 |
| `tryIt` | `boolean` | `true` | `false` 隐藏 try-it 面板。 |
| `title` | `string` | 当前打开的规范文档的标题 | 标题栏的标题；同时设置 `document.title`。 |

一个来源：

- `url` —— 获取规范文档的地址，JSON 或 YAML，带同源 cookie。首次打开该规范文档时才获取。
- `content` —— 规范文档本身，文本或对象。它优先于 `url`。
- `title` —— 规范文档切换器中的标签；默认为规范文档自身的标题。
- `slug` —— 规范文档的 id，用于深层链接（`#v1/operation/…`）。没有它时，id 为标题的 slug，
  再没有时按位置为 `api-1`、`api-2`……重复的 id 会追加 `-2`、`-3`……

只有一个来源时没有切换器，锚点中也不带 id；有多个时，见
[多份规范文档](reference.md#多份规范文档)。页面的语言切换器还会设置 `<html lang>`。

### 代理

设置 `proxy` 后，try-it 和认证面板的令牌请求都经由该端点发出，而不是直接从浏览器发出。契约如下：

- 页面发送 `POST {proxy}`，带 `Content-Type: application/json`、`Accept: application/json`
  和同源 cookie。如果页面有 `<meta name="csrf-token" content="…">`（Laravel 的惯例），
  其值放在 `X-CSRF-TOKEN` 请求头中。
- 请求体是 JSON 形式的 `HttpRequest`：
  `{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`。
  `url` 是绝对地址。表单中的文件字段以 `{ filename, contentType? }` 的形式到达；
  文件的字节不会发送。
- 端点根据其允许的主机检查 URL，执行请求，并以 `200` 和 JSON 形式的 `HttpResponse` 作答：
  `{ status, statusText, headers: [name, value][], body, duration?, error? }`。
  带 `status: 0` 的 `error` 表示没有连到 API。不是字符串的 `body` 会以 JSON 形式显示。
- 其他任何响应——不是 2xx，或不是 JSON——都显示为请求失败。

这个端点需要由你来保护：只放行你打算放行的主机，并要求与后台其他部分相同的登录，
否则它就是一个开放中继。该代理传输方式也以 `DskOpenApi.proxySend(url)` 导出。

## 从 Scalar 迁移

选项沿用 Scalar 的 `createApiReference` 的字段名：带 `url`、`content`、`title` 和
`slug` 的 `sources`，或者单份规范文档时在顶层使用 `url` / `content`。像 laravel-api
的文档视图这样的页面，原本这样调用：

```js
Scalar.createApiReference('#app', { sources: sources })
```

只需加载另一个脚本，并用同一个对象调用另一个全局变量即可切换：

```html
<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
<script>
  DskOpenApi.createApiReference('#app', { sources: sources })
</script>
```

为 Scalar 页面构建的链接依然有效：`#{doc}/tag/{tag}/{METHOD}{path}`、`#{doc}/tag/{tag}`
和 `#{doc}/model/{name}` 打开相同的分区（见 [深层链接](links.md#scalar-链接)）。
上面未列出的 Scalar 选项会被忽略。

## OpenApiPage

在 Vue 应用中使用同样的页面：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiPage, type PageTheme } from '@dskripchenko/openapi/vue'

const theme = ref<PageTheme>('system')
const locale = ref('auto')
</script>

<template>
  <OpenApiPage v-model:theme="theme" v-model:locale="locale" :specs="specs" persist-theme>
    <template #actions>
      <a href="/">Back to the site</a>
    </template>
  </OpenApiPage>
</template>
```

Prop：

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `theme` | `PageTheme` | `'system'` | `'light'`、`'dark'` 或 `'system'`；使用 `v-model:theme`。 |
| `locale` | `string` | `'auto'` | `'en'`、`'ru'` 或 `'auto'`；使用 `v-model:locale`。 |
| `title` | `string` | 当前打开的规范文档的标题 | 标题栏的标题。 |
| `languages` | `string[]` | `['en', 'ru']` | 切换器提供的语言；只有一种时隐藏切换器。 |
| `persistTheme` | `boolean` | `false` | 把所选主题保存在 localStorage 的 `dsk-openapi-theme` 下；之后它优先于 `theme`。 |
| `applyTheme` | `boolean` | `true` | 把主题写入 `<html>` 的 `data-theme`，kit 的主题从这里读取。宿主自行处理页面主题时请关闭。 |

其他所有属性和监听器——`spec`、`specs`、`send`、`tryIt`、`labels`、`@loaded`……——
原样传给内部的 [`OpenApiReference`](reference.md)；`class` 和 `style` 留在页面上。
`labels` 也会翻译标题栏。

插槽：

- `#title` —— 标题栏的左侧；接收 `{ title }`；
- `#actions` —— 放在主题和语言切换器之前的额外控件。

标题栏是 sticky 的，其高度会写入 `--oa-sticky-top`，因此导航和侧边面板会停在它下方。
内容居中，最大宽度为 `--oa-page-width`（1440px），左右内边距为 `--oa-page-padding`
（24px，窄屏上为 16px）。

通过模板 ref 暴露：`reference`（内部的 `OpenApiReference`）、`setTheme(theme)`，以及
`theme`——实际显示的主题，`'system'` 已解析为 `'light'` 或 `'dark'`。

`PageTheme`、`PAGE_THEMES`（`['light', 'dark', 'system']`）和 `resolveLocale(locale)`——
它根据浏览器语言把 `'auto'` 变为 `'en'` 或 `'ru'`——同样从 `@dskripchenko/openapi/vue` 导出。
