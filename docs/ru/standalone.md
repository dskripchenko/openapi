# Отдельная страница и OpenApiPage

Два способа получить целую страницу документации, а не компонент внутри
вашего приложения:

- **отдельная сборка** — один `<script>` на любой HTML-странице, без шага
  сборки и без Vue в вашем проекте;
- **`OpenApiPage`** — компонент Vue: справочник с верхней панелью, на которой
  заголовок и переключатели темы и языка.

Отдельная сборка — это `OpenApiPage`, упакованный вместе с Vue, китом и
всеми стилями.

## Отдельная сборка

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

`dist/standalone.js` — классический скрипт (IIFE), который определяет
глобальный `DskOpenApi`. Внутри — Vue, `@dskripchenko/ui` и все таблицы
стилей; CSS скрипт добавляет на страницу сам (один раз, даже если скрипт
подключён дважды). Он также ставит `body { margin: 0 }`: страница должна
занимать всё окно. Тот же CSS опубликован как `dist/standalone.css` — для
страницы, которой удобнее `<link>`. В сборщике эти файлы называются
`@dskripchenko/openapi/standalone` и `@dskripchenko/openapi/standalone.css`.

### createApiReference

```ts
DskOpenApi.createApiReference(target, options) // → { app, unmount, setTheme, setLocale }
```

`target` — CSS-селектор или элемент; если ничего не найдено, функция бросает
исключение. Результат:

| | |
|---|---|
| `app` | Приложение Vue. |
| `unmount()` | Убирает страницу. |
| `setTheme(theme)` | `'light'`, `'dark'` или `'system'`. |
| `setLocale(locale)` | `'en'`, `'ru'` или `'auto'`. |

Параметры:

| Параметр | Тип | По умолчанию | |
|---|---|---|---|
| `sources` | `{ url?, content?, title?, slug? }[]` | — | Спецификации, по одной записи на каждую. |
| `url` | `string` | — | Одна спецификация без `sources`: откуда её загрузить. |
| `content` | `string \| object` | — | Одна спецификация без `sources`: сама спецификация. |
| `locale` | `'en' \| 'ru' \| 'auto'` | `'auto'` | `'auto'` следует языку браузера: русский для любого `ru*`, иначе английский. |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | `'system'` следует `prefers-color-scheme`, на лету. |
| `persistTheme` | `boolean` | `false` | Запоминать тему, выбранную посетителем (localStorage); запомненная тема затем важнее `theme`. |
| `proxy` | `string` | — | Эндпоинт, который выполняет запросы try-it; см. [прокси](#прокси). |
| `baseUrl` | `string` | origin страницы | База, относительно которой разрешается относительный URL сервера. |
| `snippetTargets` | `SnippetTarget[]` | все 13 | Предлагаемые языки примеров. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | Язык, показанный первым. |
| `tryIt` | `boolean` | `true` | `false` скрывает панели try-it. |
| `title` | `string` | название открытой спецификации | Заголовок панели; также задаёт `document.title`. |

Источник:

- `url` — откуда загружается спецификация, JSON или YAML, с куками того же
  origin. Она загружается, когда её открывают впервые.
- `content` — сама спецификация, текстом или объектом. Важнее `url`.
- `title` — подпись в переключателе спецификаций; по умолчанию собственное
  название спецификации.
- `slug` — id спецификации, используется в глубоких ссылках
  (`#v1/operation/…`). Без него id — это слаг названия, иначе `api-1`,
  `api-2`, … по порядку. К повторяющемуся id добавляется `-2`, `-3`, ….

С одним источником переключателя нет и якоря не содержат id; с несколькими
см. [несколько спецификаций](reference.md#несколько-спецификаций).
Переключатель языка на странице также задаёт `<html lang>`.

### Прокси

С `proxy` запросы try-it и запросы токенов из панели авторизации идут через
этот эндпоинт, а не напрямую из браузера. Контракт:

- Страница отправляет `POST {proxy}` с `Content-Type: application/json`,
  `Accept: application/json` и куками того же origin. Если на странице есть
  `<meta name="csrf-token" content="…">` (соглашение Laravel), его значение
  уходит в заголовке `X-CSRF-TOKEN`.
- Тело — `HttpRequest` в виде JSON:
  `{ method, url, headers: [name, value][], body?: { mediaType, text?, form? } }`.
  `url` абсолютный. Файловые поля формы приходят как
  `{ filename, contentType? }`; байты файла не отправляются.
- Эндпоинт сверяет URL с разрешёнными хостами, выполняет запрос и отвечает
  `200` с `HttpResponse` в виде JSON:
  `{ status, statusText, headers: [name, value][], body, duration?, error? }`.
  `error` при `status: 0` означает, что API недоступен. `body`, который не
  строка, показывается как JSON.
- Любой другой ответ — не 2xx или не JSON — показывается как неудавшийся
  запрос.

Защищать эндпоинт — ваша задача: пропускайте только нужные хосты и
требуйте тот же вход, что и в остальной административной части, иначе это
открытый ретранслятор. Транспорт через прокси экспортируется и как
`DskOpenApi.proxySend(url)`.

## Переход со Scalar

Параметры повторяют имена полей `createApiReference` из Scalar: `sources` с
`url`, `content`, `title` и `slug` или `url` / `content` на верхнем уровне для
одной спецификации. Страница вроде вью документации laravel-api, которая
делает

```js
Scalar.createApiReference('#app', { sources: sources })
```

переключается подключением другого скрипта и вызовом другого глобала с тем
же объектом:

```html
<script src="https://cdn.jsdelivr.net/npm/@dskripchenko/openapi/dist/standalone.js"></script>
<script>
  DskOpenApi.createApiReference('#app', { sources: sources })
</script>
```

Ссылки, построенные для страницы Scalar, продолжают работать:
`#{doc}/tag/{tag}/{METHOD}{path}`, `#{doc}/tag/{tag}` и `#{doc}/model/{name}`
открывают те же разделы (см. [глубокие ссылки](links.md#ссылки-scalar)).
Прочие параметры Scalar, кроме перечисленных выше, игнорируются.

## OpenApiPage

Та же страница внутри приложения Vue:

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

Свойства:

| Свойство | Тип | По умолчанию | |
|---|---|---|---|
| `theme` | `PageTheme` | `'system'` | `'light'`, `'dark'` или `'system'`; используйте `v-model:theme`. |
| `locale` | `string` | `'auto'` | `'en'`, `'ru'` или `'auto'`; используйте `v-model:locale`. |
| `title` | `string` | название открытой спецификации | Заголовок панели. |
| `languages` | `string[]` | `['en', 'ru']` | Языки в переключателе; если язык один, переключатель скрыт. |
| `persistTheme` | `boolean` | `false` | Хранить выбранную тему в localStorage под ключом `dsk-openapi-theme`; тогда она важнее `theme`. |
| `applyTheme` | `boolean` | `true` | Записывать тему в `data-theme` на `<html>`, откуда её читают темы кита. Отключите, если тему страницы задаёт хост. |

Все прочие атрибуты и обработчики — `spec`, `specs`, `send`, `tryIt`,
`labels`, `@loaded`, … — без изменений уходят во внутренний
[`OpenApiReference`](reference.md); `class` и `style` остаются на странице.
`labels` переводит и панель.

Слоты:

- `#title` — левая часть панели; получает `{ title }`;
- `#actions` — дополнительные элементы перед переключателями темы и языка.

Панель прилипает к верху, а её высота записывается в `--oa-sticky-top`,
поэтому навигация и боковые панели останавливаются под ней. Содержимое
выровнено по центру с максимальной шириной `--oa-page-width` (1440px) и
боковыми отступами `--oa-page-padding` (24px, 16px на узких экранах).

Через ref шаблона доступны: `reference` (внутренний `OpenApiReference`),
`setTheme(theme)` и `theme` — тема, которая реально показана, где
`'system'` уже разрешена в `'light'` или `'dark'`.

`PageTheme`, `PAGE_THEMES` (`['light', 'dark', 'system']`) и
`resolveLocale(locale)` — превращает `'auto'` в `'en'` или `'ru'` по языку
браузера — тоже экспортируются из `@dskripchenko/openapi/vue`.
