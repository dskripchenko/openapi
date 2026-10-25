/**
 * The shared shapes: the normalized OpenAPI 3.1 document every module reads,
 * source positions, and the HTTP request the snippets and try-it share.
 *
 * The document types are deliberately loose: a real spec carries `x-*`
 * extensions and the odd vendor field, so every object keeps an index
 * signature, and a `$ref` may stand where an object is expected.
 */

/** A position in the source text, 1-based. */
export interface Position {
  line: number
  column: number
}

/** JSON Pointer (RFC 6901) → where the value starts in the source. */
export type PositionMap = Map<string, Position>

export interface Parsed<T = unknown> {
  value: T
  positions: PositionMap
}

export interface Reference {
  $ref: string
  summary?: string
  description?: string
}

export type MaybeRef<T> = T | Reference

/** A JSON Schema (2020-12 as in OpenAPI 3.1; 3.0 schemas are normalized to it). */
export interface Schema {
  $ref?: string
  type?: string | string[]
  format?: string
  title?: string
  description?: string
  default?: unknown
  const?: unknown
  enum?: unknown[]
  examples?: unknown[]
  /** OpenAPI 3.0 style, kept as a source of samples. */
  example?: unknown
  deprecated?: boolean
  readOnly?: boolean
  writeOnly?: boolean
  nullable?: boolean
  // numbers
  multipleOf?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  // strings
  minLength?: number
  maxLength?: number
  pattern?: string
  contentMediaType?: string
  contentEncoding?: string
  // arrays
  items?: Schema
  prefixItems?: Schema[]
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  contains?: Schema
  // objects
  properties?: Record<string, Schema>
  patternProperties?: Record<string, Schema>
  additionalProperties?: boolean | Schema
  required?: string[]
  minProperties?: number
  maxProperties?: number
  propertyNames?: Schema
  dependentRequired?: Record<string, string[]>
  // composition
  allOf?: Schema[]
  oneOf?: Schema[]
  anyOf?: Schema[]
  not?: Schema
  if?: Schema
  then?: Schema
  else?: Schema
  discriminator?: { propertyName: string; mapping?: Record<string, string> }
  xml?: Record<string, unknown>
  externalDocs?: ExternalDocs
  [extension: string]: unknown
}

export interface ExternalDocs {
  url: string
  description?: string
}

export interface Contact {
  name?: string
  url?: string
  email?: string
}

export interface Info {
  title: string
  version: string
  summary?: string
  description?: string
  termsOfService?: string
  contact?: Contact
  license?: { name: string; url?: string; identifier?: string }
  [extension: string]: unknown
}

export interface ServerVariable {
  default: string
  enum?: string[]
  description?: string
}

export interface Server {
  url: string
  description?: string
  variables?: Record<string, ServerVariable>
  [extension: string]: unknown
}

export type ParameterIn = 'path' | 'query' | 'header' | 'cookie'

export interface Example {
  summary?: string
  description?: string
  value?: unknown
  externalValue?: string
}

export interface Encoding {
  contentType?: string
  headers?: Record<string, MaybeRef<Header>>
  style?: string
  explode?: boolean
  allowReserved?: boolean
}

export interface MediaType {
  schema?: Schema
  example?: unknown
  examples?: Record<string, MaybeRef<Example>>
  encoding?: Record<string, Encoding>
  [extension: string]: unknown
}

export interface Parameter {
  name: string
  in: ParameterIn
  description?: string
  required?: boolean
  deprecated?: boolean
  allowEmptyValue?: boolean
  style?: string
  explode?: boolean
  allowReserved?: boolean
  schema?: Schema
  example?: unknown
  examples?: Record<string, MaybeRef<Example>>
  content?: Record<string, MediaType>
  [extension: string]: unknown
}

export type Header = Omit<Parameter, 'name' | 'in'>

export interface RequestBody {
  description?: string
  required?: boolean
  content: Record<string, MediaType>
  [extension: string]: unknown
}

export interface Link {
  operationRef?: string
  operationId?: string
  parameters?: Record<string, unknown>
  requestBody?: unknown
  description?: string
  server?: Server
}

export interface Response {
  description: string
  headers?: Record<string, MaybeRef<Header>>
  content?: Record<string, MediaType>
  links?: Record<string, MaybeRef<Link>>
  [extension: string]: unknown
}

export type SecurityRequirement = Record<string, string[]>

export interface Operation {
  tags?: string[]
  summary?: string
  description?: string
  externalDocs?: ExternalDocs
  operationId?: string
  parameters?: MaybeRef<Parameter>[]
  requestBody?: MaybeRef<RequestBody>
  responses?: Record<string, MaybeRef<Response>>
  callbacks?: Record<string, MaybeRef<Record<string, PathItem>>>
  deprecated?: boolean
  security?: SecurityRequirement[]
  servers?: Server[]
  [extension: string]: unknown
}

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface PathItem {
  $ref?: string
  summary?: string
  description?: string
  get?: Operation
  put?: Operation
  post?: Operation
  delete?: Operation
  options?: Operation
  head?: Operation
  patch?: Operation
  trace?: Operation
  servers?: Server[]
  parameters?: MaybeRef<Parameter>[]
  [extension: string]: unknown
}

export interface OAuthFlow {
  authorizationUrl?: string
  tokenUrl?: string
  refreshUrl?: string
  scopes: Record<string, string>
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'mutualTLS' | 'oauth2' | 'openIdConnect'
  description?: string
  name?: string
  in?: 'query' | 'header' | 'cookie'
  scheme?: string
  bearerFormat?: string
  flows?: {
    implicit?: OAuthFlow
    password?: OAuthFlow
    clientCredentials?: OAuthFlow
    authorizationCode?: OAuthFlow
  }
  openIdConnectUrl?: string
  [extension: string]: unknown
}

export interface Components {
  schemas?: Record<string, Schema>
  responses?: Record<string, MaybeRef<Response>>
  parameters?: Record<string, MaybeRef<Parameter>>
  examples?: Record<string, MaybeRef<Example>>
  requestBodies?: Record<string, MaybeRef<RequestBody>>
  headers?: Record<string, MaybeRef<Header>>
  securitySchemes?: Record<string, MaybeRef<SecurityScheme>>
  links?: Record<string, MaybeRef<Link>>
  callbacks?: Record<string, MaybeRef<Record<string, PathItem>>>
  pathItems?: Record<string, MaybeRef<PathItem>>
  [extension: string]: unknown
}

export interface Tag {
  name: string
  description?: string
  externalDocs?: ExternalDocs
  [extension: string]: unknown
}

/** The normalized document: always OpenAPI 3.1 in shape. */
export interface OpenApiDocument {
  openapi: string
  info: Info
  jsonSchemaDialect?: string
  servers?: Server[]
  paths?: Record<string, PathItem>
  webhooks?: Record<string, MaybeRef<PathItem>>
  components?: Components
  security?: SecurityRequirement[]
  tags?: Tag[]
  externalDocs?: ExternalDocs
  [extension: string]: unknown
}

/* ------------------------------ HTTP ------------------------------ */

export type FormValue = string | { filename: string; contentType?: string; data?: Blob | string }

export interface HttpRequestBody {
  mediaType: string
  /** JSON, XML, text: the serialized body. */
  text?: string
  /** x-www-form-urlencoded and multipart: the fields in order. */
  form?: [string, FormValue][]
}

/** The request the snippets print and try-it sends. */
export interface HttpRequest {
  method: string
  url: string
  headers: [string, string][]
  body?: HttpRequestBody
}

export interface HttpResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  /** Milliseconds from send to the last byte. */
  duration: number
  /** Set when the request failed before a response (network, CORS). */
  error?: string
}
