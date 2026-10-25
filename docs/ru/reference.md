# OpenApiReference

Страница справочника API для спецификации Swagger 2.0, OpenAPI 3.0 или
OpenAPI 3.1 — или для нескольких спецификаций с переключателем (см.
[несколько спецификаций](#несколько-спецификаций)).

```vue
<script setup lang="ts">
import { OpenApiReference } from '@dskripchenko/openapi/vue'
</script>

<template>
  <OpenApiReference :spec="text" locale="en" />
</template>
```

На странице две колонки. Слева — навигация: полнотекстовый поиск, операции,
сгруппированные по тегам, вебхуки и схемы. Справа — документ: название,
версия и описание, элемент «Download spec», панели сервера и учётных данных,
затем каждая операция с параметрами, телом запроса, ответами (деревьями схем
с их примерами), колбэками, примерами запроса и панелью «Try it», а в конце —
схемы из `components.schemas`.

«Download spec» сохраняет документ в том виде, в каком он передан, — не
нормализованную копию 3.1 — в JSON или YAML, с именем
`{title}-{version}.json` / `.yaml`.

Целая страница с панелью заголовка и переключателями темы и языка или
страница без шага сборки описаны в разделе
[отдельная страница и OpenApiPage](standalone.md).

Ссылки из спецификации — URL контакта, лицензии и условий использования из
`info` и `externalDocs` операции — показываются, только если это адреса
`http(s)`, `mailto` или относительные; любые другие ссылки опускаются.

При ширине меньше 1100 px примеры и try-it уходят под описание операции;
меньше 760 px — навигация встаёт над документом.

## Свойства

| Свойство | Тип | По умолчанию | |
|---|---|---|---|
| `spec` | `SpecInput` | — | Спецификация: текст YAML или JSON, разобранный объект или функция, возвращающая promise одного из них. |
| `specs` | `SpecSource[]` | — | Несколько спецификаций на одной странице вместо `spec`. См. [несколько спецификаций](#несколько-спецификаций). |
| `active` | `string` | первая спецификация | id открытой спецификации; используйте `v-model:active`. |
| `send` | `SendFn` | `fetch` страницы | Отправляет запросы try-it. См. [прокси](#отправка-через-свой-сервер). |
| `tryIt` | `boolean` | `true` | `false` скрывает панели try-it; примеры остаются. |
| `locale` | `string` | — | `'en'` или `'ru'`. См. [языки](#языки). |
| `labels` | `Partial<OpenApiLabels>` | `{}` | Замены отдельных строк интерфейса. |
| `snippetTargets` | `SnippetTarget[]` | все 13 | Языки, предлагаемые для примеров запроса. |
| `defaultSnippet` | `SnippetTarget` | `'curl'` | Язык, показанный первым. |
| `baseUrl` | `string` | origin страницы | База, относительно которой разрешается относительный URL сервера. |
| `external` | `(url: string) => unknown \| undefined` | — | Загружает внешние документы `$ref`. Без него ни один не загружается. |
| `hashNavigation` | `boolean` | `true` | Записывать `location.hash`, когда пункт открыт из навигации. |
| `persistCredentials` | `boolean \| 'session' \| 'local'` | `false` | Хранить ключи API и токены между визитами; см. [хранение учётных данных](#хранение-учётных-данных). |
| `oauthRedirectUrl` | `string` | URL страницы | Redirect URI для OAuth; см. [OAuth2 и OpenID Connect](#oauth2-и-openid-connect). |

Если передана функция, спецификация загружается, когда её впервые
показывают; пока она грузится, виден индикатор загрузки. Спецификация
загружается заново, когда меняется `spec` или `external`. Оба сравниваются по ссылке: передавайте новый объект, а не меняйте старый на
месте, и держите функцию `external` неизменной (объявите её один раз в
`<script setup>`, а не прямо в шаблоне).

## События

| Событие | Данные | |
|---|---|---|
| `loaded` | `LoadedSpec`, `id: string` | После каждой успешной загрузки: нормализованный документ, его операции и группы (см. [`loadSpec`](core.md#загрузка-спецификации)) и id спецификации. |
| `error` | `Error`, `id: string` | Спецификацию не удалось прочитать: `YamlError`, `JsonError` или `OpenApiError` либо собственная ошибка функции-загрузчика. Страница показывает сообщение вместо справочника. |
| `update:active` | `id: string` | Открыта другая спецификация — из переключателя, по глубокой ссылке или через `open`. |

С одиночным `spec` id равен `'spec'`.

## Доступное снаружи

Через ref шаблона:

| | |
|---|---|
| `go(anchor: string, options?: { tryIt?: boolean }): Promise<void>` | Прокручивает к `'operation/{id}'`, `'schema/{name}'` или `'tag/{name}'` в открытой спецификации — при `tryIt: true` к панели try-it операции, — отмечает пункт в навигации и, при `hashNavigation`, записывает hash. |
| `open(id: string): Promise<void>` | Открывает другую спецификацию из `specs`, при необходимости загружая её. |
| `spec` | `LoadedSpec` открытой спецификации или `null`, пока она загружается или если её не удалось прочитать. |
| `active` | id открытой спецификации. |

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
`components.schemas` — якорь `#schema/{name}`, у каждого тега —
`#tag/{name}`. Идентификатор — это `operationId`; операция без него (или с
уже занятым `operationId`) получает слаг из метода и пути, например
`get-pets-id` для `GET /pets/{id}`. Операции вебхуков получают
`webhook-{method}-{name}`. Операция с несколькими тегами показывается в
разделе каждого тега; якорь есть только у первой копии, так что глубокая
ссылка ведёт на неё.

Когда страница открывается с таким якорем в `location.hash`, а также всякий
раз, когда hash потом меняется на такой якорь, справочник прокручивает к
нему. С `hashNavigation` (по умолчанию) щелчок в навигации заменяет hash, так
что адрес можно скопировать и отправить; в заголовке каждой операции есть
ещё и кнопка, копирующая ссылку на неё. Отключите это, если справочник
встроен в страницу, которая использует hash для своей маршрутизации:

```vue
<OpenApiReference :spec="text" :hash-navigation="false" />
```

Ссылки, построенные для Scalar (`#{doc}/tag/{tag}/{METHOD}{path}`,
`#model/{name}`), открывают те же разделы, а ссылка может нести заполненную
форму try-it. И то и другое описано в разделе
[глубокие ссылки и предзаполненные ссылки](links.md).

## Поиск

Поле поиска вверху навигации ищет по открытой спецификации: операциям
(краткое описание, путь, id операции, метод, теги, имена и описания
параметров, описание, имена свойств тел и ответов), тегам (имя и описание),
схемам (имя, title, описание, имена свойств) и заголовкам описания
документа. Совпасть должно каждое слово запроса; результаты ранжируются по
тому, где слово совпало, — название или путь весят больше описания, — и как:
всё поле целиком, начало слова или где угодно.

По мере ввода навигация сужается до подходящих пунктов, а под полем
открывается список лучших результатов с отмеченными словами. **↑** и **↓**
перемещают по списку, **Enter** открывает выбранный результат, **Esc**
закрывает список, а повторное нажатие очищает поле. **/** (вне текстового
поля) и **Ctrl+K** / **⌘K** ставят курсор в поиск. Если спецификаций
несколько, поиск идёт по открытой.

## Примеры

Если у типа содержимого несколько именованных примеров — в теле запроса и в
каждом ответе, — они показываются чипами над примером; у выбранного видно
описание, а пример, заданный через `externalValue`, — это ссылка на него
(никогда не загружается). Без примеров тело запроса показывает пример,
сгенерированный по схеме.

В try-it у тела с несколькими примерами есть выбор «Example» (первым —
«Generated sample»); выбор примера заменяет текст тела. Именованные примеры
параметра показываются чипами рядом с ним, и щелчок по примеру с простым
значением подставляет его в поле try-it.

## Несколько спецификаций

`specs` размещает на одной странице несколько спецификаций — разные API или
версии одного:

```ts
interface SpecSource {
  id: string          // used in deep links and v-model:active
  name?: string       // shown in the switcher
  spec: SpecInput     // string | object | (() => Promise<string | object>)
}
```

Оба типа экспортируются из `@dskripchenko/openapi/vue`. Если спецификаций
больше одной, вверху навигации появляется выпадающий список с поиском для
переключения между ними. В нём показывается `name` спецификации, иначе
заголовок уже загруженной спецификации, иначе её id; его доступное имя —
текст `specs`.

Спецификация, заданная функцией, загружается при первом открытии — пока она
грузится, показывается индикатор загрузки, а если загрузка не удалась,
переключатель остаётся над сообщением об ошибке, чтобы можно было выбрать
другую спецификацию. Загруженная спецификация хранится под своим id,
поэтому возврат к ней мгновенный; если задан `external`, сохранённые
спецификации сбрасываются при каждом изменении источников.

Например, спецификации, которые бэкенд отдаёт по версиям API, — каждая
запрашивается, только когда читатель её открывает:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiReference, type SpecSource } from '@dskripchenko/openapi/vue'

const specs: SpecSource[] = [
  { id: 'v1', name: 'API v1', spec: () => fetch('/api/doc/v1').then((r) => r.json()) },
  { id: 'admin', name: 'Admin API', spec: () => fetch('/api/doc/admin').then((r) => r.json()) },
]
const active = ref('v1')
</script>

<template>
  <OpenApiReference v-model:active="active" :specs="specs" locale="en" />
</template>
```

Сохранённая спецификация используется снова, пока её источник тот же. Для
функции-загрузчика это значит «по-прежнему функция»: новая функция под тем же
id получает уже загруженный результат, поэтому массив `specs`, записанный
прямо в шаблоне, не загружается заново при каждой отрисовке. Текст и объекты
сравниваются по ссылке: новая строка или новый объект под тем же id — новый
источник, и он загружается заново.

Что сохраняется и что сбрасывается при переключении:

- данные, введённые в панели авторизации, хранятся отдельно для каждой
  спецификации и возвращаются, когда читатель к ней возвращается;
- выбор сервера сбрасывается на первый сервер открытой спецификации;
- поле поиска очищается;
- выбранный для примеров язык остаётся.

Когда спецификаций несколько, якоря содержат id спецификации:
`#{id}/operation/{opId}`, `#{id}/schema/{name}` и `#{id}/tag/{name}`, а один
`#{id}` открывает спецификацию. Открытие такого адреса — при загрузке или при
смене hash — сначала открывает эту спецификацию, затем раздел. `go`
принимает якорь без id и работает в открытой спецификации; `open(id)`
переключает спецификации. Массив `specs` из одного элемента ведёт себя как
`spec`: без переключателя и без id в якорях.

## Try it

У каждой операции (кроме вебхуков) есть панель «Try it»: поле на каждый
параметр, сгруппированные по `path`, `query`, `header` и `cookie`, тело с
выбором типа содержимого и кнопка «Send». Поля изначально заполнены
значением `example` или `default` параметра, а для обязательных параметров —
значением, сгенерированным по схеме; тело — первым примером типа содержимого
или примером, сгенерированным по его схеме.

Введённое читается по схеме параметра: числа и логические значения
преобразуются, массивы и объекты читаются как JSON (массив можно ввести и
как `a, b, c`).

**Тело** зависит от типа содержимого:

- **JSON, XML, текст** — текстовое поле; тело отправляется как набрано. Для
  типа JSON некорректное тело вызывает предупреждение, но всё равно
  отправляется.
- **`multipart/form-data`** и **`application/x-www-form-urlencoded`** с
  объектной схемой — форма с полем на каждое свойство (кроме `readOnly`). В
  multipart свойство с `format: binary` (или с `contentMediaType`) получает
  выбор файла, а массив таких принимает несколько файлов; допустимые типы
  берутся из `encoding` или из схемы. «Raw JSON» переключает на поля в виде
  текста JSON, «Form» — обратно.
- **Бинарное тело** — `application/octet-stream`, картинки, аудио, видео,
  PDF, схема с `format: binary` — один выбор файла; файл и есть всё тело.

Пока запрос выполняется, «Send» показывает «Sending…» и появляется кнопка
«Cancel»; отмена обрывает запрос (см. `signal`
[ниже](#отправка-через-свой-сервер)), отбрасывает запоздавший ответ и
сообщает «Cancelled».

**Ответ** показывает статус, время, размер, заголовки и тело. Тело JSON
форматируется, с переключателем «Pretty» / «Raw». Нетекстовое тело
(`HttpResponse.blob`) — это превью картинки для `image/*` и кнопка
«Download» в остальных случаях, с именем из `Content-Disposition` или
`response.{subtype}`. Если запрос не дошёл до сервера — сетевая ошибка или
браузер заблокировал кросс-доменный запрос, — панель сообщает об этом с
текстом браузера.

Примеры запроса рядом с панелью печатают тот же запрос, который делает
«Send», с введёнными значениями, выбранными файлами (по имени) и учётными
данными. Язык, выбранный в одной операции, используется во всех.

«Copy link» панели делает ссылку, которая открывает эту операцию с формой в
текущем виде; см. [предзаполненные ссылки](links.md#предзаполненные-ссылки).

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
type SendFn = (request: HttpRequest, options?: SendFnOptions) => Promise<HttpResponse>

interface SendFnOptions {
  signal?: AbortSignal                // aborted when the user presses "Cancel"
}

interface HttpRequest {
  method: string                      // 'GET', 'POST', …
  url: string                         // absolute, with the query string
  headers: [string, string][]
  body?: {
    mediaType: string
    text?: string                     // JSON, XML, plain text
    form?: [string, FormValue][]      // urlencoded and multipart fields, in order
    file?: { filename: string; contentType?: string; data?: Blob } // a binary body
  }
}

type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string                        // the body of a textual response
  blob?: Blob                         // the body of any other response
  duration: number                    // milliseconds
  error?: string                      // set when there was no response at all
}
```

На странице — функция, которая отправляет запрос на ваш бэкенд как JSON:

```ts
import type { HttpResponse, SendFn } from '@dskripchenko/openapi'

const send: SendFn = async (request, options) => {
  const started = performance.now()
  try {
    const response = await fetch('/internal/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
      signal: options?.signal,
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

Передавайте `options.signal` в свой `fetch`, как выше, чтобы «Cancel»
останавливал и запрос к вашему бэкенду. Файлы (`data` полей формы и
`body.file`) — это `Blob`, и `JSON.stringify` их не сохраняет: прокси,
которому нужно их переносить, отправляет запрос как `multipart/form-data`.
В ответе JSON нет и `blob`, поэтому для картинок и скачивания бинарных
ответов нужен транспорт, который его возвращает.

URL всегда абсолютный: относительный URL сервера, а для документа без
`servers` — `/`, разрешается относительно `baseUrl`. На бэкенде эндпоинт
читает `HttpRequest`, проверяет, что URL ведёт на разрешённый вами хост,
выполняет запрос и отвечает `HttpResponse`. В Node 20+ саму отправку делает
`sendRequest` из ядра:

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

`send`, который бросает исключение, обрабатывается как сетевая ошибка.
Запросы токенов и discovery из [панели авторизации](#oauth2-и-openid-connect)
тоже идут через `send`: прокси должен пропускать и эти хосты. `send` также
передаёт в свой просмотр [`OpenApiEditor`](editor.md). В отдельной сборке
есть готовый транспорт такого рода с фиксированным контрактом: см.
[прокси](standalone.md#прокси).

## Авторизация

Если документ объявляет `components.securitySchemes`, в шапке страницы есть
панель «Authentication» с полем для каждой схемы:

- **apiKey** — ключ; он уходит в заголовок, параметр запроса или куку,
  названные схемой;
- **http basic** — логин и пароль;
- **http bearer** и другие схемы http — токен, отправляется как
  `Authorization: Bearer …` (или с именем схемы);
- **oauth2** и **openIdConnect** — токен доступа, отправляется как
  `Authorization: Bearer …`; его вводят вручную или получают в панели.

Схемы `mutualTLS` не показываются: браузер не может предъявить клиентский
сертификат из скрипта.

Значения применяются ко всем операциям страницы — и к «Send», и к
примерам. Для каждой операции справочник берёт её `security` (или
документа) и использует первое требование, у всех схем которого есть
значение. Операция с пустым требованием (`security: [{}]` или
`security: []`) отправляется без учётных данных.

### OAuth2 и OpenID Connect

Для схемы oauth2 панель предлагает потоки, которые объявляет схема, — с
переключателем, если их несколько: «Authorization code» (нужны
`authorizationUrl` и `tokenUrl`), «Implicit» (`authorizationUrl`),
«Client credentials» и «Password» (`tokenUrl`). Схема openIdConnect читает
свой discovery-документ (`openIdConnectUrl`) при открытии панели и
предлагает поддерживаемые им потоки, а scopes берёт из `scopes_supported`.

У каждого потока scopes перечислены флажками, сначала отмечены все; токен
запрашивается для отмеченных.

- **Client credentials** и **Password**: «Client ID», «Client secret» (и
  «Username» / «Password») и «Get token». Запрос токена идёт на `tokenUrl`
  (RFC 6749 §4.4, §4.3); с секретом клиент аутентифицируется через HTTP
  Basic, без него `client_id` уходит в форму.
- **Authorization code** (с PKCE, S256) и **Implicit**: «Client ID» (и
  необязательный «Client secret» для потока с кодом), «Redirect URI» и
  «Authorize». У провайдера идентификации открывается окно входа; когда оно
  возвращается, справочник проверяет `state`, а для потока с кодом
  обменивает код на `tokenUrl`, передавая `client_secret` в форме, если он
  введён (публичный клиент полагается только на PKCE).

Токен заполняет поле схемы. Если сервер сообщает срок его жизни
(`expires_in`), панель показывает «expires in N min», затем «expired»;
«Log out» очищает токен.

Запросы токена, обмена кода и discovery идут через `send`, как и try-it. При
транспорте по умолчанию эти эндпоинты должны принимать кросс-доменный запрос
со страницы; с [прокси](#отправка-через-свой-сервер) они идут через ваш
сервер, и CORS не нужен. Само окно входа — обычное окно браузера у
провайдера идентификации.

**Redirect URI** — это `oauthRedirectUrl`, по умолчанию собственный адрес
страницы без query и fragment; его можно поменять в панели. Провайдер
идентификации должен его разрешать. Результат входа доходит до справочника
одним из двух путей, каким раньше:

- справочник следит за окном и читает ответ, как только оно возвращается на
  redirect URI (тот же origin, что у страницы);
- страница на redirect URI отправляет ответ окну, которое её открыло, и
  закрывается. `OpenApiReference` делает это при монтировании, поэтому сама
  страница документации годится в качестве redirect URI. Отдельная страница
  редиректа вызывает `relayOAuthCallback()` из `@dskripchenko/openapi/vue`;
  она отправляет сообщение типа `OAUTH_MESSAGE` только opener'у того же
  origin.

Браузер блокирует окна, открытые не по щелчку; панель сообщает о
заблокированном или закрытом окне и о несовпавшем `state`. Те же запросы
доступны вне компонента: [`fetchOAuthToken`](core.md#токены-oauth2),
`buildAuthorizeUrl`, `exchangeAuthorizationCode` и остальные.

### Хранение учётных данных

По умолчанию учётные данные живут в памяти, пока открыта страница. С
`persistCredentials` они сохраняются между визитами:

| Значение | Где хранятся |
|---|---|
| `false` | нигде (по умолчанию) |
| `true` или `'session'` | `sessionStorage` — пока вкладка не закрыта |
| `'local'` | `localStorage` — пока их не удалят |

Они хранятся по спецификации, под ключом
`dsk-openapi:credentials:{specId}:{info.title}` (`specId` — `spec` при
одиночной спецификации). Хранятся: ключи API, bearer-токены, токены доступа
OAuth и OpenID Connect со сроком действия (истёкший не восстанавливается) и
логины basic. Не хранятся никогда: пароли basic, client ID и секреты, пароли
потока password. При включённом хранении панель пишет «Saved in this
browser» и показывает кнопку «Forget», которая очищает учётные данные
открытой спецификации — в памяти и в хранилище.

## Серверы

Если у документа есть `servers`, панель «Server» перечисляет их, плюс «…»
для своего URL. Переменные сервера получают по полю — выпадающий список,
если у переменной есть `enum`, — заполненному значением `default`. Операция
или путь со своими `servers` использует свой список, с той же выбранной
позицией.

Относительный URL сервера (`/v1`) разрешается относительно `baseUrl`,
который по умолчанию равен origin страницы; документ без `servers`
вызывается по `/` от `baseUrl`. Задайте его, если справочник
отдаётся с другого origin, чем API:

```vue
<OpenApiReference :spec="text" base-url="https://api.example.com" />
```

## Примеры запроса

Выбор примеров предлагает языки из `snippetTargets` в заданном порядке;
`defaultSnippet` — тот, что показан первым, а если его нет в списке, первым
показывается первый язык списка. Чтобы предложить только некоторые:

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

### Все строки

Ключи `OpenApiLabels` с английским текстом. `expiresIn` подставляет число
минут вместо `{n}`. [`OpenApiPage`](standalone.md#openapipage) использует
`theme`, `themeLight`, `themeDark`, `themeSystem` и `language` для своей
панели.

| Ключ | Английский текст |
|---|---|
| `search` | Search |
| `operations` | Operations |
| `schemas` | Schemas |
| `webhooks` | Webhooks |
| `servers` | Server |
| `authentication` | Authentication |
| `noAuth` | No authentication |
| `parameters` | Parameters |
| `requestBody` | Request body |
| `responses` | Responses |
| `headers` | Headers |
| `required` | required |
| `deprecated` | deprecated |
| `default` | Default |
| `example` | Example |
| `examples` | Examples |
| `schema` | Schema |
| `enum` | Allowed values |
| `noBody` | No body |
| `samples` | Request samples |
| `tryIt` | Try it |
| `send` | Send |
| `sending` | Sending… |
| `response` | Response |
| `status` | Status |
| `time` | Time |
| `body` | Body |
| `clear` | Clear |
| `invalidJson` | The body is not valid JSON; it is sent as typed. |
| `networkError` | The request did not reach the server |
| `token` | Token |
| `username` | Username |
| `password` | Password |
| `getToken` | Get token |
| `clientId` | Client ID |
| `clientSecret` | Client secret |
| `scopes` | Scopes |
| `loadError` | The specification could not be read |
| `issues` | Problems in the specification |
| `callbacks` | Callbacks |
| `links` | Links |
| `externalDocs` | More |
| `terms` | Terms of service |
| `specs` | API |
| `noResults` | Nothing found |
| `version` | Version |
| `copy` | Copy |
| `show` | Show |
| `hide` | Hide |
| `copyLink` | Copy link |
| `linkCopied` | Copied |
| `includeCredentials` | Include credentials |
| `credentialsWarning` | The link will carry your keys and passwords: anyone who gets it can use them. |
| `prefilled` | Form filled from a link — check the values before sending |
| `theme` | Theme |
| `themeLight` | Light |
| `themeDark` | Dark |
| `themeSystem` | System |
| `language` | Language |
| `generatedSample` | Generated sample |
| `externalExample` | Open the example |
| `useExample` | Put into try-it |
| `searchResults` | Search results |
| `tag` | Tag |
| `section` | Section |
| `authorize` | Authorize |
| `redirectUri` | Redirect URI |
| `redirectHint` | The identity provider must allow this redirect URI. |
| `flowAuthorizationCode` | Authorization code |
| `flowImplicit` | Implicit |
| `flowClientCredentials` | Client credentials |
| `flowPassword` | Password |
| `logOut` | Log out |
| `forget` | Forget |
| `savedInBrowser` | Saved in this browser |
| `expiresIn` | expires in {n} min |
| `tokenExpired` | expired |
| `popupBlocked` | The browser blocked the sign-in window. Allow pop-ups for this page and try again. |
| `popupClosed` | The sign-in window was closed before it finished. |
| `stateMismatch` | The sign-in response does not match the request. Try again. |
| `formView` | Form |
| `rawJson` | Raw JSON |
| `file` | File |
| `cancel` | Cancel |
| `cancelled` | Cancelled |
| `pretty` | Pretty |
| `raw` | Raw |
| `download` | Download |
| `downloadSpec` | Download spec |
| `copyOperationLink` | Copy link to this operation |
| `operationLinkCopied` | Link copied |

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

[`OpenApiPage`](standalone.md#openapipage) задаёт её равной высоте своей
панели. Остальные переменные — ширина навигации, отступы, цвета методов —
перечислены в разделе [темы](theming.md).

## Контекст

`useReference` и `referenceKey` дают состояние, общее для частей
справочника: спецификацию, строки, выбранный сервер, учётные данные и
транспорт (`ReferenceContext`, `ServerState`). Они экспортируются для
построения собственных частей внутри справочника; они читают контекст,
который предоставляет `OpenApiReference`, и вне его использоваться не
могут.
