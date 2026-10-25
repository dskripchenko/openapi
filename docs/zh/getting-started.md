# 快速上手

## 安装

```bash
npm install @dskripchenko/openapi
```

本包有两个入口：

- `@dskripchenko/openapi` —— 核心：解析、归一化、校验、schema 示例、请求构建和代码示例。
  纯 TypeScript，没有任何依赖；可在浏览器、Node 20+ 和构建脚本中运行。
- `@dskripchenko/openapi/vue` —— `OpenApiReference` 和 `OpenApiEditor` 组件。
  它们需要 Vue 3.4+ 和 [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.13+，二者声明为可选的 peer 依赖：

```bash
npm install vue @dskripchenko/ui
```

两个入口都是 ES 模块，附带 CommonJS 构建和自带的类型定义。如果只使用核心，
则不需要 Vue，也不需要组件库（kit）。

对于不经过构建步骤的文档页面，还有一个独立包：一个内含 Vue、kit 和样式的 `<script>`，
通过 `DskOpenApi.createApiReference('#app', { sources })` 启动。见
[独立页面与 OpenApiPage](standalone.md)。

## 样式

组件使用 kit 的设计令牌（design tokens）和组件，因此先引入 kit 的样式表，再引入本包自己的样式：

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'

import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/openapi/style.css'

createApp(App).mount('#app')
```

`all.css` 把 kit 的令牌、主题、重置样式、基础排版和组件样式合在一个文件里。
如果逐个引入 kit 的样式，组件需要的是令牌、主题和组件样式
（`tokens.css`、`themes.css`、`index.css`）。

## API 参考页

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
import spec from './openapi.yaml?raw'
</script>

<template>
  <OpenApiReference :spec="spec" locale="en" />
</template>
```

`spec` 是 YAML 或 JSON 文本，或已经解析好的对象。支持 Swagger 2.0、
OpenAPI 3.0 和 OpenAPI 3.1；格式和版本会自动识别。页面包含带搜索的导航、
按标签分组的所有操作、schema、13 种语言的请求示例以及 "Try it" 面板。

上面的 `?raw` 导入是 Vite 的功能。要在运行时加载规范文档，请以文本形式获取，
拿到后再渲染组件：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const spec = ref<string | null>(null)
onMounted(async () => {
  spec.value = await (await fetch('/openapi.yaml')).text()
})
</script>

<template>
  <OpenApiReference v-if="spec" :spec="spec" locale="en" />
</template>
```

无法读取的规范文档会在页面位置显示一个错误框，组件同时触发 `error` 事件。
`spec` 也可以是一个返回文本或对象的 promise 的函数，这时参考页会自行加载它。
多份规范文档——多个 API 或版本——可通过 `specs` 放在一个页面上，导航中带有切换器。
所有 prop 见 [参考页](reference.md)。

## 编辑器

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiEditor } from '@dskripchenko/openapi/vue'

const text = ref(`openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths: {}
`)
</script>

<template>
  <OpenApiEditor v-model="text" locale="en" />
</template>
```

`v-model` 是文档的文本。编辑器有三个视图——可视化表单、源码和预览——并保持文本原来的格式：
YAML 文档仍然是 YAML。见 [编辑器](editor.md)。

## 不使用 Vue

核心可以单独使用：

```ts
import { loadSpec, buildRequest, serverUrl, generateSnippet } from '@dskripchenko/openapi'

const spec = loadSpec(text)               // YAML or JSON text, or an object

for (const op of spec.operations) {
  console.log(op.method.toUpperCase(), op.path, op.id)
}

const op = spec.operations.find((o) => o.id === 'getPet')!
const request = buildRequest({
  method: op.method,
  path: op.path,
  server: serverUrl(spec.document.servers![0]!),
  parameters: op.parameters,
  values: { path: { id: 42 } },
})

console.log(generateSnippet('curl', request))
// curl 'https://api.example.com/v1/pets/42'
```

对于无法读取的文本，`loadSpec` 抛出 `YamlError` 或 `JsonError`；对于不是
Swagger 或 OpenAPI 规范的文档，抛出 `OpenApiError`。无论输入是哪个版本，
返回的 `document` 始终是 OpenAPI 3.1 的结构。见 [核心 API](core.md)。

## 接下来

- [OpenApiReference](reference.md) —— prop、搜索、try-it、服务端代理、认证与 OAuth、服务器、语言
- [独立页面与 OpenApiPage](standalone.md) —— 在任意页面上用一个脚本、从 Scalar 迁移、页面组件
- [深层链接与预填链接](links.md) —— 锚点、Scalar 的链接、填写 try-it 表单的链接
- [嵌入操作](embed.md) —— 在其他文档中展示单个操作，可通过 Vue 或独立脚本
- [TypeScript 类型](types.md) —— Types 标签页、`.d.ts` 下载和生成器
- [OpenApiEditor](editor.md) —— 三个视图、表单覆盖的内容、Swagger 2.0 文档
- [核心 API](core.md) —— `@dskripchenko/openapi` 的所有函数
- [代码示例](snippets.md) —— 13 个目标及其运行要求
- [主题](theming.md) —— 暗色主题和 `--oa-*` 变量
