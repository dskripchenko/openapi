<script setup lang="ts">
/**
 * Name/value rows the spec does not declare: custom headers, query
 * parameters, cookies. Each row has a remove button; rows with an empty
 * name are kept while typing and skipped when the request is built.
 */
import { UidInput } from '@dskripchenko/ui'
import { useReference } from './context'

const props = defineProps<{ rows: [string, string][] }>()
const emit = defineEmits<{ 'update:rows': [rows: [string, string][]] }>()
const labels = useReference().labels

function set(index: number, part: 0 | 1, text: string): void {
  emit(
    'update:rows',
    props.rows.map((row, i): [string, string] => (i === index ? (part === 0 ? [text, row[1]] : [row[0], text]) : row)),
  )
}
const remove = (index: number) => emit('update:rows', props.rows.filter((_, i) => i !== index))
</script>

<template>
  <div class="oa-kv">
    <div v-for="(row, i) in rows" :key="i" class="oa-kv__row">
      <UidInput
        class="oa-kv__key"
        size="sm"
        :placeholder="labels.name"
        :aria-label="labels.name"
        :model-value="row[0]"
        @update:model-value="(v: string) => set(i, 0, v)"
      />
      <UidInput
        class="oa-kv__value"
        size="sm"
        :placeholder="labels.value"
        :aria-label="labels.value"
        :model-value="row[1]"
        @update:model-value="(v: string) => set(i, 1, v)"
      />
      <button type="button" class="oa-icon-button oa-kv__remove" :title="labels.remove" :aria-label="labels.remove" @click="remove(i)">×</button>
    </div>
  </div>
</template>
