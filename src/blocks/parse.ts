/**
 * Block text in, OpenAPI document out — and back to text.
 */
import type { OpenApiDocument, PositionMap } from '../core/types'
import { JsonError, detectFormat } from '../json'
import { parseSpec, stringifySpec } from '../load'
import { OpenApiError, normalize } from '../model'
import { YamlError } from '../yaml'
import { blockToDocument } from './document'
import { BlockError } from './errors'
import type { BlockErrorInfo, BlockFormat, ParseBlockResult } from './types'

/** True when the data is a whole OpenAPI or Swagger document rather than compact requests. */
export function isOpenApiDocument(data: unknown): boolean {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && ('openapi' in data || 'swagger' in data)
}

/**
 * Reads a block: YAML or JSON (by its first character), compact requests or a
 * whole OpenAPI / Swagger document. Never throws; a block that does not read
 * comes back with the message and, when known, the line and column.
 */
export function parseBlock(text: string): ParseBlockResult {
  const format: BlockFormat = detectFormat(text)
  if (!text.trim()) return { ok: false, format, error: { message: 'The block is empty: write a request with `url`' } }
  let value: unknown
  let positions: PositionMap
  try {
    ;({ value, positions } = parseSpec(text, format))
  } catch (error) {
    if (error instanceof YamlError || error instanceof JsonError) {
      return { ok: false, format, error: { message: error.reason, line: error.line, column: error.column } }
    }
    return { ok: false, format, error: { message: error instanceof Error ? error.message : String(error) } }
  }
  try {
    if (isOpenApiDocument(value)) {
      const { document } = normalize(value)
      return { ok: true, document, format, kind: 'document', data: value }
    }
    const document: OpenApiDocument = blockToDocument(value)
    return { ok: true, document, format, kind: 'requests', data: value }
  } catch (error) {
    if (error instanceof BlockError) return { ok: false, format, error: located(error.message, error.pointer, positions) }
    if (error instanceof OpenApiError) return { ok: false, format, error: { message: error.message, line: 1, column: 1 } }
    throw error
  }
}

/** Block data as text: YAML with 2-space indents, or pretty-printed JSON. */
export function stringifyBlock(data: unknown, format: BlockFormat): string {
  return stringifySpec(data, format)
}

/** The place of the value at `pointer`, or of the nearest parent the parser recorded. */
function located(message: string, pointer: string, positions: PositionMap): BlockErrorInfo {
  for (let p = pointer; ; p = p.slice(0, p.lastIndexOf('/'))) {
    const at = positions.get(p)
    if (at) return { message, line: at.line, column: at.column, pointer }
    if (!p) return { message, pointer }
  }
}
