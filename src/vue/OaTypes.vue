<script setup lang="ts">
/**
 * The operation's TypeScript types: the generated names as chips (a click
 * copies one), then the declarations with the component types they reach.
 * Mounted only once its tab is opened, so the code is generated on demand.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { OperationEntry } from '../model'
import { operationTypes } from '../typescript'
import { useReference } from './context'
import OaCodeBlock from './OaCodeBlock.vue'

const props = defineProps<{ entry: OperationEntry }>()
const ctx = useReference()
const labels = ctx.labels

const types = computed(() => operationTypes(ctx.spec.value, props.entry))

const copied = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy(name: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(name)
  } catch {
    return
  }
  copied.value = name
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = null), 1500)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <section class="oa-panel oa-types">
    <header class="oa-panel__head">
      <span class="oa-panel__title">{{ labels.types }}</span>
    </header>
    <div class="oa-types__names">
      <button
        v-for="name in types.names.all"
        :key="name"
        type="button"
        class="oa-chip oa-types__name"
        :class="{ 'is-active': copied === name }"
        :data-name="name"
        :title="copied === name ? labels.typeNameCopied : labels.copyTypeName"
        @click="copy(name)"
      >{{ name }}</button>
      <span v-if="copied" class="oa-types__copied" role="status">{{ labels.typeNameCopied }}</span>
    </div>
    <OaCodeBlock class="oa-types__code" :code="types.code" language="typescript" />
  </section>
</template>
