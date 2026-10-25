<script setup lang="ts">
/**
 * One try-it field: the name (monospace), a required mark, the type, and the
 * input the schema calls for — a select for an enum, a switch for a required
 * boolean (true / false / not set otherwise), a number input with the schema's
 * bounds, tags for an array of scalars, a date picker for `date`/`date-time`,
 * a small JSON box for objects. The value is text both ways, as the draft
 * keeps it; the description is a muted line under the input.
 */
import { computed } from 'vue'
import { UidInput, UidNumberInput, UidSelect, UidSwitch, UidTagsInput } from '@dskripchenko/ui'
import type { Schema } from '../core/types'
import { vAutoGrow } from './autoGrow'
import { useReference } from './context'
import {
  fieldSpec,
  fromLocalDateTime,
  itemsToText,
  localDateTimeFits,
  plainText,
  textToItems,
  toLocalDateTime,
  typeLabel,
} from './fields'

const props = withDefaults(
  defineProps<{
    name: string
    schema?: Schema
    modelValue: string
    required?: boolean
    deprecated?: boolean
    /** Markdown; shown as plain text, two lines at most. */
    description?: string
    /** Only the input: no name line and no hint (array items, map values). */
    bare?: boolean
  }>(),
  { schema: undefined, required: false, deprecated: false, description: undefined, bare: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const ctx = useReference()
const labels = ctx.labels
const resolve = (r: string) => ctx.spec.value.resolver.get(r) as never

const spec = computed(() => fieldSpec(props.schema, resolve))
const type = computed(() => typeLabel(spec.value))
const hint = computed(() => (props.bare ? '' : plainText(props.description ?? spec.value.schema.description)))
const isDeprecated = computed(() => props.deprecated || spec.value.schema.deprecated === true)

// The label points at the input; useId() would need Vue 3.5.
const id = `oa-field-${Math.random().toString(36).slice(2, 10)}`

const set = (text: string) => emit('update:modelValue', text)

const enumOptions = computed(() => {
  const options = spec.value.options ?? []
  return props.required ? options : [{ value: '', label: `— ${labels.value.notSet} —` }, ...options]
})

const number = computed<number | null>(() => {
  if (props.modelValue.trim() === '') return null
  const n = Number(props.modelValue)
  return Number.isNaN(n) ? null : n
})

const items = computed(() => textToItems(props.modelValue))
const setItems = (list: (string | number)[]) => set(itemsToText(list.map(String), spec.value.itemType))

const local = computed(() => toLocalDateTime(props.modelValue))
const nativeDateTime = computed(() => localDateTimeFits(props.modelValue))

const placeholder = computed(() => spec.value.placeholder ?? (spec.value.kind === 'json' ? '{ }' : type.value))
</script>

<template>
  <div class="oa-field" :class="{ 'oa-field--bare': bare, 'is-deprecated': isDeprecated }" :data-field="name">
    <div v-if="!bare" class="oa-field__head">
      <label class="oa-field__name" :for="id">{{ name }}</label>
      <span v-if="required" class="oa-field__required" :title="labels.required" :aria-label="labels.required">*</span>
      <span v-if="type" class="oa-field__type">{{ type }}</span>
      <span v-if="isDeprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
      <span v-if="$slots.actions" class="oa-field__actions"><slot name="actions" /></span>
    </div>
    <div class="oa-field__control">
      <UidSelect
        v-if="spec.kind === 'enum'"
        size="sm"
        :options="enumOptions"
        :placeholder="`— ${labels.notSet} —`"
        :model-value="modelValue"
        :aria-label="name"
        @update:model-value="(v: unknown) => set(v === null || v === undefined ? '' : String(v))"
      />
      <UidSwitch
        v-else-if="spec.kind === 'boolean' && required"
        :id="id"
        size="sm"
        :label="modelValue === 'true' ? 'true' : 'false'"
        :model-value="modelValue === 'true'"
        @update:model-value="(v: boolean) => set(v ? 'true' : 'false')"
      />
      <div v-else-if="spec.kind === 'boolean'" :id="id" class="oa-segmented oa-field__bool" role="radiogroup" :aria-label="name">
        <button
          v-for="opt in ['', 'true', 'false']"
          :key="opt"
          type="button"
          role="radio"
          class="oa-segmented__item"
          :class="{ 'is-active': modelValue === opt || (opt === '' && modelValue !== 'true' && modelValue !== 'false') }"
          :aria-checked="modelValue === opt"
          :data-value="opt || 'unset'"
          @click="set(opt)"
        >{{ opt || '—' }}</button>
      </div>
      <UidNumberInput
        v-else-if="spec.kind === 'integer' || spec.kind === 'number'"
        :id="id"
        size="sm"
        :min="spec.min"
        :max="spec.max"
        :step="spec.step ?? 1"
        :placeholder="placeholder"
        :model-value="number"
        @update:model-value="(v: number | null) => set(v === null ? '' : String(v))"
      />
      <UidSelect
        v-else-if="spec.kind === 'array' && spec.options"
        size="sm"
        multiple
        :options="spec.options"
        :placeholder="type"
        :model-value="items"
        :aria-label="name"
        @update:model-value="(v: unknown) => setItems(Array.isArray(v) ? v : [])"
      />
      <UidTagsInput
        v-else-if="spec.kind === 'array'"
        :id="id"
        size="sm"
        :placeholder="placeholder"
        :model-value="items"
        @update:model-value="setItems"
      />
      <textarea
        v-else-if="spec.kind === 'json'"
        :id="id"
        v-auto-grow
        class="oa-field__json"
        rows="1"
        spellcheck="false"
        :placeholder="placeholder"
        :value="modelValue"
        @input="(e: Event) => set((e.target as HTMLTextAreaElement).value)"
      />
      <UidInput
        v-else-if="spec.kind === 'date'"
        :id="id"
        type="date"
        size="sm"
        :model-value="modelValue"
        @update:model-value="set"
      />
      <UidInput
        v-else-if="spec.kind === 'datetime' && nativeDateTime"
        :id="id"
        type="datetime-local"
        step="1"
        size="sm"
        :model-value="local"
        @update:model-value="(v: string) => set(fromLocalDateTime(v))"
      />
      <UidInput v-else :id="id" size="sm" :placeholder="placeholder" :model-value="modelValue" @update:model-value="set" />
      <slot name="after" />
    </div>
    <p v-if="hint" class="oa-field__hint" :title="hint">{{ hint }}</p>
  </div>
</template>
