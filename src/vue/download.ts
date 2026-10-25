import { stringifySpec, type SpecFormat } from '../load'
import type { LoadedSpec } from '../model'

const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}.]+/gu, '-').replace(/^-+|-+$/g, '')

/** Saves the source document as given (not the normalized 3.1 copy) as `{title}-{version}.yaml|json`. */
export function downloadSpec(spec: LoadedSpec, format: SpecFormat): void {
  const info = spec.document.info
  const text = stringifySpec(spec.source.raw, format)
  const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'application/yaml' })
  const name = [slug(info.title ?? ''), slug(String(info.version ?? ''))].filter(Boolean).join('-') || 'openapi'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.${format === 'json' ? 'json' : 'yaml'}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
