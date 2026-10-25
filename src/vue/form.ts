/**
 * Form bodies and files in try-it: which media types are edited as a form
 * (one field per property), which properties take files, and which bodies
 * are a single file.
 */
import type { MediaType, Schema } from '../core/types'
import { baseMediaType, isFormUrlEncoded, isMultipart } from '../request'
import { effective, type Resolver } from '../schema/util'

export interface FormField {
  name: string
  schema: Schema
  required: boolean
  /** The property takes a file (`format: binary` or `contentMediaType`). */
  file: boolean
  /** An array of files: the input takes several. */
  multiple: boolean
  /** The file types to offer, from the encoding or the schema. */
  accept?: string
}

/** The key of a binary body's file in `draft.files`. */
export const BODY_FILE = '$body'

/** A string schema that stands for bytes. */
export function isFileSchema(schema: Schema | undefined, resolve?: Resolver): boolean {
  if (!schema) return false
  const s = effective(schema, resolve)
  return s.format === 'binary' || (s.contentMediaType !== undefined && s.contentEncoding !== 'base64')
}

/**
 * The fields of a form body: multipart or urlencoded with an object schema
 * (through `$ref` and `allOf`). Undefined when the body is not such a form;
 * urlencoded bodies never take files.
 */
export function formFields(mediaType: string, media: MediaType | undefined, resolve?: Resolver): FormField[] | undefined {
  const multipart = isMultipart(mediaType)
  if (!media?.schema || (!multipart && !isFormUrlEncoded(mediaType))) return undefined
  const schema = effective(media.schema, resolve)
  const properties = schema.properties
  if (!properties || !Object.keys(properties).length) return undefined
  const required = new Set(schema.required ?? [])
  return Object.entries(properties)
    .filter(([, p]) => effective(p, resolve).readOnly !== true)
    .map(([name, p]) => {
      const prop = effective(p, resolve)
      const items = prop.items ? effective(prop.items, resolve) : undefined
      const multiple = multipart && isFileSchema(items, resolve)
      const file = multipart && (multiple || isFileSchema(prop, resolve))
      const field: FormField = { name, schema: prop, required: required.has(name), file, multiple }
      const accept = media.encoding?.[name]?.contentType ?? (multiple ? items?.contentMediaType : prop.contentMediaType)
      if (file && accept && !/^application\/octet-stream$/i.test(accept)) field.accept = accept
      return field
    })
}

/**
 * True when the body is a file as a whole: octet streams, images, audio,
 * video, PDF; a `format: binary` string schema; or no schema on a type that
 * is not text, JSON, XML or a form.
 */
export function isBinaryBody(mediaType: string, media: MediaType | undefined, resolve?: Resolver): boolean {
  const base = baseMediaType(mediaType)
  if (!base || isMultipart(base) || isFormUrlEncoded(base)) return false
  if (/^(application\/(octet-stream|pdf|zip)|(image|audio|video)\/)/.test(base)) return true
  if (media?.schema) return isFileSchema(media.schema, resolve)
  return !/^text\/|json|xml|yaml|javascript/.test(base)
}

/** A name for a file not chosen yet, so the samples have one to print: `file.png`. */
export function placeholderName(name: string, contentType?: string): string {
  const subtype = /^[\w.+-]+\/([\w.+-]+)/.exec(contentType?.split(',')[0]?.trim() ?? '')?.[1]
  const ext = subtype && subtype !== '*' && subtype !== 'octet-stream' ? '.' + subtype.replace(/^.*\+/, '').replace(/^jpeg$/, 'jpg') : ''
  return (name === BODY_FILE ? 'file' : name) + ext
}

/** A field's value as the form shows it: strings as they are, the rest as JSON. */
export function fieldText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Human-readable size: `512 B`, `1.4 KB`, `3.2 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
