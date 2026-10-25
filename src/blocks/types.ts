/**
 * The compact block format: one or more HTTP requests written by hand in a
 * fenced ```openapi block, and what parsing it gives back.
 */
import type { OpenApiDocument } from '../core/types'

export type BlockFormat = 'yaml' | 'json'

/** What a block holds: compact requests, or a whole OpenAPI / Swagger document. */
export type BlockKind = 'requests' | 'document'

/** Where a block went wrong; the place is 1-based, when known. */
export interface BlockErrorInfo {
  message: string
  line?: number
  column?: number
  /** The JSON Pointer of the value at fault in the parsed data. */
  pointer?: string
}

export type ParseBlockResult =
  | {
      ok: true
      /** The block as an OpenAPI 3.1 document. */
      document: OpenApiDocument
      format: BlockFormat
      kind: BlockKind
      /** The parsed text as written: the compact shape, or the document before normalization. */
      data: unknown
    }
  | { ok: false; error: BlockErrorInfo; format: BlockFormat }

/** `bearer`, `basic`, `apiKey`, `oauth2`, `none` or an object with `type`. */
export type BlockAuth = string | ({ type: string } & Record<string, unknown>)

/** A parameter: a shorthand string (`integer!`, `string(email) Contact`) or a schema-ish object. */
export type BlockParam = string | Record<string, unknown>

export interface BlockBody {
  /** A media type or an alias: json (default), form, multipart, text, xml, binary. */
  type?: string
  example?: unknown
  schema?: unknown
  description?: string
  /** True by default. */
  required?: boolean
}

export interface BlockResponse {
  description?: string
  /** A media type or an alias, as in the body; json by default. */
  type?: string
  example?: unknown
  schema?: unknown
  headers?: Record<string, BlockParam>
}

/** One request of a block. */
export interface BlockRequest {
  /** GET by default. */
  method?: string
  /** Absolute (`https://host/v1/users/{id}`) or a path (`/users/{id}`); `{x}` are path parameters. */
  url: string
  summary?: string
  description?: string
  operationId?: string
  tags?: string | string[]
  deprecated?: boolean
  auth?: BlockAuth
  params?: Partial<Record<'path' | 'query' | 'header' | 'cookie', Record<string, BlockParam>>>
  body?: BlockBody
  /** Status → a description, or an object. */
  responses?: Record<string, string | BlockResponse | null>
  [extension: `x-${string}`]: unknown
}

/** Several requests sharing a title, a base URL and an auth scheme. */
export interface BlockRequests {
  title?: string
  description?: string
  version?: string
  /** Paths of the requests resolve against it; it becomes the document's server. */
  baseUrl?: string
  servers?: (string | { url: string; description?: string })[]
  /** The default for every request; a request's own `auth` wins. */
  auth?: BlockAuth
  requests: BlockRequest[]
  [extension: `x-${string}`]: unknown
}
