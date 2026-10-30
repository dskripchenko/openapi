# AsyncAPI

使用 AsyncAPI 2.x（2.0–2.6）或 3.0 描述的事件驱动 API，可以像 OpenAPI 规范一样被读取和展示。

## 在页面上

```vue
<script setup lang="ts">
import { AsyncApiReference } from '@dskripchenko/openapi/vue'
import '@dskripchenko/openapi/style.css'
</script>

<template>
  <AsyncApiReference :spec="yamlOrJsonText" locale="en" />
</template>
```

页面会显示文档的描述和服务器（协议、地址、变量），然后是按标签分组的操作——若所有操作都没有标签，则按通道分组。每个操作显示应用是**发送**还是**接收**、标出 `{参数}` 的通道地址、参数、每条消息（头部与负载的 schema、内容类型、关联 ID、示例——来自文档或根据 schema 生成——以及绑定）、请求/响应操作的回复（3.0）以及操作的绑定。随后是组件中的消息和 schema。schema 使用与 OpenAPI 参考相同的视图展示。

使用其他 schema 语言（Avro、Protobuf、RAML 等）的负载按原样显示，并注明其格式。

| 属性       | 类型                     | 含义                                     |
| ---------- | ------------------------ | ---------------------------------------- |
| `spec`     | `string \| object`       | 文档：YAML 或 JSON 文本，或已解析的对象  |
| `locale`   | `string`                 | `en` 或 `ru`；默认使用浏览器语言         |
| `labels`   | `Partial<AsyncApiLabels>`| 覆盖界面文本                             |
| `external` | `(url) => unknown`       | 加载 `$ref` 通过 URL 引用的文档          |

插槽：`actions`（页眉）和 `footer`。

## 在代码中

```ts
import { loadAsyncApi, detectSpecKind } from '@dskripchenko/openapi'

detectSpecKind(parsed) // 'asyncapi' | 'openapi' | null
const spec = loadAsyncApi(text)
spec.operations // [{ id, action: 'send' | 'receive', channel, messages, reply, bindings, … }]
spec.channels // [{ id, address, parameters, messages, servers, … }]
spec.servers // [{ id, url, protocol, variables, … }]
```

两个版本会被统一为同一种结构。AsyncAPI 2.x 从客户端的角度描述操作；这里会像 3.0 那样转换为应用的视角：应用 `subscribe` 的通道是它**发送**消息的通道，`publish` 则表示**接收**。会应用消息和操作的 traits，解析 `$ref`，被多处引用的消息是同一个对象。`warnings` 列出无法解析的内容。
