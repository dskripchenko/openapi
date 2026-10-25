/** Strings of the editor; the reference's own strings live in ../labels.ts. */
export interface EditorLabels {
  visual: string
  source: string
  preview: string
  info: string
  servers: string
  tags: string
  paths: string
  schemas: string
  securitySchemes: string
  addPath: string
  addOperation: string
  addSchema: string
  addScheme: string
  addServer: string
  addTag: string
  addParameter: string
  addResponse: string
  addProperty: string
  addVariant: string
  addVariable: string
  addMediaType: string
  remove: string
  rename: string
  title: string
  version: string
  summary: string
  description: string
  termsOfService: string
  contactName: string
  contactEmail: string
  contactUrl: string
  licenseName: string
  licenseUrl: string
  url: string
  name: string
  in: string
  type: string
  format: string
  required: string
  deprecated: string
  nullable: string
  readOnly: string
  writeOnly: string
  enumValues: string
  default: string
  example: string
  pattern: string
  minimum: string
  maximum: string
  minLength: string
  maxLength: string
  minItems: string
  maxItems: string
  items: string
  properties: string
  reference: string
  variants: string
  operationId: string
  operationTags: string
  parameters: string
  requestBody: string
  responses: string
  statusCode: string
  mediaType: string
  security: string
  inheritSecurity: string
  noSecurity: string
  scheme: string
  bearerFormat: string
  headerName: string
  tokenUrl: string
  authorizationUrl: string
  scopes: string
  openIdConnectUrl: string
  path: string
  method: string
  issues: string
  noIssues: string
  parseError: string
  swagger2: string
  convert: string
  empty: string
  create: string
  newDocumentTitle: string
  any: string
  values: string
}

export const editorEn: EditorLabels = {
  visual: 'Visual',
  source: 'Source',
  preview: 'Preview',
  info: 'Info',
  servers: 'Servers',
  tags: 'Tags',
  paths: 'Paths',
  schemas: 'Schemas',
  securitySchemes: 'Security schemes',
  addPath: 'Add path',
  addOperation: 'Add operation',
  addSchema: 'Add schema',
  addScheme: 'Add scheme',
  addServer: 'Add server',
  addTag: 'Add tag',
  addParameter: 'Add parameter',
  addResponse: 'Add response',
  addProperty: 'Add property',
  addVariant: 'Add variant',
  addVariable: 'Add variable',
  addMediaType: 'Add media type',
  remove: 'Remove',
  rename: 'Rename',
  title: 'Title',
  version: 'Version',
  summary: 'Summary',
  description: 'Description (markdown)',
  termsOfService: 'Terms of service URL',
  contactName: 'Contact name',
  contactEmail: 'Contact email',
  contactUrl: 'Contact URL',
  licenseName: 'License',
  licenseUrl: 'License URL',
  url: 'URL',
  name: 'Name',
  in: 'In',
  type: 'Type',
  format: 'Format',
  required: 'Required',
  deprecated: 'Deprecated',
  nullable: 'Nullable',
  readOnly: 'Read-only',
  writeOnly: 'Write-only',
  enumValues: 'Allowed values',
  default: 'Default',
  example: 'Example',
  pattern: 'Pattern',
  minimum: 'Minimum',
  maximum: 'Maximum',
  minLength: 'Min length',
  maxLength: 'Max length',
  minItems: 'Min items',
  maxItems: 'Max items',
  items: 'Items',
  properties: 'Properties',
  reference: 'Schema',
  variants: 'Variants',
  operationId: 'Operation ID',
  operationTags: 'Tags',
  parameters: 'Parameters',
  requestBody: 'Request body',
  responses: 'Responses',
  statusCode: 'Status',
  mediaType: 'Media type',
  security: 'Security',
  inheritSecurity: 'As the document',
  noSecurity: 'None (public)',
  scheme: 'Scheme',
  bearerFormat: 'Bearer format',
  headerName: 'Parameter name',
  tokenUrl: 'Token URL',
  authorizationUrl: 'Authorization URL',
  scopes: 'Scopes (name: description per line)',
  openIdConnectUrl: 'OpenID Connect URL',
  path: 'Path',
  method: 'Method',
  issues: 'Problems',
  noIssues: 'No problems',
  parseError: 'The text cannot be read',
  swagger2: 'This is a Swagger 2.0 document. The visual editor works with OpenAPI 3; convert it to 3.1 or edit the source.',
  convert: 'Convert to OpenAPI 3.1',
  empty: 'The document is empty.',
  create: 'Create a document',
  newDocumentTitle: 'New API',
  any: 'any',
  values: 'Values',
}

export const editorRu: EditorLabels = {
  visual: 'Конструктор',
  source: 'Исходник',
  preview: 'Просмотр',
  info: 'Сведения',
  servers: 'Серверы',
  tags: 'Теги',
  paths: 'Пути',
  schemas: 'Схемы',
  securitySchemes: 'Схемы авторизации',
  addPath: 'Добавить путь',
  addOperation: 'Добавить операцию',
  addSchema: 'Добавить схему',
  addScheme: 'Добавить схему авторизации',
  addServer: 'Добавить сервер',
  addTag: 'Добавить тег',
  addParameter: 'Добавить параметр',
  addResponse: 'Добавить ответ',
  addProperty: 'Добавить свойство',
  addVariant: 'Добавить вариант',
  addVariable: 'Добавить переменную',
  addMediaType: 'Добавить тип содержимого',
  remove: 'Удалить',
  rename: 'Переименовать',
  title: 'Название',
  version: 'Версия',
  summary: 'Кратко',
  description: 'Описание (markdown)',
  termsOfService: 'Условия использования (URL)',
  contactName: 'Контакт',
  contactEmail: 'Email',
  contactUrl: 'Сайт',
  licenseName: 'Лицензия',
  licenseUrl: 'URL лицензии',
  url: 'URL',
  name: 'Имя',
  in: 'Где',
  type: 'Тип',
  format: 'Формат',
  required: 'Обязательный',
  deprecated: 'Устарело',
  nullable: 'Может быть null',
  readOnly: 'Только чтение',
  writeOnly: 'Только запись',
  enumValues: 'Допустимые значения',
  default: 'По умолчанию',
  example: 'Пример',
  pattern: 'Шаблон (regex)',
  minimum: 'Минимум',
  maximum: 'Максимум',
  minLength: 'Мин. длина',
  maxLength: 'Макс. длина',
  minItems: 'Мин. элементов',
  maxItems: 'Макс. элементов',
  items: 'Элементы',
  properties: 'Свойства',
  reference: 'Схема',
  variants: 'Варианты',
  operationId: 'ID операции',
  operationTags: 'Теги',
  parameters: 'Параметры',
  requestBody: 'Тело запроса',
  responses: 'Ответы',
  statusCode: 'Статус',
  mediaType: 'Тип содержимого',
  security: 'Авторизация',
  inheritSecurity: 'Как у документа',
  noSecurity: 'Без авторизации',
  scheme: 'Схема',
  bearerFormat: 'Формат токена',
  headerName: 'Имя параметра',
  tokenUrl: 'URL токена',
  authorizationUrl: 'URL авторизации',
  scopes: 'Права (имя: описание, по строке)',
  openIdConnectUrl: 'URL OpenID Connect',
  path: 'Путь',
  method: 'Метод',
  issues: 'Проблемы',
  noIssues: 'Проблем нет',
  parseError: 'Текст не читается',
  swagger2: 'Это документ Swagger 2.0. Конструктор работает с OpenAPI 3: сконвертируйте документ в 3.1 или правьте исходник.',
  convert: 'Сконвертировать в OpenAPI 3.1',
  empty: 'Документ пуст.',
  create: 'Создать документ',
  newDocumentTitle: 'Новый API',
  any: 'любой',
  values: 'Значения',
}

export const EDITOR_LOCALES: Record<string, EditorLabels> = { en: editorEn, ru: editorRu }
