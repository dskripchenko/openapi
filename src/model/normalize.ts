import type { OpenApiDocument } from '../core/types'
import { detectVersion } from './detect'
import { convertSwagger2 } from './swagger2'
import { upgradeDocument30 } from './upgrade30'
import { deepClone, isObject, type Obj } from './util'

export interface NormalizeResult {
  document: OpenApiDocument
  warnings: string[]
}

/**
 * Brings any supported document to the OpenAPI 3.1 shape. The input is never
 * mutated; the result shares nothing with it.
 */
export function normalize(raw: unknown): NormalizeResult {
  const { family } = detectVersion(raw)
  const warnings: string[] = []
  let doc = deepClone(raw) as Obj

  if (family === 'swagger2') {
    doc = convertSwagger2(doc, warnings)
    upgradeDocument30(doc)
    doc.openapi = '3.1.0'
  } else if (family === 'openapi30') {
    upgradeDocument30(doc)
    doc.openapi = '3.1.0'
  }

  if (!isObject(doc.info)) {
    warnings.push('#/info: missing, an empty one is used')
    doc.info = { title: '', version: '' }
  }
  return { document: doc as OpenApiDocument, warnings }
}
