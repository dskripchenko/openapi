<script setup lang="ts">
/** A schema for paper: one table with every property, nested ones indented, nothing folded. */
import { computed } from 'vue'
import { UidMarkdown } from '@dskripchenko/ui'
import type { Schema } from '../core/types'
import { useReference } from './context'
import { flattenSchema } from './printSchema'

const props = withDefaults(defineProps<{ schema: Schema; mode?: 'request' | 'response' }>(), { mode: 'response' })
const ctx = useReference()
const labels = ctx.labels
const rows = computed(() =>
  flattenSchema(props.schema, { resolve: (r) => ctx.spec.value.resolver.get(r) as Schema | undefined, mode: props.mode }),
)
const root = computed(() => rows.value[0]!)
const nested = computed(() => rows.value.slice(1))
const json = (v: unknown): string => JSON.stringify(v)
</script>

<template>
  <div class="oap-schema">
    <p class="oap-schema__root">
      <code>{{ root.type }}</code>
    </p>
    <UidMarkdown v-if="root.description && !nested.length" class="oap-md" :source="root.description" />
    <table v-if="nested.length" class="oap-table oap-table--schema">
      <thead>
        <tr><th>{{ labels.name }}</th><th>{{ labels.type }}</th><th>{{ labels.description }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in nested" :key="i" :class="{ 'oap-row--branch': r.branch }" :data-depth="r.depth">
          <td class="oap-schema__name" :style="{ paddingLeft: `${(r.depth - 1) * 14 + 6}px` }">
            <code v-if="!r.branch">{{ r.name }}</code>
            <em v-else>{{ r.name }}</em>
            <span v-if="r.required" class="oap-required">{{ labels.required }}</span>
          </td>
          <td>
            <code>{{ r.type }}</code>
            <span v-for="f in r.flags" :key="f" class="oap-flag">{{ f }}</span>
          </td>
          <td>
            <span v-if="r.cycle" class="oap-cycle">→ {{ r.cycle }} ({{ labels.seeAbove }})</span>
            <UidMarkdown v-if="r.description" class="oap-md" :source="r.description" />
            <div v-if="r.constraints.length" class="oap-note">{{ r.constraints.join(', ') }}</div>
            <div v-if="r.enum" class="oap-note">{{ labels.enum }}: <code v-for="(e, j) in r.enum" :key="j">{{ json(e) }}</code></div>
            <div v-if="r.default !== undefined" class="oap-note">{{ labels.default }}: <code>{{ json(r.default) }}</code></div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
