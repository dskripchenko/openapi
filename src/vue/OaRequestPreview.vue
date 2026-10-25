<script setup lang="ts">
/**
 * "What will be sent": one line — method, URL, how many headers — that opens
 * into the full URL (wrapped, with a copy button) and the final headers,
 * credentials masked.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { HttpRequest, SecurityScheme } from '../core/types'
import { useReference } from './context'
import { previewHeaders, secretHeaderNames } from './preview'
import { copyText } from './share'

const props = defineProps<{ request: HttpRequest }>()
const ctx = useReference()
const labels = ctx.labels

const open = ref(false)
const secrets = computed(() => {
  const schemes = ctx.spec.value.document.components?.securitySchemes ?? {}
  return secretHeaderNames(Object.values(schemes).map((s) => ctx.spec.value.resolver.deref(s) as SecurityScheme | undefined))
})
const headers = computed(() => previewHeaders(props.request, secrets.value))
const count = computed(() => labels.value.headerCount.replace('{n}', String(headers.value.length)))

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy(): Promise<void> {
  copied.value = await copyText(props.request.url)
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1500)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="oa-preview" :class="{ 'is-open': open }">
    <button type="button" class="oa-preview__summary" :aria-expanded="open" @click="open = !open">
      <span class="oa-schema__chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
      <span class="oa-preview__title">{{ labels.willBeSent }}</span>
      <span class="oa-preview__line">
        <span class="oa-preview__method">{{ request.method }}</span>
        <span class="oa-preview__url-short">{{ request.url }}</span>
        <span class="oa-preview__count">· {{ count }}</span>
      </span>
    </button>
    <div v-if="open" class="oa-preview__body">
      <div class="oa-preview__url-row">
        <code class="oa-preview__url"><b>{{ request.method }}</b> {{ request.url }}</code>
        <button type="button" class="oa-link oa-preview__copy" @click="copy">{{ copied ? labels.urlCopied : labels.copyUrl }}</button>
      </div>
      <dl v-if="headers.length" class="oa-preview__headers">
        <template v-for="([k, v], i) in headers" :key="i">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>
