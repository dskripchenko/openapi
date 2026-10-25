<script setup lang="ts">
/**
 * One schema as a tree: each property shows its name, type, flags,
 * constraints and description, and opens into its own properties. `allOf`
 * is shown merged; `oneOf`/`anyOf` switch between their branches. A `$ref`
 * seen higher up the same branch is shown by name and not opened again.
 */
import { computed, ref } from 'vue'
import { UidMarkdown } from '@dskripchenko/ui'
import type { Schema } from '../core/types'
import { describe } from '../schema'
import { useReference } from './context'

defineOptions({ name: 'OaSchema' })

const props = withDefaults(
  defineProps<{
    schema: Schema
    name?: string
    required?: boolean
    depth?: number
    /** The $refs already open on this branch. */
    seen?: string[]
    mode?: 'request' | 'response'
  }>(),
  { name: undefined, required: false, depth: 0, seen: () => [], mode: 'response' },
)

const ctx = useReference()
const labels = ctx.labels
const resolveRef = (r: string): Schema | undefined => ctx.spec.value.resolver.get(r) as Schema | undefined

const refName = computed(() => props.schema.$ref?.split('/').pop())
const circular = computed(() => !!props.schema.$ref && props.seen.includes(props.schema.$ref))

/** The schema with its $ref followed and its allOf merged. */
const resolved = computed<Schema>(() => {
  let s: Schema = props.schema
  const visited = new Set<string>()
  while (s.$ref && !visited.has(s.$ref)) {
    visited.add(s.$ref)
    const target = resolveRef(s.$ref)
    if (!target) break
    const { $ref: _, ...siblings } = s
    s = { ...target, ...siblings }
  }
  if (s.allOf?.length) {
    const merged: Schema = { ...s, allOf: undefined, properties: { ...(s.properties ?? {}) }, required: [...(s.required ?? [])] }
    for (const part of s.allOf) {
      const p = part.$ref ? (resolveRef(part.$ref) ?? part) : part
      Object.assign(merged.properties!, p.properties ?? {})
      merged.required!.push(...(p.required ?? []))
      for (const key of ['type', 'description', 'title'] as const) if (merged[key] === undefined && p[key] !== undefined) (merged as Record<string, unknown>)[key] = p[key]
    }
    if (!Object.keys(merged.properties!).length) delete merged.properties
    s = merged
  }
  return s
})

const branchSeen = computed(() => (props.schema.$ref ? [...props.seen, props.schema.$ref] : props.seen))
const typeLabel = computed(() => describe(props.schema, { resolve: resolveRef }))

/** The object whose properties open under this row: the schema or its array items. */
const container = computed<Schema | undefined>(() => {
  const s = resolved.value
  if (s.properties || s.additionalProperties && typeof s.additionalProperties === 'object') return s
  const items = s.items
  if (items) {
    const it = items.$ref ? (resolveRef(items.$ref) ?? items) : items
    if (it.properties || it.allOf || it.oneOf || it.anyOf) return items
  }
  return undefined
})

const variants = computed(() => resolved.value.oneOf ?? resolved.value.anyOf)
const variantKind = computed(() => (resolved.value.oneOf ? 'oneOf' : 'anyOf'))
const variant = ref(0)
const variantLabel = (s: Schema, i: number): string => s.title ?? s.$ref?.split('/').pop() ?? describe(s, { resolve: resolveRef }) ?? `#${i + 1}`

const properties = computed(() => {
  const s = resolved.value
  const visible = Object.entries(s.properties ?? {}).filter(([, p]) => {
    const target = p.$ref ? (resolveRef(p.$ref) ?? p) : p
    return props.mode === 'request' ? !target.readOnly : !target.writeOnly
  })
  return visible.map(([name, schema]) => ({ name, schema, required: s.required?.includes(name) ?? false }))
})

const open = ref(props.depth < 1)
const hasChildren = computed(() => !circular.value && (properties.value.length > 0 || !!container.value || !!variants.value))

const constraints = computed(() => {
  const s = resolved.value
  const out: string[] = []
  const add = (label: string, v: unknown): void => {
    if (v !== undefined) out.push(`${label} ${typeof v === 'string' ? v : JSON.stringify(v)}`)
  }
  add('≥', s.minimum)
  add('>', s.exclusiveMinimum)
  add('≤', s.maximum)
  add('<', s.exclusiveMaximum)
  add('multiple of', s.multipleOf)
  add('min length', s.minLength)
  add('max length', s.maxLength)
  add('min items', s.minItems)
  add('max items', s.maxItems)
  if (s.uniqueItems) out.push('unique')
  add('pattern', s.pattern)
  return out
})

const flags = computed(() => {
  const s = resolved.value
  return {
    readOnly: !!s.readOnly,
    writeOnly: !!s.writeOnly,
    deprecated: !!s.deprecated,
  }
})
</script>

<template>
  <div class="oa-schema" :class="{ 'oa-schema--root': depth === 0 && !name }">
    <div v-if="name !== undefined" class="oa-schema__row">
      <button
        v-if="hasChildren"
        type="button"
        class="oa-schema__toggle"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="oa-schema__chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
      </button>
      <span v-else class="oa-schema__toggle-space" />
      <code class="oa-schema__name">{{ name }}</code>
      <span class="oa-schema__type">{{ typeLabel }}</span>
      <span v-if="required" class="oa-schema__flag oa-schema__flag--required">{{ labels.required }}</span>
      <span v-if="flags.readOnly" class="oa-schema__flag">read-only</span>
      <span v-if="flags.writeOnly" class="oa-schema__flag">write-only</span>
      <span v-if="flags.deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
      <span v-if="circular" class="oa-schema__flag">↺ {{ refName }}</span>
    </div>
    <div v-if="name !== undefined" class="oa-schema__meta">
      <UidMarkdown v-if="resolved.description" class="oa-md oa-md--small" :source="resolved.description" />
      <div v-if="constraints.length" class="oa-schema__constraints">
        <span v-for="c in constraints" :key="c">{{ c }}</span>
      </div>
      <div v-if="resolved.enum" class="oa-schema__enum">
        <span class="oa-schema__label">{{ labels.enum }}:</span>
        <code v-for="(e, i) in resolved.enum" :key="i">{{ JSON.stringify(e) }}</code>
      </div>
      <div v-if="resolved.default !== undefined" class="oa-schema__enum">
        <span class="oa-schema__label">{{ labels.default }}:</span>
        <code>{{ JSON.stringify(resolved.default) }}</code>
      </div>
    </div>

    <div v-if="(open || name === undefined) && hasChildren" class="oa-schema__children" :class="{ 'oa-schema__children--nested': name !== undefined }">
      <div v-if="variants" class="oa-schema__variants">
        <span class="oa-schema__label">{{ variantKind }}</span>
        <button
          v-for="(v, i) in variants"
          :key="i"
          type="button"
          class="oa-schema__variant"
          :class="{ 'is-active': variant === i }"
          @click="variant = i"
        >
          {{ variantLabel(v, i) }}
        </button>
      </div>
      <OaSchema
        v-if="variants && variants[variant]"
        :schema="variants[variant]!"
        :depth="depth + 1"
        :seen="branchSeen"
        :mode="mode"
      />
      <OaSchema
        v-for="p in properties"
        :key="p.name"
        :schema="p.schema"
        :name="p.name"
        :required="p.required"
        :depth="depth + 1"
        :seen="branchSeen"
        :mode="mode"
      />
      <OaSchema
        v-if="!properties.length && container && container !== resolved"
        :schema="container"
        :depth="depth + 1"
        :seen="branchSeen"
        :mode="mode"
      />
      <OaSchema
        v-if="resolved.additionalProperties && typeof resolved.additionalProperties === 'object'"
        :schema="resolved.additionalProperties"
        name="[key: string]"
        :depth="depth + 1"
        :seen="branchSeen"
        :mode="mode"
      />
    </div>
    <div v-else-if="name === undefined && !hasChildren" class="oa-schema__scalar">
      <span class="oa-schema__type">{{ typeLabel }}</span>
      <UidMarkdown v-if="resolved.description" class="oa-md oa-md--small" :source="resolved.description" />
    </div>
  </div>
</template>
