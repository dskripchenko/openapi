# OpenApiEditor

OpenAPI 文档的可视化编辑器，表单旁边还有源码和预览。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiEditor } from '@dskripchenko/openapi/vue'

const text = ref(initialYaml)
</script>

<template>
  <OpenApiEditor v-model="text" locale="en" />
</template>
```

## Prop 与事件

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `modelValue` | `string` | — | 文档的文本，YAML 或 JSON。使用 `v-model`。 |
| `view` | `'visual' \| 'source' \| 'preview'` | `'visual'` | 显示的视图。编辑器以它打开，传入新值会切换到该视图；用户仍可在工具栏中切换视图。 |
| `locale` | `string` | — | `'en'` 或 `'ru'`；同时设置内部 kit 的语言，与 [参考页](reference.md#语言) 相同。 |
| `labels` | `Partial<EditorLabels>` | `{}` | 覆盖单个编辑器字符串。 |
| `send` | `SendFn` | `fetch` | 传给预览中的 try-it。见 [代理](reference.md#通过你的服务器发送)。 |
| `referenceLabels` | `Partial<OpenApiLabels>` | `{}` | 预览的字符串：即参考页的 `labels`。 |
| `snippetTargets` | `SnippetTarget[]` | 全部 13 个 | 预览中示例的语言。 |
| `baseUrl` | `string` | 页面的 origin | 预览中解析相对服务器 URL 的基准。 |
| `external` | `(url: string) => unknown \| undefined` | — | 在预览中加载外部 `$ref` 文档，与 [参考页](reference.md#外部引用) 中相同。 |
| `newFormat` | `'yaml' \| 'json'` | `'yaml'` | 从空文本新建文档时使用的格式。 |

| 事件 | 载荷 | |
|---|---|---|
| `update:modelValue` | `string` | 新的文本，在任一视图中每次修改之后触发。 |
| `issues` | `DocumentIssue[]` | 文档的问题，挂载时以及每次变化时触发。无法解析的文本以一个 `severity: 'error'` 的问题给出，带有解析器给出的行和列。 |

文本是编辑器与宿主共享的唯一状态：像保存其他任何文本一样保存它即可。
从外部传入新的 `modelValue` 会替换正在编辑的文档。

## 格式保持不变

编辑器把文本当作 YAML 或 JSON 读取（以 `{` 或 `[` 开头时为 JSON），并以相同格式写回。
工具栏上有 YAML / JSON 切换，可把整个文档改写为另一种格式。

版本也保持不变：表单编辑的是文档本身，而不是归一化后的副本，因此 OpenAPI 3.0
文档仍然是 3.0。两个版本写法不同的地方，表单遵循文档的版本——可为 null 的字段在 3.0
中写成 `nullable: true`，在 3.1 中写成 `type: [string, 'null']`。

## 三个视图

顶部的工具栏在它们之间切换。

**可视化（Visual）。** 左侧是文档树：info、servers、tags、安全方案、路径及其操作，
以及 schema。分区旁的 `+` 用于添加条目。右侧是所选节点的表单。

**源码（Source）。** 文本本身，带语法高亮、行号，下方列出发现的问题。
在这里输入会原样编辑文本——格式和注释都会保留。Tab 插入两个空格。
非常大的文本（超过约 150,000 个字符）不做高亮显示，以保证输入流畅。

**预览（Preview）。** 由 [`OpenApiReference`](reference.md) 渲染的文档，
使用编辑器的 `locale`、`send`、`referenceLabels`、`snippetTargets`、
`baseUrl` 和 `external`；其中 try-it 可用。预览不会改动 `location.hash`。

## 表单覆盖的内容

- **Info** —— 标题、版本、摘要、描述（markdown）、服务条款、联系人姓名、邮箱和 URL、
  许可证名称和 URL。
- **Servers** —— 每个服务器的 URL 和描述，以及带默认值和允许值列表的变量。
- **Tags** —— 名称和描述；它们的顺序就是参考页中各分区的顺序。
- **安全方案** —— 类型（`apiKey`、`http`、`oauth2`、`openIdConnect`、`mutualTLS`）
  以及该类型的字段：API 密钥放在哪里及其名称；http 方案和 bearer 格式；一个 OAuth2
  流程及其 URL 和 scope（每行一个 `name: description`）；OpenID Connect URL。
- **路径** —— 路径模板（在输入框失去焦点时重命名；必须以 `/` 开头）、它拥有的方法，
  以及 "Add operation"。
- **操作** —— 摘要、描述、`operationId`、标签、deprecated；参数（名称、`in`、
  是否必填、描述、schema），路径中尚无参数的 `{names}` 可一键添加；请求体及其媒体类型
  和对应 schema；按状态码列出的响应，带描述和内容；安全设置——与文档相同、无，或所选方案。
- **Schema** —— 名称（失去焦点时重命名；整个文档中的 `#/components/schemas/{name}`
  引用会跟随新名称）以及 schema 本身：一个类型、对另一个 schema 的引用，或
  `oneOf` / `anyOf` / `allOf` 组合；格式、nullable、允许值、默认值、示例、pattern，
  以及长度、范围和元素数量的限制；带必填标记的属性，以及数组元素——每一个都是独立的 schema 表单。

表单不显示的内容——扩展字段、`examples`、`callbacks`、`links`、文档级的 `security`
等——都按原样保留，可以在源码中编辑。

## 可视化编辑会重写文本

表单中的修改会在最后一次按键约四分之一秒后写回，方式是重新序列化整个文档。
键的顺序会保持，但文本会重新排版：YAML 使用 2 空格缩进，只在必要时加引号；
JSON 使用 2 空格的格式化输出。

**YAML 中的注释在可视化编辑后不会保留**，自定义格式也不会。如果文件的注释很重要，
请在源码视图中编辑：在那里文本会完全按输入保存。

## Swagger 2.0

Swagger 2.0 文档照常在源码和预览视图中打开。可视化视图显示的是一条提示而不是表单——
因为表单使用的是 OpenAPI 3——并提供 "Convert to OpenAPI 3.1" 按钮。
转换方式与参考页显示时使用的相同（见 [`normalize`](core.md#归一化)）：
`host`、`basePath` 和 `schemes` 变为 `servers`，body 和表单参数变为 `requestBody`，
`definitions` 变为 `components.schemas`，等等。转换会替换文本；如需保留 2.0 文件，请自行保留副本。

## 空文本

当 `modelValue` 为空时，可视化视图提供 "Create a document"，它会以 `newFormat`
格式写入一个最小的 OpenAPI 3.1 文档（标题、版本、空的 `paths`）。

## 问题

工具栏显示文档中的错误数——按钮 "Problems: N"，或 "No problems"。点击它会打开源码视图，
其中列出 [`validateDocument`](core.md#校验) 发现的每个问题及其行号，错误和警告都在内；
点击某个问题会把光标放到该行，有错误的行会在行号栏中标出。完全无法解析的文本会显示
解析器的消息和位置；在文本重新可读之前，可视化视图和预览也显示这条消息。

每次解析和每次表单编辑后都会重新检查问题，每份新的问题列表都会通过 `issues` 事件发出——
例如，用来阻止保存带有错误的文档：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentIssue } from '@dskripchenko/openapi'
import { OpenApiEditor } from '@dskripchenko/openapi/vue'

const text = ref(initialYaml)
const issues = ref<DocumentIssue[]>([])
const canSave = computed(() => !issues.value.some((i) => i.severity === 'error'))
</script>

<template>
  <OpenApiEditor v-model="text" @issues="issues = $event" />
  <button :disabled="!canSave">Save</button>
</template>
```

在非常大的文本（超过 100,000 个字符）中输入时，
解析会等到短暂停顿之后再进行。

## 字符串

`locale` 选择编辑器的字符串——本包自带英语（`editorEn`）和俄语（`editorRu`），
`EDITOR_LOCALES` 包含两者——`labels` 覆盖单个字符串：

```vue
<OpenApiEditor v-model="text" locale="en" :labels="{ visual: 'Forms', newDocumentTitle: 'Untitled API' }" />
```

其他语言的完整字典类型为 `EditorLabels`：

```ts
import { editorEn, type EditorLabels } from '@dskripchenko/openapi/vue'

const editorDe: EditorLabels = { ...editorEn, visual: 'Formulare', source: 'Quelltext', preview: 'Vorschau' /* … */ }
```

预览是一个 `OpenApiReference`：它从 `locale` 和 `referenceLabels` 获取字符串；
编辑器的 `labels` 不会传到预览。

```vue
<OpenApiEditor v-model="text" locale="en" :reference-labels="{ tryIt: 'Run' }" />
```
