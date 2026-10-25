# OpenApiReference

Страница справочника API для спецификации Swagger 2.0, OpenAPI 3.0 или
OpenAPI 3.1.

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

На странице две колонки. Слева — навигация: поле поиска, операции,
сгруппированные по тегам, вебхуки и схемы. Справа — документ: название,
версия и описание, панели сервера и учётных данных, затем каждая операция с
параметрами, телом запроса, ответами (деревьями схем с примерами),
колбэками, примерами запроса и панелью «Try it», а в конце — схемы из
`components.schemas`.

При ширине меньше 1100 px примеры и try-it уходят под описание операции;
меньше 760 px — навигация встаёт над документом.

## Свойства

| Свойство | Тип | По умолчанию | |
|---|---|---|---|
| `spec` | `string \| object` | — | Спецификация: текст YAML или JSON либо разобранный объект. Обязательно. |
| `send` | `SendFn` | `fetch` страницы | Отправляет запросы try-it. См. [прокси](#отправка-через-свой-сервер). |
| `tryIt` | `boolean` | `true` | `false` скрывает панели try-it; примеры остаются. |
| `locale` | `string` | — | `'en'` или `'ru'`. См. [языки](#языки). |
| `labels` | `Partial<OpenApiLabels>` | `{}` | Замены отдельных строк интерфейса. |
| `snippetTargets` | `SnippetTarget[]` | все 13 | Языки, предлагаемые для примеров запроса. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | Язык, показанный первым. |
| `baseUrl` | `string` | origin страницы | База, относительно которой разрешается относительный URL сервера. |
| `external` | `(url: string) => unknown \| undefined` | — | Загружает внешние документы `$ref`. Без него ни один не загружается. |
| `hashNavigation` | `boolean` | `true` | Записывать `location.hash`, когда пункт открыт из навигации. |

Спецификация загружается заново, когда меняется `spec` или `external`. Оба
сравниваются по ссылке: передавайте новый объект, а не меняйте старый на
месте, и держите функцию `external` неизменной (объявите её один раз в
`<script setup>`, а не прямо в шаблоне).

## События

| Событие | Данные | |
|---|---|---|
| `loaded` | `LoadedSpec` | После каждой успешной загрузки: нормализованный документ, его операции и группы (см. [`loadSpec`](core.md#загрузка-спецификации)). |
| `error` | `Error` | Спецификацию не удалось прочитать: `YamlError`, `JsonError` или `OpenApiError`. Страница показывает сообщение вместо справочника. |

## Доступное снаружи

Через ref шаблона:

| | |
|---|---|
| `go(anchor: string): Promise<void>` | Прокручивает к `'operation/{id}'` или `'schema/{name}'`, отмечает пункт в навигации и, при `hashNavigation`, записывает hash. |
| `spec` | Текущий `LoadedSpec` или `null`, если спецификацию не удалось прочитать. |

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const reference = ref<InstanceType<typeof OpenApiReference> | null>(null)
const openPets = () => reference.value?.go('operation/listPets')
</script>

<template>
  <button @click="openPets">List pets</button>
  <OpenApiReference ref="reference" :spec="text" />
</template>
```

## Глубокие ссылки

У каждой операции есть якорь `#operation/{id}`, у каждой схемы из
`components.schemas` — якорь `#schema/{name}`. Идентификатор — это
`operationId`; операция без него (или с уже занятым `operationId`) получает
слаг из метода и пути, например `get-pets-id` для `GET /pets/{id}`.
Операции вебхуков получают `webhook-{method}-{name}`.

Когда страница открывается с таким якорем в `location.hash`, справочник
прокручивает к нему. С `hashNavigation` (по умолчанию) щелчок в навигации
заменяет hash, так что адрес можно скопировать и отправить. Отключите это,
если справочник встроен в страницу, которая использует hash для своей
маршрутизации:

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

## Try it

У каждой операции (кроме вебхуков) есть панель «Try it»: поле на каждый
параметр, сгруппированные по `path`, `query`, `header` и `cookie`, текстовое
поле для тела с выбором типа содержимого и кнопка «Send». Поля изначально
заполнены значением `example` или `default` параметра, а для обязательных
параметров — значением, сгенерированным по схеме; тело — примером типа
содержимого или примером, сгенерированным по его схеме.

Введённое читается по схеме параметра: числа и логические значения
преобразуются, массивы и объекты читаются как JSON (массив можно ввести и
как `a, b, c`). Тело отправляется как набрано; для типа JSON некорректное
тело вызывает предупреждение, но всё равно отправляется. Для тел
`application/x-www-form-urlencoded` и `multipart/form-data` вводите поля как
объект JSON. Выбора файла в текстовом поле нет: файловое поле тела
multipart отправляется без содержимого.

Примеры запроса рядом с панелью печатают тот же запрос, который делает
«Send», с введёнными значениями и учётными данными. Язык, выбранный в одной
операции, используется во всех.

Ответ показывает статус, время, заголовки и тело; тело JSON
форматируется. Если запрос не дошёл до сервера — сетевая ошибка или браузер
заблокировал кросс-доменный запрос, — панель сообщает об этом с текстом
браузера.

### Учётные данные и куки

По умолчанию запрос отправляется через `fetch` страницы с
`credentials: 'same-origin'`: браузер прикладывает куки страницы только к
запросам на её собственный origin и никогда — к чужому API.

Для транспорта по умолчанию действуют два правила браузера. Кросс-доменный
API должен разрешать origin страницы (CORS), иначе браузер заблокирует
ответ. И браузер отбрасывает заголовки, которые скриптам ставить запрещено —
`Cookie`, `Host`, `Origin` и другие, — даже если спецификация их объявляет.

### Отправка через свой сервер

Передайте `send`, чтобы try-it шёл через ваш бэкенд. Функция получает
запрос, собранный панелью, и возвращает ответ:

```ts
type SendFn = (request: HttpRequest) => Promise<HttpResponse>

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

На странице — функция, которая отправляет запрос на ваш бэкенд как JSON:

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`Proxy answered ${response.status}`)
    return (await response.json()) as HttpResponse
  } catch (error) {
    return {
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      duration: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

```vue
<OpenApiReference :spec="text" :send="send" />
```

URL абсолютный, если у документа есть серверы (относительный URL сервера
разрешается относительно `baseUrl`); для документа без `servers` это просто
путь. На бэкенде эндпоинт читает `HttpRequest`, проверяет, что URL ведёт на
разрешённый вами хост, выполняет запрос и отвечает `HttpResponse`. В
Node 20+ саму отправку делает `sendRequest` из ядра:

```ts
import { sendRequest, type HttpRequest, type HttpResponse } from '@dskripchenko/openapi'

const ALLOWED_HOSTS = new Set(['api.example.com'])

export async function proxy(request: HttpRequest): Promise<HttpResponse> {
  const host = new URL(request.url).host
  if (!ALLOWED_HOSTS.has(host)) {
    return { status: 0, statusText: '', headers: [], body: '', duration: 0, error: `Host ${host} is not allowed` }
  }
  return sendRequest(request)
}
```

Защитите эндпоинт так же, как остальную административную часть: прокси,
который ходит на любой хост от имени кого угодно, — открытый ретранслятор.
Сервер не связан списком запрещённых заголовков браузера, поэтому через него
`Cookie` и другие объявленные в спецификации заголовки доходят до API.
Файловые поля приходят как `{ filename, contentType }` без данных — панели
нечего отправить.

`send`, который бросает исключение, обрабатывается как сетевая ошибка.
`send` также передаёт в свой просмотр [`OpenApiEditor`](editor.md).

## Авторизация

Если документ объявляет `components.securitySchemes`, в шапке страницы есть
панель «Authentication» с полем для каждой схемы:

- **apiKey** — ключ; он уходит в заголовок, параметр запроса или куку,
  названные схемой;
- **http basic** — логин и пароль;
- **http bearer** и другие схемы http — токен, отправляется как
  `Authorization: Bearer …` (или с именем схемы);
- **oauth2** и **openIdConnect** — токен доступа, отправляется как
  `Authorization: Bearer …`.

Схемы `mutualTLS` не показываются: браузер не может предъявить клиентский
сертификат из скрипта.

Значения применяются ко всем операциям страницы — и к «Send», и к
примерам. Для каждой операции справочник берёт её `security` (или
документа) и использует первое требование, у всех схем которого есть
значение. Операция с пустым требованием (`security: [{}]` или
`security: []`) отправляется без учётных данных.

### Получение токена OAuth2

Для схемы oauth2 с потоком `clientCredentials` или `password`, у которого
есть `tokenUrl`, в панели есть также поля «Client ID», «Client secret» (а
для `password` — «Username» и «Password») и кнопка «Get token». Кнопка
отправляет запрос токена на `tokenUrl` (RFC 6749 §4.3 и §4.4) со всеми
scope, объявленными потоком; полученный токен доступа заполняет поле токена
схемы. С секретом клиент аутентифицируется через HTTP Basic; без него
`client_id` уходит в форму. Если у схемы есть оба потока, используется
`clientCredentials`.

Запрос токена делается через `fetch` страницы, а не через `send`, поэтому
эндпоинт токена должен принимать кросс-доменный запрос со страницы. Для
потоков `implicit` и `authorizationCode` получите токен в другом месте и
вставьте его в поле токена. Тот же запрос доступен вне компонента как
[`fetchOAuthToken`](core.md#токены-oauth2).

## Серверы

Если у документа есть `servers`, панель «Server» перечисляет их, плюс «…»
для своего URL. Переменные сервера получают по полю — выпадающий список,
если у переменной есть `enum`, — заполненному значением `default`. Операция
или путь со своими `servers` использует свой список, с той же выбранной
позицией.

Относительный URL сервера (`/v1`) разрешается относительно `baseUrl`,
который по умолчанию равен origin страницы. Задайте его, если справочник
отдаётся с другого origin, чем API:

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## Примеры запроса

Выбор примеров предлагает языки из `snippetTargets` в порядке самого
пакета; `defaultSnippet` — тот, что показан первым. Чтобы предложить только
некоторые:

```vue
<OpenApiReference
  :spec="text"
  :snippet-targets="['curl', 'javascript-fetch', 'php-laravel', 'python-requests']"
  default-snippet="php-laravel"
/>
```

Идентификаторы и что нужно каждой цели для запуска перечислены в
[примерах кода](snippets.md).

## Языки

`locale` выбирает строки интерфейса: с пакетом поставляются английские
(`'en'`) и русские (`'ru'`). Без `locale` строки английские. `labels` поверх
заменяет отдельные строки:

```vue
<OpenApiReference :spec="text" locale="en" :labels="{ tryIt: 'Run', send: 'Run request' }" />
```

Для другого языка передайте в `labels` полный словарь. Его тип —
`OpenApiLabels`, а начать удобно с английского `en`:

```ts
import { en, type OpenApiLabels } from '@dskripchenko/openapi/vue'

const de: OpenApiLabels = { ...en, search: 'Suche', tryIt: 'Ausprobieren', send: 'Senden' /* … */ }
```

```vue
<OpenApiReference :spec="text" :labels="de" />
```

`en`, `ru` и `LOCALES` (`{ en, ru }`) экспортируются из
`@dskripchenko/openapi/vue`.

### Собственные строки кита

У компонентов кита внутри справочника — выпадающих списков, блоков кода,
полей ввода — есть свои строки: кнопка копирования, поиск внутри списка и
тому подобное. При `locale="en"` или `locale="ru"` справочник оборачивает
себя в `UidLocaleProvider` кита с соответствующей локалью кита. Без `locale`
(или с любым другим значением) он провайдер не добавляет, и компоненты кита
следуют `UidLocaleProvider` хоста; если его нет, у кита по умолчанию русский.
Поэтому страница на другом языке ставит вокруг справочника свой провайдер:

```vue
<UidLocaleProvider :locale="kitLocale"> <!-- a kit locale object -->
  <OpenApiReference :spec="text" :labels="de" />
</UidLocaleProvider>
```

## Внешние ссылки

`$ref` на другой файл (`common.yaml#/components/schemas/Error`) разрешается
только через свойство `external`. Без него такая ссылка остаётся
неразрешённой и показывается своим именем. Функция получает URL-часть ссылки
ровно так, как она написана (`common.yaml`), синхронно, и возвращает
разобранный документ или `undefined`, если его нет. Каждый URL
запрашивается один раз за загрузку.

Раз вызов синхронный, загрузите файлы заранее:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { parseSpec } from '@dskripchenko/openapi'
import { OpenApiReference } from '@dskripchenko/openapi/vue'

const text = ref<string | null>(null)
const files = new Map<string, unknown>()
const external = (url: string) => files.get(url)

onMounted(async () => {
  for (const name of ['common.yaml']) {
    files.set(name, parseSpec(await (await fetch(`/specs/${name}`)).text()).value)
  }
  text.value = await (await fetch('/specs/openapi.yaml')).text()
})
</script>

<template>
  <OpenApiReference v-if="text" :spec="text" :external="external" />
</template>
```

Ссылки внутри внешнего документа, указывающие в тот же документ (`#/Pet`),
разрешаются внутри него. Сам пакет никогда ничего не загружает.

## Раскладка под фиксированной шапкой

Навигация и колонка примеров прилипают при прокрутке. Под фиксированной
шапкой сайта задайте `--oa-sticky-top` равным высоте шапки, чтобы они
останавливались под ней; якоря прокручиваются с тем же отступом:

```css
:root {
  --oa-sticky-top: 64px;
}
```

Остальные переменные — ширина навигации, отступы, цвета методов —
перечислены в разделе [темы](theming.md).

## OaSchema и контекст

`OaSchema` (дерево схемы) и `useReference`/`referenceKey` (общее состояние:
спецификация, строки, выбранный сервер, учётные данные, транспорт)
экспортируются для построения собственных частей внутри справочника. Они
читают контекст, который предоставляет `OpenApiReference`, и вне его
использоваться не могут.
