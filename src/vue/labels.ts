/**
 * Interface strings. English and Russian ship with the package; a host passes
 * `labels` to override any of them, or a whole dictionary for another language.
 */
export interface OpenApiLabels {
  search: string
  operations: string
  schemas: string
  webhooks: string
  servers: string
  authentication: string
  noAuth: string
  parameters: string
  requestBody: string
  responses: string
  headers: string
  required: string
  deprecated: string
  default: string
  example: string
  examples: string
  schema: string
  enum: string
  noBody: string
  samples: string
  tryIt: string
  send: string
  sending: string
  response: string
  status: string
  time: string
  body: string
  clear: string
  invalidJson: string
  networkError: string
  token: string
  username: string
  password: string
  getToken: string
  clientId: string
  clientSecret: string
  scopes: string
  loadError: string
  issues: string
  callbacks: string
  links: string
  externalDocs: string
  terms: string
  specs: string
  noResults: string
  version: string
  copy: string
  show: string
  hide: string
  // shell
  settings: string
  customServer: string
  // links
  copyLink: string
  linkCopied: string
  includeCredentials: string
  credentialsWarning: string
  prefilled: string
  // standalone
  theme: string
  themeLight: string
  themeDark: string
  themeSystem: string
  language: string
  // search
  generatedSample: string
  externalExample: string
  useExample: string
  searchResults: string
  tag: string
  section: string
  // oauth
  authorize: string
  redirectUri: string
  redirectHint: string
  flowAuthorizationCode: string
  flowImplicit: string
  flowClientCredentials: string
  flowPassword: string
  logOut: string
  forget: string
  savedInBrowser: string
  /** `{n}` is the number of minutes. */
  expiresIn: string
  tokenExpired: string
  popupBlocked: string
  popupClosed: string
  stateMismatch: string
  // files
  /** Try-it: the body as a form, and the toggle back to it. */
  formView: string
  /** Try-it: the form body as JSON text. */
  rawJson: string
  /** Try-it: the file of a binary body. */
  file: string
  cancel: string
  cancelled: string
  /** Response view: formatted JSON and the body as received. */
  pretty: string
  raw: string
  download: string
  downloadSpec: string
  copyOperationLink: string
  operationLinkCopied: string
  // tryit
  /** Try-it groups of parameters by location. */
  locPath: string
  locQuery: string
  locHeader: string
  locCookie: string
  /** Adds an undeclared name/value row to a group. */
  add: string
  addItem: string
  remove: string
  /** Placeholders of a name/value row. */
  name: string
  value: string
  /** The body edited as JSON text (the toggle next to "Form"). */
  jsonView: string
  /** An optional value left out of the request. */
  notSet: string
  /** The value is JSON null. */
  nullValue: string
  /** The choice among `oneOf`/`anyOf` branches. */
  variant: string
  /** The request preview: its title and `{n}` headers. */
  willBeSent: string
  headerCount: string
  /** `{n}` items of an array. */
  itemCount: string
  copyUrl: string
  urlCopied: string
  /** The section with the request to send. */
  request: string
}

export const en: OpenApiLabels = {
  search: 'Search',
  operations: 'Operations',
  schemas: 'Schemas',
  webhooks: 'Webhooks',
  servers: 'Server',
  authentication: 'Authentication',
  noAuth: 'No authentication',
  parameters: 'Parameters',
  requestBody: 'Request body',
  responses: 'Responses',
  headers: 'Headers',
  required: 'required',
  deprecated: 'deprecated',
  default: 'Default',
  example: 'Example',
  examples: 'Examples',
  schema: 'Schema',
  enum: 'Allowed values',
  noBody: 'No body',
  samples: 'Request samples',
  tryIt: 'Try it',
  send: 'Send',
  sending: 'Sending…',
  response: 'Response',
  status: 'Status',
  time: 'Time',
  body: 'Body',
  clear: 'Clear',
  invalidJson: 'The body is not valid JSON; it is sent as typed.',
  networkError: 'The request did not reach the server',
  token: 'Token',
  username: 'Username',
  password: 'Password',
  getToken: 'Get token',
  clientId: 'Client ID',
  clientSecret: 'Client secret',
  scopes: 'Scopes',
  loadError: 'The specification could not be read',
  issues: 'Problems in the specification',
  callbacks: 'Callbacks',
  links: 'Links',
  externalDocs: 'More',
  terms: 'Terms of service',
  specs: 'API',
  noResults: 'Nothing found',
  version: 'Version',
  copy: 'Copy',
  show: 'Show',
  hide: 'Hide',
  // shell
  settings: 'Server and authentication',
  customServer: 'Another URL…',
  // links
  copyLink: 'Copy link',
  linkCopied: 'Copied',
  includeCredentials: 'Include credentials',
  credentialsWarning: 'The link will carry your keys and passwords: anyone who gets it can use them.',
  prefilled: 'Form filled from a link — check the values before sending',
  // standalone
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'System',
  language: 'Language',
  // search
  generatedSample: 'Generated sample',
  externalExample: 'Open the example',
  useExample: 'Put into try-it',
  searchResults: 'Search results',
  tag: 'Tag',
  section: 'Section',
  // oauth
  authorize: 'Authorize',
  redirectUri: 'Redirect URI',
  redirectHint: 'The identity provider must allow this redirect URI.',
  flowAuthorizationCode: 'Authorization code',
  flowImplicit: 'Implicit',
  flowClientCredentials: 'Client credentials',
  flowPassword: 'Password',
  logOut: 'Log out',
  forget: 'Forget',
  savedInBrowser: 'Saved in this browser',
  expiresIn: 'expires in {n} min',
  tokenExpired: 'expired',
  popupBlocked: 'The browser blocked the sign-in window. Allow pop-ups for this page and try again.',
  popupClosed: 'The sign-in window was closed before it finished.',
  stateMismatch: 'The sign-in response does not match the request. Try again.',
  // files
  formView: 'Form',
  rawJson: 'Raw JSON',
  file: 'File',
  cancel: 'Cancel',
  cancelled: 'Cancelled',
  pretty: 'Pretty',
  raw: 'Raw',
  download: 'Download',
  downloadSpec: 'Download spec',
  copyOperationLink: 'Copy link to this operation',
  operationLinkCopied: 'Link copied',
  // tryit
  locPath: 'Path',
  locQuery: 'Query',
  locHeader: 'Headers',
  locCookie: 'Cookies',
  add: 'Add',
  addItem: 'Add item',
  remove: 'Remove',
  name: 'Name',
  value: 'Value',
  jsonView: 'JSON',
  notSet: 'not set',
  nullValue: 'null',
  variant: 'Variant',
  willBeSent: 'What will be sent',
  headerCount: 'headers: {n}',
  itemCount: 'items: {n}',
  copyUrl: 'Copy URL',
  urlCopied: 'Copied',
  request: 'Request',
}

export const ru: OpenApiLabels = {
  search: 'Поиск',
  operations: 'Операции',
  schemas: 'Схемы',
  webhooks: 'Вебхуки',
  servers: 'Сервер',
  authentication: 'Авторизация',
  noAuth: 'Без авторизации',
  parameters: 'Параметры',
  requestBody: 'Тело запроса',
  responses: 'Ответы',
  headers: 'Заголовки',
  required: 'обязательный',
  deprecated: 'устарело',
  default: 'По умолчанию',
  example: 'Пример',
  examples: 'Примеры',
  schema: 'Схема',
  enum: 'Допустимые значения',
  noBody: 'Без тела',
  samples: 'Примеры запроса',
  tryIt: 'Попробовать',
  send: 'Отправить',
  sending: 'Отправка…',
  response: 'Ответ',
  status: 'Статус',
  time: 'Время',
  body: 'Тело',
  clear: 'Очистить',
  invalidJson: 'Тело — не корректный JSON; оно уйдёт как набрано.',
  networkError: 'Запрос не дошёл до сервера',
  token: 'Токен',
  username: 'Логин',
  password: 'Пароль',
  getToken: 'Получить токен',
  clientId: 'Client ID',
  clientSecret: 'Client secret',
  scopes: 'Права (scopes)',
  loadError: 'Спецификацию не удалось прочитать',
  issues: 'Проблемы в спецификации',
  callbacks: 'Колбэки',
  links: 'Ссылки',
  externalDocs: 'Подробнее',
  terms: 'Условия использования',
  specs: 'API',
  noResults: 'Ничего не найдено',
  version: 'Версия',
  copy: 'Копировать',
  show: 'Показать',
  hide: 'Скрыть',
  // shell
  settings: 'Сервер и авторизация',
  customServer: 'Другой адрес…',
  // links
  copyLink: 'Скопировать ссылку',
  linkCopied: 'Скопировано',
  includeCredentials: 'Включить учётные данные',
  credentialsWarning: 'Ссылка унесёт ваши ключи и пароли: ими сможет воспользоваться любой, кто её получит.',
  prefilled: 'Форма заполнена по ссылке — проверьте значения перед отправкой',
  // standalone
  theme: 'Тема',
  themeLight: 'Светлая',
  themeDark: 'Тёмная',
  themeSystem: 'Как в системе',
  language: 'Язык',
  // search
  generatedSample: 'Сгенерированный пример',
  externalExample: 'Открыть пример',
  useExample: 'Подставить в «Попробовать»',
  searchResults: 'Результаты поиска',
  tag: 'Тег',
  section: 'Раздел',
  // oauth
  authorize: 'Войти',
  redirectUri: 'Redirect URI',
  redirectHint: 'Этот адрес возврата должен быть разрешён у провайдера.',
  flowAuthorizationCode: 'Код авторизации',
  flowImplicit: 'Implicit',
  flowClientCredentials: 'Client credentials',
  flowPassword: 'Пароль',
  logOut: 'Выйти',
  forget: 'Забыть',
  savedInBrowser: 'Сохранено в этом браузере',
  expiresIn: 'истекает через {n} мин',
  tokenExpired: 'истёк',
  popupBlocked: 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этой страницы и повторите.',
  popupClosed: 'Окно входа закрыли до завершения.',
  stateMismatch: 'Ответ входа не соответствует запросу. Повторите.',
  // files
  formView: 'Форма',
  rawJson: 'Как JSON',
  file: 'Файл',
  cancel: 'Отменить',
  cancelled: 'Запрос отменён',
  pretty: 'Форматировать',
  raw: 'Как есть',
  download: 'Скачать',
  downloadSpec: 'Скачать спецификацию',
  copyOperationLink: 'Скопировать ссылку на операцию',
  operationLinkCopied: 'Ссылка скопирована',
  // tryit
  locPath: 'Путь',
  locQuery: 'Query-параметры',
  locHeader: 'Заголовки',
  locCookie: 'Cookies',
  add: 'Добавить',
  addItem: 'Добавить элемент',
  remove: 'Удалить',
  name: 'Имя',
  value: 'Значение',
  jsonView: 'JSON',
  notSet: 'не задано',
  nullValue: 'null',
  variant: 'Вариант',
  willBeSent: 'Что уйдёт',
  headerCount: 'заголовков: {n}',
  itemCount: 'элементов: {n}',
  copyUrl: 'Скопировать URL',
  urlCopied: 'Скопировано',
  request: 'Запрос',
}

export const LOCALES: Record<string, OpenApiLabels> = { en, ru }
