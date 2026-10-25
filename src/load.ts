/**
 * Text in, model out: the one call most hosts need.
 *
 * `loadSpec` takes the spec as YAML or JSON text (or an already parsed
 * object), keeps the source positions for error lines, and returns the
 * normalized model with its resolver and operation index.
 */
import type { Parsed } from './core/types'
import { detectFormat, parseJson, stringifyJson } from './json'
import { loadDocument, type LoadedSpec, type LoadOptions } from './model'
import { parseYaml, stringifyYaml } from './yaml'

export type SpecFormat = 'json' | 'yaml'

export interface ParsedSpec extends Parsed {
  format: SpecFormat
}

/** Parses YAML or JSON text, detecting which by its first character. */
export function parseSpec(text: string, format: SpecFormat = detectFormat(text)): ParsedSpec {
  const parsed = format === 'json' ? parseJson(text) : parseYaml(text)
  return { ...parsed, format }
}

/** Writes a spec back in the given format: YAML with 2-space indents, JSON pretty-printed. */
export function stringifySpec(value: unknown, format: SpecFormat): string {
  return format === 'json' ? stringifyJson(value, 2) : stringifyYaml(value)
}

/**
 * Loads a spec from YAML/JSON text or a parsed object. Throws YamlError /
 * JsonError for unreadable text and OpenApiError for a document that is not
 * a Swagger 2.0 / OpenAPI 3.x spec.
 */
export function loadSpec(input: string | object, opts: Omit<LoadOptions, 'positions' | 'format'> = {}): LoadedSpec {
  if (typeof input !== 'string') return loadDocument(input, opts)
  const { value, positions, format } = parseSpec(input)
  return loadDocument(value, { ...opts, positions, format })
}
