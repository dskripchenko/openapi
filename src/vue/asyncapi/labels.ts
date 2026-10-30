export interface AsyncApiLabels {
  send: string
  receive: string
  operations: string
  channels: string
  channel: string
  messages: string
  message: string
  schemas: string
  servers: string
  parameters: string
  headers: string
  payload: string
  payloadIn: (format: string) => string
  example: string
  bindings: string
  reply: string
  replyAddress: string
  correlationId: string
  contentType: string
  protocol: string
  variables: string
  deprecated: string
  loadError: string
  noOperations: string
  downloadSpec: string
}

export const asyncEn: AsyncApiLabels = {
  send: 'Send',
  receive: 'Receive',
  operations: 'Operations',
  channels: 'Channels',
  channel: 'Channel',
  messages: 'Messages',
  message: 'Message',
  schemas: 'Schemas',
  servers: 'Servers',
  parameters: 'Parameters',
  headers: 'Headers',
  payload: 'Payload',
  payloadIn: (format) => `Payload (${format})`,
  example: 'Example',
  bindings: 'Bindings',
  reply: 'Reply',
  replyAddress: 'Reply address',
  correlationId: 'Correlation id',
  contentType: 'Content type',
  protocol: 'Protocol',
  variables: 'Variables',
  deprecated: 'Deprecated',
  loadError: 'The AsyncAPI document cannot be read',
  noOperations: 'The document describes no operations',
  downloadSpec: 'Download the document',
}

export const asyncRu: AsyncApiLabels = {
  send: 'Отправка',
  receive: 'Приём',
  operations: 'Операции',
  channels: 'Каналы',
  channel: 'Канал',
  messages: 'Сообщения',
  message: 'Сообщение',
  schemas: 'Схемы',
  servers: 'Серверы',
  parameters: 'Параметры',
  headers: 'Заголовки',
  payload: 'Содержимое',
  payloadIn: (format) => `Содержимое (${format})`,
  example: 'Пример',
  bindings: 'Привязки',
  reply: 'Ответ',
  replyAddress: 'Адрес ответа',
  correlationId: 'Идентификатор корреляции',
  contentType: 'Тип содержимого',
  protocol: 'Протокол',
  variables: 'Переменные',
  deprecated: 'Устарело',
  loadError: 'Документ AsyncAPI не читается',
  noOperations: 'В документе нет операций',
  downloadSpec: 'Скачать документ',
}

export const ASYNC_LOCALES: Record<string, AsyncApiLabels> = { en: asyncEn, ru: asyncRu }
