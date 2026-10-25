/**
 * @dskripchenko/openapi — the framework-free core.
 *
 * Read a Swagger 2.0 / OpenAPI 3.0 / 3.1 spec from YAML or JSON, normalize it
 * to 3.1, validate it, sample and validate its schemas, build requests and
 * print them as code. The Vue components live in `@dskripchenko/openapi/vue`.
 */
export type * from './core/types'
export { HTTP_METHODS } from './core/types'

export { loadSpec, parseSpec, stringifySpec, type ParsedSpec, type SpecFormat } from './load'

export { YamlError, parseYaml, stringifyYaml, type StringifyYamlOptions } from './yaml'
export { JsonError, parseJson, stringifyJson, detectFormat } from './json'

export {
  OpenApiError,
  detectVersion,
  normalize,
  upgradeSchema30,
  createResolver,
  listOperations,
  groupByTag,
  loadDocument,
  DEFAULT_TAG,
  type DetectedVersion,
  type SpecFamily,
  type NormalizeResult,
  type Resolver,
  type ResolverOptions,
  type LoadedSpec,
  type LoadOptions,
  type OperationEntry,
  type OperationGroup,
  type TagGroupSet,
  type GroupedOperations,
} from './model'

export {
  validateDocument,
  type DocumentIssue,
  type ValidateOptions as DocumentValidateOptions,
} from './validate'

export {
  sample as sampleSchema,
  sampleXml,
  validate as validateValue,
  describe as describeSchema,
  FORMAT_SAMPLES,
  type SampleOptions,
  type ValidationIssue,
  type ValidateOptions as ValueValidateOptions,
  type DescribeOptions,
  type Resolver as SchemaResolver,
  type Mode as SchemaMode,
} from './schema'

export * from './request'
export { SNIPPET_TARGETS, generateSnippet, type SnippetTarget, type SnippetTargetInfo } from './snippets'
export {
  scalarSlug,
  scalarDocumentSlug,
  splitLink,
  pickSpec,
  resolveSection,
  encodePrefill,
  decodePrefill,
  prefillHash,
  PREFILL_VERSION,
  type LinkSpec,
  type PrefillData,
  type PrefillValues,
} from './links'
export {
  schemaToTs,
  createTsContext,
  declareType,
  operationTypes,
  documentTypes,
  typeName as tsTypeName,
  STATUS_TYPE_NAMES,
  statusTypeName,
  type TsContext,
  type OperationTypes,
  type OperationTypeNames,
  type OperationTypesOptions,
} from './typescript'
export * from './blocks'
