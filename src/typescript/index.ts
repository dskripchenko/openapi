/**
 * OpenAPI → TypeScript: a schema as a type expression, an operation's
 * parameters, bodies and responses as named declarations, the whole document
 * as one module.
 */
export { typeName } from './names'
export { createTsContext, declareType, schemaToTs, type TsContext } from './schema'
export {
  documentTypes,
  operationTypes,
  type OperationTypeNames,
  type OperationTypes,
  type OperationTypesOptions,
} from './operation'
export { STATUS_TYPE_NAMES, statusTypeName } from './status'
