import { OpenApiError } from './errors'
import { isObject } from './util'

export type SpecFamily = 'swagger2' | 'openapi30' | 'openapi31'

export interface DetectedVersion {
  family: SpecFamily
  version: string
}

/**
 * Tells Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 apart. Versions above 3.1
 * (3.2) are read as 3.1, the closest shape we understand.
 */
export function detectVersion(raw: unknown): DetectedVersion {
  if (!isObject(raw)) throw new OpenApiError('The document is not an object')
  const swagger = raw.swagger
  if (swagger !== undefined) {
    const version = String(swagger)
    if (/^2(\.\d+)*$/.test(version)) return { family: 'swagger2', version }
    throw new OpenApiError(`Unsupported Swagger version "${version}"`)
  }
  const openapi = raw.openapi
  if (openapi !== undefined) {
    const version = String(openapi)
    if (/^3\.0(\.\d+)?(-.+)?$/.test(version)) return { family: 'openapi30', version }
    if (/^3\.[1-9]\d*(\.\d+)?(-.+)?$/.test(version)) return { family: 'openapi31', version }
    throw new OpenApiError(`Unsupported OpenAPI version "${version}"`)
  }
  throw new OpenApiError('Not an OpenAPI document: neither "openapi" nor "swagger" field found')
}
