/**
 * XML samples: the JSON sample serialized under the schema's `xml` keywords
 * (`name`, `attribute`, `wrapped`, `namespace`, `prefix`).
 */
import type { Schema } from '../core/types'
import { type SampleOptions, rootName, sample } from './sample'
import { type Resolver, deref, effective, isPlainObject, refName } from './util'

interface XmlMeta {
  name?: string
  attribute?: boolean
  wrapped?: boolean
  namespace?: string
  prefix?: string
}

function meta(schema: Schema): XmlMeta {
  const x = isPlainObject(schema.xml) ? schema.xml : {}
  return {
    name: typeof x.name === 'string' && x.name ? x.name : undefined,
    attribute: x.attribute === true,
    wrapped: x.wrapped === true,
    namespace: typeof x.namespace === 'string' && x.namespace ? x.namespace : undefined,
    prefix: typeof x.prefix === 'string' && x.prefix ? x.prefix : undefined,
  }
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function qualified(name: string, m: XmlMeta): string {
  return m.prefix ? `${m.prefix}:${name}` : name
}

function nsAttr(m: XmlMeta): string {
  if (!m.namespace) return ''
  return m.prefix ? ` xmlns:${m.prefix}="${escapeAttr(m.namespace)}"` : ` xmlns="${escapeAttr(m.namespace)}"`
}

class Writer {
  readonly lines: string[] = []
  constructor(private readonly resolve?: Resolver) {}

  /** Writes one element for `value`; arrays expand per `wrapped`. */
  element(name: string, value: unknown, schema: Schema, indent: string, forceWrap = false): void {
    const s = effective(schema, this.resolve)
    const m = meta(s)
    const elName = qualified(m.name ?? name, m)

    if (Array.isArray(value)) {
      const items = isPlainObject(s.items) ? s.items : {}
      const itemMeta = meta(effective(items, this.resolve))
      const itemName = itemMeta.name ?? m.name ?? name
      if (m.wrapped || forceWrap) {
        if (!value.length) {
          this.lines.push(`${indent}<${elName}${nsAttr(m)}/>`)
          return
        }
        this.lines.push(`${indent}<${elName}${nsAttr(m)}>`)
        for (const item of value) this.element(itemName, item, items, indent + '  ')
        this.lines.push(`${indent}</${elName}>`)
      } else {
        for (const item of value) this.element(itemName, item, items, indent)
      }
      return
    }

    if (isPlainObject(value)) {
      const props = s.properties ?? {}
      const extra = isPlainObject(s.additionalProperties) ? (s.additionalProperties as Schema) : {}
      let attrs = nsAttr(m)
      const children: [string, unknown, Schema][] = []
      for (const [key, child] of Object.entries(value)) {
        const ps = props[key] ?? extra
        const pm = meta(deref(ps, this.resolve))
        if (pm.attribute && (child === null || typeof child !== 'object')) {
          attrs += ` ${qualified(pm.name ?? key, pm)}="${escapeAttr(scalar(child))}"`
        } else {
          children.push([key, child, ps])
        }
      }
      if (!children.length) {
        this.lines.push(`${indent}<${elName}${attrs}/>`)
        return
      }
      this.lines.push(`${indent}<${elName}${attrs}>`)
      for (const [key, child, ps] of children) this.element(key, child, ps, indent + '  ')
      this.lines.push(`${indent}</${elName}>`)
      return
    }

    if (value === null || value === undefined) {
      this.lines.push(`${indent}<${elName}${nsAttr(m)}/>`)
      return
    }
    this.lines.push(`${indent}<${elName}${nsAttr(m)}>${escapeText(scalar(value))}</${elName}>`)
  }
}

/** An XML document sampling the schema; a root array is always wrapped. */
export function sampleXml(schema: Schema, opts: SampleOptions = {}): string {
  const value = sample(schema, opts)
  const eff = effective(schema, opts.resolve)
  let name = rootName(eff)
  if (name === 'root' && typeof schema.$ref === 'string') name = refName(schema.$ref)
  const writer = new Writer(opts.resolve)
  writer.element(name, value, schema, '', true)
  return ['<?xml version="1.0" encoding="UTF-8"?>', ...writer.lines].join('\n')
}
