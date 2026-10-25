/** Strings of the API block widget; the cards inside use the reference's own (../labels.ts). */
export interface BlockLabels {
  preview: string
  source: string
  constructorTab: string
  parseError: string
  noIssues: string
  issues: string
  /** The block holds a whole OpenAPI document: the constructor does not edit those. */
  documentKind: string
  fixInSource: string
  openSource: string
  requests: string
  request: string
  addRequest: string
  removeRequest: string
  shared: string
  title: string
  baseUrl: string
  method: string
  url: string
  urlHint: string
  summary: string
  description: string
  parameters: string
  addParameter: string
  name: string
  type: string
  required: string
  example: string
  remove: string
  fromUrl: string
  auth: string
  /** The auth select: no auth, bearer, basic… */
  scheme: string
  authInherit: string
  authInheritShared: string
  authNone: string
  bearer: string
  basic: string
  apiKey: string
  oauth2: string
  openIdConnect: string
  keyIn: string
  keyName: string
  bearerFormat: string
  flow: string
  authorizationUrl: string
  tokenUrl: string
  scopes: string
  openIdConnectUrl: string
  body: string
  addBody: string
  mediaType: string
  exampleMode: string
  schemaMode: string
  responses: string
  addResponse: string
  status: string
  noOperations: string
}

export const blockEn: BlockLabels = {
  preview: 'Preview',
  source: 'Source',
  constructorTab: 'Constructor',
  parseError: 'The block does not read',
  noIssues: 'No problems',
  issues: 'Problems',
  documentKind: 'This block is a whole OpenAPI document: edit it in the source. The constructor builds compact requests.',
  fixInSource: 'Fix the source first: the constructor needs a block that reads.',
  openSource: 'Open the source',
  requests: 'Requests',
  request: 'Request',
  addRequest: 'Add request',
  removeRequest: 'Remove request',
  shared: 'Shared',
  title: 'Title',
  baseUrl: 'Base URL',
  method: 'Method',
  url: 'URL',
  urlHint: 'https://api.example.com/users/{id} or /users/{id}; {name} is a path parameter',
  summary: 'Summary',
  description: 'Description (Markdown)',
  parameters: 'Parameters',
  addParameter: 'Add parameter',
  name: 'Name',
  type: 'Type',
  required: 'Required',
  example: 'Example',
  remove: 'Remove',
  fromUrl: 'from the URL',
  auth: 'Authentication',
  scheme: 'Scheme',
  authInherit: 'None',
  authInheritShared: 'Shared',
  authNone: 'None (public)',
  bearer: 'Bearer token',
  basic: 'Basic',
  apiKey: 'API key',
  oauth2: 'OAuth 2.0',
  openIdConnect: 'OpenID Connect',
  keyIn: 'Sent in',
  keyName: 'Name',
  bearerFormat: 'Token format',
  flow: 'Flow',
  authorizationUrl: 'Authorization URL',
  tokenUrl: 'Token URL',
  scopes: 'Scopes (space-separated)',
  openIdConnectUrl: 'Discovery URL',
  body: 'Request body',
  addBody: 'Add body',
  mediaType: 'Media type',
  exampleMode: 'Example',
  schemaMode: 'Schema',
  responses: 'Responses',
  addResponse: 'Add response',
  status: 'Status',
  noOperations: 'The document has no operations.',
}

export const blockRu: BlockLabels = {
  preview: 'Просмотр',
  source: 'Исходник',
  constructorTab: 'Конструктор',
  parseError: 'Блок не читается',
  noIssues: 'Проблем нет',
  issues: 'Проблемы',
  documentKind: 'В блоке целый документ OpenAPI: правьте его в исходнике. Конструктор собирает компактные запросы.',
  fixInSource: 'Сначала исправьте исходник: конструктору нужен читаемый блок.',
  openSource: 'Открыть исходник',
  requests: 'Запросы',
  request: 'Запрос',
  addRequest: 'Добавить запрос',
  removeRequest: 'Удалить запрос',
  shared: 'Общее',
  title: 'Заголовок',
  baseUrl: 'Базовый URL',
  method: 'Метод',
  url: 'URL',
  urlHint: 'https://api.example.com/users/{id} или /users/{id}; {name} — параметр пути',
  summary: 'Кратко',
  description: 'Описание (Markdown)',
  parameters: 'Параметры',
  addParameter: 'Добавить параметр',
  name: 'Имя',
  type: 'Тип',
  required: 'Обязательный',
  example: 'Пример',
  remove: 'Удалить',
  fromUrl: 'из URL',
  auth: 'Аутентификация',
  scheme: 'Схема',
  authInherit: 'Нет',
  authInheritShared: 'Общая',
  authNone: 'Нет (публичный)',
  bearer: 'Bearer-токен',
  basic: 'Basic',
  apiKey: 'API-ключ',
  oauth2: 'OAuth 2.0',
  openIdConnect: 'OpenID Connect',
  keyIn: 'Где передаётся',
  keyName: 'Имя',
  bearerFormat: 'Формат токена',
  flow: 'Поток',
  authorizationUrl: 'URL авторизации',
  tokenUrl: 'URL токена',
  scopes: 'Права (через пробел)',
  openIdConnectUrl: 'URL discovery',
  body: 'Тело запроса',
  addBody: 'Добавить тело',
  mediaType: 'Тип содержимого',
  exampleMode: 'Пример',
  schemaMode: 'Схема',
  responses: 'Ответы',
  addResponse: 'Добавить ответ',
  status: 'Статус',
  noOperations: 'В документе нет операций.',
}

export const BLOCK_LOCALES: Record<string, BlockLabels> = { en: blockEn, ru: blockRu }
