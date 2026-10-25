<script setup lang="ts">
/**
 * A JSON value edited as a form, generated from its schema (recursive).
 * Scalars get the same fields as parameters; objects are indented groups
 * that fold; arrays add and remove items of any kind; maps
 * (`additionalProperties`) are name/value rows; `oneOf`/`anyOf` offer a
 * variant select; a nullable value has a "null" toggle. Read-only
 * properties are left out. Every edit emits a new value (undefined drops it).
 */
import { computed, ref } from 'vue'
import { UidButton, UidInput, UidSelect } from '@dskripchenko/ui'
import type { Schema } from '../core/types'
import { describe as describeSchema } from '../schema'
import { effective, inferType, isPlainObject } from '../schema/util'
import { useReference } from './context'
import { parseValue } from './draft'
import { isNullable, plainText, valueText } from './fields'
import OaField from './OaField.vue'
import {
  formNode,
  formProperties,
  freeKey,
  initialValue,
  itemSchema,
  mapValueSchema,
  matchVariant,
  renameKey,
  withKey,
  type FormNode,
} from './schemaForm'

const props = withDefaults(
  defineProps<{
    schema: Schema
    modelValue: unknown
    /** The property name; none for the root, array items and map values. */
    name?: string
    /** Shown where there is no name: `#2` for an array item. */
    label?: string
    required?: boolean
    /** The body itself: always present, no frame. */
    root?: boolean
    /** A scalar without its name line: array items, map values. */
    bare?: boolean
    /** Offer a remove button that emits `remove` (array items, map entries). */
    removable?: boolean
    depth?: number
  }>(),
  { name: undefined, label: undefined, required: false, root: false, bare: false, removable: false, depth: 0 },
)
const emit = defineEmits<{ 'update:modelValue': [value: unknown]; remove: [] }>()
const ctx = useReference()
const labels = ctx.labels
const resolve = (r: string) => ctx.spec.value.resolver.get(r) as never

const node = computed(() => formNode(props.schema, resolve))
/** The variant the user picked; without a discriminator the value alone may not tell. */
const chosen = ref<number | null>(null)
const variantIndex = computed(() => {
  if (!node.value.variants) return -1
  const matched = matchVariant(props.modelValue, node.value, resolve)
  if (node.value.discriminator && matched >= 0) return matched
  return chosen.value ?? (matched >= 0 ? matched : 0)
})
const current = computed<FormNode>(() =>
  node.value.variants ? formNode(node.value.variants[variantIndex.value]!.schema, resolve) : node.value,
)
const s = computed(() => current.value.schema)
const kind = computed(() => current.value.kind)
const isLeaf = computed(() => kind.value === 'scalar' || (kind.value === 'any' && !current.value.variants))
const variantOptions = computed(() => node.value.variants?.map((v, i) => ({ value: i, label: v.label })) ?? [])

const nullable = computed(() => isNullable(effective(props.schema, resolve)) || isNullable(s.value))
const isNull = computed(() => props.modelValue === null)
const present = computed(() => props.root || props.modelValue !== undefined)
const title = computed(() => props.name ?? props.label ?? '')
const hint = computed(() => plainText(s.value.description ?? node.value.schema.description))
const typeText = computed(() => describeSchema(props.schema, { resolve }))
const deprecated = computed(() => s.value.deprecated === true)
const open = ref(props.depth < 3)

/** A value for something new: the sample a request would get; '' when the schema says nothing. */
function fresh(schema: Schema): unknown {
  const n = formNode(schema, resolve)
  if (n.kind === 'any' && !n.variants) return ''
  return initialValue(schema, resolve)
}

const set = (value: unknown) => emit('update:modelValue', value)

function setLeaf(text: string): void {
  const type = inferType(s.value, resolve)
  if (text === '') {
    // A required string may be empty; items and map values keep their slot.
    if ((props.required || props.bare) && (type === 'string' || type === undefined)) return set('')
    return set(props.bare ? null : undefined)
  }
  if (kind.value === 'any') {
    try {
      return set(JSON.parse(text))
    } catch {
      return set(text)
    }
  }
  set(parseValue(text, type))
}

function chooseVariant(value: unknown): void {
  const index = Number(value)
  const variant = node.value.variants?.[index]
  if (!variant || index === variantIndex.value) return
  chosen.value = index
  set(fresh(variant.schema))
}

function toggleNull(): void {
  set(isNull.value ? fresh(s.value) : null)
}

/* --------------------------- objects and maps --------------------------- */

const object = computed<Record<string, unknown>>(() => (isPlainObject(props.modelValue) ? props.modelValue : {}))
const properties = computed(() => (kind.value === 'object' ? formProperties(s.value, resolve) : []))
const valueSchema = computed(() => mapValueSchema(s.value))
const valueIsLeaf = computed(() => {
  const k = formNode(valueSchema.value, resolve).kind
  return k === 'scalar' || k === 'any'
})
const entries = computed(() => Object.entries(object.value))
const addEntry = () => set(withKey(object.value, freeKey(object.value), fresh(valueSchema.value)))

/* --------------------------------- arrays ------------------------------- */

const list = computed<unknown[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const items = computed(() => itemSchema(s.value))
const itemIsLeaf = computed(() => {
  const k = formNode(items.value, resolve).kind
  return k === 'scalar' || k === 'any'
})
const count = computed(() => labels.value.itemCount.replace('{n}', String(list.value.length)))
const addItem = () => set([...list.value, fresh(items.value)])
const setItem = (index: number, value: unknown) => set(list.value.map((x, i) => (i === index ? value : x)))
const removeItem = (index: number) => set(list.value.filter((_, i) => i !== index))

/** Actions in the name line: variant, null, add/remove. */
const hasActions = computed(
  () => variantOptions.value.length > 1 || nullable.value || props.removable || (!props.root && !props.required),
)
function remove(): void {
  if (props.removable) emit('remove')
  else set(undefined)
}
</script>

<template>
  <!-- A scalar (or a value of no known type): one field. -->
  <div v-if="isLeaf && !isNull" class="oa-sf oa-sf--leaf" :class="{ 'oa-sf--bare': bare }" :data-path="name">
    <OaField
      :name="title"
      :schema="s"
      :required="required"
      :bare="bare"
      :model-value="valueText(modelValue)"
      @update:model-value="setLeaf"
    >
      <template v-if="!bare && (variantOptions.length > 1 || nullable || removable)" #actions>
        <UidSelect
          v-if="variantOptions.length > 1"
          class="oa-sf__variant"
          size="sm"
          :options="variantOptions"
          :model-value="variantIndex"
          :aria-label="labels.variant"
          @update:model-value="chooseVariant"
        />
        <button v-if="nullable" type="button" class="oa-chip oa-sf__null" :aria-pressed="false" @click="toggleNull">{{ labels.nullValue }}</button>
        <button v-if="removable" type="button" class="oa-icon-button" :title="labels.remove" :aria-label="labels.remove" @click="emit('remove')">×</button>
      </template>
      <template v-if="bare && removable" #after>
        <button type="button" class="oa-icon-button" :title="labels.remove" :aria-label="labels.remove" @click="emit('remove')">×</button>
      </template>
    </OaField>
  </div>

  <!-- An object, a map, an array — or a null value: a group with a name line. -->
  <div
    v-else
    class="oa-sf oa-sf--group"
    :class="{ 'oa-sf--root': root, 'is-absent': !present, 'is-null': isNull }"
    role="group"
    :aria-label="title || undefined"
    :data-path="name"
  >
    <div v-if="!root || variantOptions.length > 1" class="oa-sf__head">
      <button
        v-if="!root && present && !isNull && !isLeaf"
        type="button"
        class="oa-sf__toggle"
        :aria-expanded="open"
        :aria-label="title"
        @click="open = !open"
      >
        <span class="oa-schema__chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
      </button>
      <span v-if="title" class="oa-field__name">{{ title }}</span>
      <span v-else-if="root" class="oa-sf__variant-label">{{ labels.variant }}</span>
      <span v-if="required" class="oa-field__required" :title="labels.required">*</span>
      <span v-if="!root" class="oa-field__type">{{ typeText }}</span>
      <span v-if="kind === 'array' && present && !isNull" class="oa-field__type">· {{ count }}</span>
      <span v-if="deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
      <span v-if="hasActions" class="oa-field__actions">
        <UidSelect
          v-if="variantOptions.length > 1"
          class="oa-sf__variant"
          size="sm"
          :options="variantOptions"
          :model-value="variantIndex"
          :aria-label="labels.variant"
          @update:model-value="chooseVariant"
        />
        <button
          v-if="nullable"
          type="button"
          class="oa-chip oa-sf__null"
          :class="{ 'is-active': isNull }"
          :aria-pressed="isNull"
          @click="toggleNull"
        >{{ labels.nullValue }}</button>
        <button v-if="!present" type="button" class="oa-link oa-sf__add" @click="set(fresh(s))">+ {{ labels.add }}</button>
        <button
          v-else-if="!root && (removable || !required)"
          type="button"
          class="oa-icon-button"
          :title="labels.remove"
          :aria-label="labels.remove"
          @click="remove"
        >×</button>
      </span>
    </div>
    <p v-if="hint && !bare && (present || root)" class="oa-field__hint" :title="hint">{{ hint }}</p>

    <div v-if="present && !isNull && (open || root) && !isLeaf" class="oa-sf__body">
      <template v-if="kind === 'object'">
        <OaSchemaForm
          v-for="p in properties"
          :key="p.name"
          :schema="p.schema"
          :name="p.name"
          :required="p.required"
          :model-value="object[p.name]"
          :depth="depth + 1"
          @update:model-value="(v: unknown) => set(withKey(object, p.name, v))"
        />
      </template>

      <template v-else-if="kind === 'map'">
        <div v-for="([k, v], i) in entries" :key="i" class="oa-sf__entry" :class="{ 'oa-sf__entry--leaf': valueIsLeaf }">
          <UidInput
            class="oa-sf__key"
            size="sm"
            :placeholder="labels.name"
            :aria-label="labels.name"
            :model-value="k"
            @update:model-value="(nk: string) => set(renameKey(object, k, nk))"
          />
          <OaSchemaForm
            :schema="valueSchema"
            :model-value="v"
            :label="valueIsLeaf ? undefined : k"
            :bare="valueIsLeaf"
            removable
            :depth="depth + 1"
            @remove="set(withKey(object, k, undefined))"
            @update:model-value="(nv: unknown) => set(withKey(object, k, nv === undefined ? null : nv))"
          />
        </div>
        <UidButton class="oa-sf__more" variant="ghost" size="sm" @click="addEntry">+ {{ labels.add }}</UidButton>
      </template>

      <template v-else-if="kind === 'array'">
        <OaSchemaForm
          v-for="(item, i) in list"
          :key="i"
          :schema="items"
          :model-value="item"
          :label="`#${i + 1}`"
          :bare="itemIsLeaf"
          removable
          :depth="depth + 1"
          @remove="removeItem(i)"
          @update:model-value="(v: unknown) => setItem(i, v === undefined ? null : v)"
        />
        <UidButton class="oa-sf__more" variant="ghost" size="sm" @click="addItem">+ {{ labels.addItem }}</UidButton>
      </template>
    </div>
  </div>
</template>
