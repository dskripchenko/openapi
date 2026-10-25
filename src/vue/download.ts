import { stringifySpec, type SpecFormat } from '../load'
import type { LoadedSpec } from '../model'
import { documentTypes } from '../typescript'

const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}.]+/gu, '-').replace(/^-+|-+$/g, '')

/** `{title}-{version}` of the document, or `openapi`. */
function baseName(spec: LoadedSpec): string {
  const info = spec.document.info
  return [slug(info.title ?? ''), slug(String(info.version ?? ''))].filter(Boolean).join('-') || 'openapi'
}

/** Hands the text to the browser as a file download. */
function save(text: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Saves the source document as given (not the normalized 3.1 copy) as `{title}-{version}.yaml|json`. */
export function downloadSpec(spec: LoadedSpec, format: SpecFormat): void {
  const text = stringifySpec(spec.source.raw, format)
  save(text, format === 'json' ? 'application/json' : 'application/yaml', `${baseName(spec)}.${format === 'json' ? 'json' : 'yaml'}`)
}

/** Saves the TypeScript types of the whole document as `{title}-{version}.d.ts`. */
export function downloadTypes(spec: LoadedSpec): void {
  save(documentTypes(spec), 'application/typescript', `${baseName(spec)}.d.ts`)
}
