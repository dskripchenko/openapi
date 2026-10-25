# Встраивание операции

Одну операцию можно показать внутри другой документации — руководства,
журнала изменений, вики-страницы — компактной карточкой: метод, путь и
краткое описание, небольшая панель инструментов и сама операция в том виде,
в каком её показывает справочник, — с параметрами, телом, ответами,
примерами запроса, типами и try-it. Шапки, навигации и подвала нет.

## Во Vue: OpenApiOperation

```vue
<script setup lang="ts">
import { OpenApiOperation } from '@dskripchenko/openapi/vue'

const spec = () => fetch('/docs/v1.json').then((r) => r.json())
</script>

<template>
  <OpenApiOperation :spec="spec" operation="createOrder" reference-url="/docs" spec-id="v1" locale="en" />
</template>
```

`operation` называет операцию любым из способов:

- её id — `operationId` или слаг, который справочник даёт операции без него
  (`get-pets-id`);
- `METHOD /path` — `POST /orders`; путь с базовым путём сервера впереди
  (`POST /api/v1/orders`) тоже находится;
- якорь — `operation/{id}` (с сегментом спецификации и `#` или без них) или
  форма Scalar `tag/{tag}/{METHOD}{path}`.

Если такой операции в спецификации нет, карточка пишет «Operation not found»
и показывает имя.

Свойства:

| Свойство | Тип | По умолчанию | |
|---|---|---|---|
| `spec` | `SpecInput` | — | Спецификация: текст, разобранный объект или функция, возвращающая промис одного из них. Обязательно. |
| `operation` | `string` | — | Операция, как описано выше. Обязательно. |
| `referenceUrl` | `string` | — | Адрес полного справочника. Если задан, у карточки есть ссылка «Open in reference» на операцию там. |
| `specId` | `string` | — | Id спецификации в том справочнике (её id в `specs`, `slug` отдельной сборки): он ставится перед якорем ссылки, а сохранённые учётные данные делятся со справочником под тем же ключом. |
| `send`, `tryIt`, `locale`, `labels`, `snippetTargets`, `defaultSnippet`, `baseUrl`, `external`, `persistCredentials`, `oauthRedirectUrl` | | | Как у [`OpenApiReference`](reference.md#свойства). |

События: `loaded(spec)` и `error(error)`. Доступны снаружи: `spec`
(`LoadedSpec`), `entry` (`OperationEntry`) и `print()`.

На панели инструментов — кнопка настроек (хост сервера и значок ключа, как в
шапке справочника), которая открывает панель с сервером и авторизацией;
«PDF», печатающая операцию (см. [загрузку и печать](reference.md#загрузка-и-печать)),
с адресом ссылки на справочник, если задан `referenceUrl`; и "Open in
reference".

Несколько встраиваний одного и того же входа — того же текста, того же
объекта, той же функции-загрузчика — загружают его один раз, а неудачную
загрузку следующее встраивание повторяет. Передавайте всем одну функцию, а не
новую стрелочную функцию каждому:

```ts
export const v1 = () => fetch('/docs/v1.json').then((r) => r.json())
```

`findOperation(spec, name)` — поиск, которым пользуется карточка, — тоже
экспортируется из `@dskripchenko/openapi/vue`.

## Без сборки: отдельная сборка

[Отдельная сборка](standalone.md) тоже монтирует встраивания. Проще всего —
разметка и один скрипт с `data-auto`:

```html
<div data-openapi-operation="createOrder" data-openapi-src="/docs/v1.json"></div>

<p>… the guide continues …</p>

<div data-openapi-operation="GET /orders/{id}" data-openapi-src="/docs/v1.json"></div>

<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js" data-auto></script>
```

С `data-auto` на теге скрипт монтирует каждый элемент
`[data-openapi-operation]`, как только документ разобран. Встраивания одного
URL загружают его один раз. Атрибуты:

| Атрибут | |
|---|---|
| `data-openapi-operation` | Операция, как описано выше. Обязательно. |
| `data-openapi-src` | URL спецификации. |
| `data-openapi-theme` | `light`, `dark` или `system`. |
| `data-openapi-locale` | `en`, `ru` или `auto`. |
| `data-openapi-proxy` | Прокси для try-it; см. [прокси](standalone.md#прокси). |
| `data-openapi-try-it` | `false` скрывает try-it. |
| `data-openapi-reference` | Адрес полного справочника, для «Open in reference». |
| `data-openapi-slug` | Id спецификации в том справочнике. |

Добавленные позже элементы монтируются повторным вызовом
`DskOpenApi.autoMount(root?)`: он пропускает уже смонтированные (у них есть
`data-openapi-mounted`) и возвращает новые встраивания; сломанный элемент
пишется в консоль и не останавливает остальные.

Из скрипта:

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

`mountOperation(target, options)` принимает селектор или элемент и
возвращает `{ app, unmount(), setTheme(theme), setLocale(locale) }`.
Параметры:

| Параметр | |
|---|---|
| `operation` | Операция, как описано выше. Обязательно. |
| `source` | URL спецификации или источник, как в `createApiReference`, — `{ url?, content?, slug? }`, `content` важнее `url`; `slug` — id спецификации в справочнике. |
| `theme` | `'light'`, `'dark'` или `'system'`; см. ниже. |
| `locale` | `'en'`, `'ru'` или `'auto'` (по умолчанию): `auto` берёт `<html lang>` страницы, иначе язык браузера. Им задаётся атрибут `lang` карточки; собственный `lang` страницы не трогается. |
| `proxy`, `tryIt`, `referenceUrl`, `baseUrl`, `snippetTargets`, `defaultSnippet`, `persistCredentials`, `oauthRedirectUrl` | Как в таблицах выше и в [`createApiReference`](standalone.md#createapireference). |

## Тема на чужой странице

Темы кита определяются атрибутом `<html data-theme>`. Поэтому встраивание
оставляет тему странице-хосту, если тема не задана явно: с `theme` (или
`data-openapi-theme`) оно пишет `data-theme` на `<html>` — для всей
страницы, — а `system` следит за `prefers-color-scheme` на лету. Если
страница вообще не задаёт `data-theme`, светлые цвета кита применяются к
`:root:not([data-theme])` только как пользовательские свойства, которые
ничего из используемого самой страницей не меняют.

Базовые стили отдельной сборки — box-sizing, отступы заголовков и абзацев,
базовый шрифт — ограничены собственными элементами пакета и всплывающими
слоями кита, поэтому текст, заголовки и картинки страницы-хоста остаются
как есть. Только страница целого справочника (`createApiReference`) ещё и
забирает отступ и фон `body`.
