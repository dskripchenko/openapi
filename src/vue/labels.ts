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
}

export const LOCALES: Record<string, OpenApiLabels> = { en, ru }
