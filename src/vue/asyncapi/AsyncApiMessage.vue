<script setup lang="ts">
/** One message: what it carries (headers and payload schemas), an example, its bindings. */
import { computed } from 'vue'
import { UidMarkdown } from '@dskripchenko/ui'
import type { Schema } from '../../core/types'
import { sample } from '../../schema/sample'
import type { AsyncMessage } from '../../asyncapi'
import { useReference } from '../context'
import OaSchema from '../OaSchema.vue'
import OaCodeBlock from '../OaCodeBlock.vue'
import type { AsyncApiLabels } from './labels'

const props = defineProps<{ message: AsyncMessage; labels: AsyncApiLabels; anchor?: string }>()
const ctx = useReference()
const resolve = (ref: string) => ctx.spec.value.resolver.get(ref) as Schema | undefined

/** The first example given, or one made from the schemas. */
const example = computed(() => {
  const m = props.message
  const given = m.examples[0]
  if (given && (given.payload !== undefined || given.headers !== undefined)) {
    return { title: given.name ?? given.summary, headers: given.headers, payload: given.payload }
  }
  try {
    return {
      title: undefined,
      headers: m.headers ? sample(m.headers, { resolve }) : undefined,
      payload: m.payload ? sample(m.payload, { resolve }) : undefined,
    }
  } catch {
    return null
  }
})
const json = (v: unknown) => JSON.stringify(v, null, 2)
</script>

<template>
  <div :id="anchor" class="oa-block oa-async-message" :data-message="message.key">
    <div class="oa-async-message__head">
      <h4 class="oa-block__title">{{ message.title || message.name || message.key }}</h4>
      <code v-if="message.contentType" class="oa-chip-static" :title="labels.contentType">{{ message.contentType }}</code>
      <span v-if="message.deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
    </div>
    <p v-if="message.summary" class="oa-async__summary">{{ message.summary }}</p>
    <UidMarkdown v-if="message.description" class="oa-md oa-md--small" :source="message.description" />
    <div v-if="message.headers" class="oa-async__part">
      <div class="oa-params__loc">{{ labels.headers }}</div>
      <OaSchema :schema="message.headers" />
    </div>
    <div v-if="message.payload" class="oa-async__part">
      <div class="oa-params__loc">{{ labels.payload }}</div>
      <OaSchema :schema="message.payload" />
    </div>
    <div v-else-if="message.foreignPayload" class="oa-async__part">
      <div class="oa-params__loc">{{ labels.payloadIn(message.foreignPayload.format) }}</div>
      <OaCodeBlock :code="json(message.foreignPayload.schema)" language="json" />
    </div>
    <p v-if="message.correlationId?.location" class="oa-async__meta">
      <span class="oa-schema__label">{{ labels.correlationId }}:</span> <code>{{ message.correlationId.location }}</code>
    </p>
    <div v-if="example && (example.payload !== undefined || example.headers !== undefined)" class="oa-async__part">
      <div class="oa-params__loc">{{ labels.example }}<template v-if="example.title"> · {{ example.title }}</template></div>
      <OaCodeBlock v-if="example.headers !== undefined" :code="json(example.headers)" language="json" />
      <OaCodeBlock v-if="example.payload !== undefined" :code="json(example.payload)" language="json" />
    </div>
    <div v-if="message.bindings" class="oa-async__part">
      <div class="oa-params__loc">{{ labels.bindings }}</div>
      <OaCodeBlock :code="json(message.bindings)" language="json" />
    </div>
  </div>
</template>
