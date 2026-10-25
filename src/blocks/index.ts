/**
 * API blocks: a fenced ```openapi code block in rich content — compact
 * requests or a whole OpenAPI document, in YAML or JSON — read into an
 * OpenAPI 3.1 document, written back, and edited through a form model.
 */
export { parseBlock, stringifyBlock, isOpenApiDocument } from './parse'
export {
  blockToDocument,
  blockParameter,
  operationIdFor,
  pathParamNames,
  splitUrl,
  statusReason,
  mediaType as blockMediaType,
  BLOCK_METHODS,
  PARAM_LOCATIONS,
  MEDIA_ALIASES,
  AUTH_TYPES,
  OAUTH_FLOWS,
  type ParamLocation,
} from './document'
export { inferSchema } from './infer'
export { parseShorthand, formatShorthand, expandSchema, isShorthand, type Shorthand } from './shorthand'
export { BlockError } from './errors'
export {
  blockToModel,
  modelToBlock,
  syncOrigins,
  syncPathParams,
  authModel,
  emptyAuth,
  emptyBody,
  emptyParam,
  emptyRequest,
  isStructuredMedia,
  BODY_TYPES,
  type AuthKind,
  type AuthModel,
  type BlockMethod,
  type BlockModel,
  type BlockModelError,
  type BodyModel,
  type OAuthFlowName,
  type ParamModel,
  type RequestModel,
  type ResponseModel,
} from './model'
export type * from './types'
