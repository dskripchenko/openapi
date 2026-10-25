# Начало работы

## Установка

```bash
npm install @dskripchenko/openapi
```

У пакета две точки входа:

- `@dskripchenko/openapi` — ядро: разбор, нормализация, проверка, примеры
  по схемам, сборка запросов и примеры кода. Чистый TypeScript без
  зависимостей; работает в браузере, в Node 20+ и в скрипте сборки.
- `@dskripchenko/openapi/vue` — компоненты `OpenApiReference` и
  `OpenApiEditor`. Им нужны Vue 3.4+ и [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.13+, объявленные как необязательные peer-зависимости:

```bash
npm install vue @dskripchenko/ui
```

Обе точки входа — ES-модули со сборкой CommonJS рядом и собственными
определениями типов. Если вы используете только ядро, ни Vue, ни кит не
нужны.

## Стили

Компоненты используют дизайн-токены и компоненты кита, поэтому сначала
подключаются стили кита, затем стили пакета:

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'

import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/openapi/style.css'

createApp(App).mount('#app')
```

`all.css` — это токены, темы, сброс стилей, базовая типографика и стили
компонентов кита в одном файле. Если вы подключаете стили кита по
отдельности, компонентам нужны токены, темы и стили компонентов
(`tokens.css`, `themes.css`, `index.css`).

## Справочник API

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
import spec from './openapi.yaml?raw'
</script>

<template>
  <OpenApiReference :spec="spec" locale="en" />
</template>
```

`spec` — текст YAML или JSON либо уже разобранный объект. Принимаются
Swagger 2.0, OpenAPI 3.0 и OpenAPI 3.1; формат и версия определяются сами.
На странице есть навигация с поиском, все операции, сгруппированные по
тегам, схемы, примеры запроса на 13 языках и панель «Try it».

Импорт `?raw` выше — возможность Vite. Чтобы загрузить спецификацию во
время работы, получите её как текст и покажите компонент, когда текст
пришёл:

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

Спецификация, которую не удалось прочитать, показывает вместо страницы блок
с ошибкой, а компонент генерирует событие `error`. `spec` может быть и
функцией, возвращающей promise текста или объекта; тогда справочник
загружает спецификацию сам. Несколько спецификаций — разные API или версии —
размещаются на одной странице через `specs`, с переключателем в навигации.
Все свойства описаны на странице [справочника](reference.md).

## Редактор

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

`v-model` — текст документа. У редактора три режима — визуальные формы,
исходник и просмотр — и он сохраняет текст в том формате, в котором тот
пришёл: документ YAML остаётся YAML. Подробнее — на странице
[редактора](editor.md).

## Без Vue

Ядро работает само по себе:

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

`loadSpec` бросает `YamlError` или `JsonError`, если текст не читается, и
`OpenApiError`, если документ — не спецификация Swagger или OpenAPI.
Возвращаемый `document` всегда имеет форму OpenAPI 3.1, какой бы ни была
версия на входе. Подробнее — в [API ядра](core.md).

## Дальше

- [OpenApiReference](reference.md) — свойства, try-it, прокси на сервере,
  авторизация, серверы, языки
- [OpenApiEditor](editor.md) — три режима, что покрывают формы, документы
  Swagger 2.0
- [API ядра](core.md) — все функции `@dskripchenko/openapi`
- [Примеры кода](snippets.md) — 13 целей и что нужно для их запуска
- [Темы](theming.md) — тёмная тема и переменные `--oa-*`
