<script setup lang="ts">
/**
 * The examples of one media type: a chip per named example when there are
 * several, its description, and its value as code. An `externalValue`
 * example is a link (never fetched). Without examples, `generated` shows a
 * sample from the schema instead.
 */
import { computed, ref, watch } from 'vue'
import { UidCode, UidMarkdown } from '@dskripchenko/ui'
import { useReference } from './context'
import { GENERATED_EXAMPLE, exampleText, namedExamples, type ExampleHolder, type NamedExample } from './draft'
import { safeHref } from './safe'

const props = withDefaults(
  defineProps<{
    media: ExampleHolder
    mediaType: string
    mode?: 'request' | 'response'
    /** Falls back to a sample from the schema when the spec gives no examples. */
    generated?: boolean
  }>(),
  { mode: 'response', generated: false },
)
const ctx = useReference()
const labels = ctx.labels

const options = computed<NamedExample[]>(() => {
  const named = namedExamples(props.media, ctx)
  if (named.length || !props.generated || !props.media.schema) return named
  return [{ name: GENERATED_EXAMPLE, label: labels.value.generatedSample }]
})
const chosen = ref(options.value[0]?.name ?? '')
watch(options, (list) => {
  if (!list.some((e) => e.name === chosen.value)) chosen.value = list[0]?.name ?? ''
})
const current = computed(() => options.value.find((e) => e.name === chosen.value))
const code = computed(() => (current.value ? exampleText(props.media, current.value.name, ctx, props.mediaType, props.mode) : ''))
</script>

<template>
  <div v-if="options.length" class="oa-examples">
    <div v-if="options.length > 1" class="oa-examples__names" role="group" :aria-label="labels.examples">
      <button
        v-for="e in options"
        :key="e.name"
        type="button"
        class="oa-chip"
        :class="{ 'is-active': e.name === chosen }"
        :aria-pressed="e.name === chosen"
        @click="chosen = e.name"
      >{{ e.label }}</button>
    </div>
    <UidMarkdown v-if="current?.description" class="oa-md oa-md--small" :source="current.description" />
    <p v-if="current?.externalValue !== undefined" class="oa-examples__external">
      <a v-if="safeHref(current.externalValue)" :href="safeHref(current.externalValue)" target="_blank" rel="noopener noreferrer">{{ labels.externalExample }}</a>
      <code v-else>{{ current.externalValue }}</code>
    </p>
    <UidCode
      v-else-if="code"
      class="oa-response__example"
      :code="code"
      :language="/json/i.test(mediaType) ? 'json' : undefined"
      copy
      max-height="320px"
    />
  </div>
</template>
