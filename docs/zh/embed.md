# 嵌入操作

单个操作可以以紧凑卡片的形式展示在其他文档中——指南、更新日志、wiki 页面：卡片包含方法、
路径和摘要，一个小工具栏，以及参考页中展示的该操作本身，包括参数、请求体、响应、请求示例、
类型和 try-it。没有页头、导航或页脚。

## 在 Vue 中：OpenApiOperation

```vue
<script setup lang="ts">
import { OpenApiOperation } from '@dskripchenko/openapi/vue'

const spec = () => fetch('/docs/v1.json').then((r) => r.json())
</script>

<template>
  <OpenApiOperation :spec="spec" operation="createOrder" reference-url="/docs" spec-id="v1" locale="en" />
</template>
```

`operation` 可以用以下任意一种方式指定操作：

- 它的 id——`operationId`，或参考页为没有 `operationId` 的操作生成的 slug（`get-pets-id`）；
- `METHOD /path`——`POST /orders`；路径前面带有服务器 base path 的形式
  （`POST /api/v1/orders`）也能找到；
- 锚点——`operation/{id}`（带或不带规范段和 `#`），或 Scalar 的 `tag/{tag}/{METHOD}{path}`。

规范文档中没有这样的操作时，卡片显示 "Operation not found" 以及所给的名称。

Prop：

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `spec` | `SpecInput` | — | 规范文档：文本、已解析的对象，或返回二者之一的 promise 的函数。必填。 |
| `operation` | `string` | — | 操作，如上所述。必填。 |
| `referenceUrl` | `string` | — | 完整参考页的地址。设置后，卡片带有指向该参考页中此操作的 "Open in reference" 链接。 |
| `specId` | `string` | — | 该规范文档在那个参考页中的 id（其 `specs` id，即独立包的 `slug`）：链接的锚点会以它开头，保存的凭据也以相同的键与参考页共享。 |
| `send`、`tryIt`、`locale`、`labels`、`snippetTargets`、`defaultSnippet`、`baseUrl`、`external`、`persistCredentials`、`oauthRedirectUrl` | | | 与 [`OpenApiReference`](reference.md#prop) 上的相同。 |

事件：`loaded(spec)` 和 `error(error)`。暴露的成员：`spec`（`LoadedSpec`）、
`entry`（`OperationEntry`）和 `print()`。

工具栏上有设置按钮——显示服务器主机名和钥匙图标，与参考页页头中的一样——它打开一个包含服务器
和认证面板的抽屉；"PDF" 打印该操作（见 [下载与打印](reference.md#下载与打印)），设置了
`referenceUrl` 时以参考页链接作为打印的地址；以及 "Open in reference"。

对同一个规范输入——同一段文本、同一个对象、同一个加载函数——的多个嵌入只加载一次，
加载失败时由下一个嵌入重试。请把同一个加载函数传给所有嵌入，而不是每次都写一个新的箭头函数：

```ts
export const v1 = () => fetch('/docs/v1.json').then((r) => r.json())
```

卡片所用的查找函数 `findOperation(spec, name)` 也从 `@dskripchenko/openapi/vue` 导出。

## 无需构建：独立包

[独立包](standalone.md) 同样可以挂载嵌入。最简单的方式是标记加上一个带 `data-auto` 的脚本：

```html
<div data-openapi-operation="createOrder" data-openapi-src="/docs/v1.json"></div>

<p>… the guide continues …</p>

<div data-openapi-operation="GET /orders/{id}" data-openapi-src="/docs/v1.json"></div>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

脚本标签上带有 `data-auto` 时，脚本会在文档解析完成后挂载每一个
`[data-openapi-operation]` 元素。同一 URL 的多个嵌入只请求一次。属性：

| 属性 | |
|---|---|
| `data-openapi-operation` | 操作，如上所述。必填。 |
| `data-openapi-src` | 规范文档的 URL。 |
| `data-openapi-theme` | `light`、`dark` 或 `system`。 |
| `data-openapi-locale` | `en`、`ru` 或 `auto`。 |
| `data-openapi-proxy` | try-it 代理；见 [代理](standalone.md#代理)。 |
| `data-openapi-try-it` | `false` 隐藏 try-it。 |
| `data-openapi-reference` | 完整参考页的地址，用于 "Open in reference"。 |
| `data-openapi-slug` | 该规范文档在那个参考页中的 id。 |

之后添加的元素，可以再次调用 `DskOpenApi.autoMount(root?)` 来挂载——它会跳过已挂载的元素
（它们带有 `data-openapi-mounted`），并返回新的嵌入；出错的元素会被记录到控制台，不影响其余元素。

在脚本中：

```js
const embed = DskOpenApi.mountOperation('#order-create', {
  source: '/docs/v1.json',
  operation: 'createOrder',
  referenceUrl: '/docs',
  theme: 'system',
  locale: 'auto',
})
embed.setLocale('ru')
embed.unmount()
```

`mountOperation(target, options)` 接收一个选择器或元素，返回
`{ app, unmount(), setTheme(theme), setLocale(locale) }`。选项：

| 选项 | |
|---|---|
| `operation` | 操作，如上所述。必填。 |
| `source` | 规范文档的 URL，或与 `createApiReference` 中相同的来源——`{ url?, content?, slug? }`，`content` 优先于 `url`；`slug` 是该规范文档在参考页中的 id。 |
| `theme` | `'light'`、`'dark'` 或 `'system'`；见下文。 |
| `locale` | `'en'`、`'ru'` 或 `'auto'`（默认）：`auto` 取页面的 `<html lang>`，否则取浏览器语言。卡片的 `lang` 属性会被设为该值；页面自身的 `lang` 保持不变。 |
| `proxy`、`tryIt`、`referenceUrl`、`baseUrl`、`snippetTargets`、`defaultSnippet`、`persistCredentials`、`oauthRedirectUrl` | 与上面的表格以及 [`createApiReference`](standalone.md#createapireference) 中的相同。 |

## 在他人页面中的主题

kit 的主题以 `<html data-theme>` 为准。因此，除非指定了主题，嵌入会把主题交给宿主页面决定：
给出 `theme`（或 `data-openapi-theme`）时，它会在 `<html>` 上写入 `data-theme`——作用于整个页面——
而 `system` 会实时跟随 `prefers-color-scheme`。页面完全没有设置 `data-theme` 时，kit 的浅色
颜色仅以自定义属性的形式作用于 `:root:not([data-theme])`，不会改变宿主页面自己使用的任何样式。

独立包的基础样式——盒模型、标题和段落的外边距、基础字体——只作用于本包自己的元素和 kit 的浮层，
因此宿主页面的文字、标题和图片保持原样。只有完整的参考页（`createApiReference`）
还会接管 body 的外边距和背景色。
