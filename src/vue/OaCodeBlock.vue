<script setup lang="ts">
/**
 * A code block that never scrolls sideways: long lines wrap. A long block is
 * folded to its first lines with a fade and a "Show all" button, so the page
 * scrolls instead of a box inside it.
 */
import { computed, ref, watch } from 'vue'
import { UidCode } from '@dskripchenko/ui'
import { useReference } from './context'

const props = withDefaults(
  defineProps<{
    code: string
    language?: string
    /** Lines shown before the block folds. */
    foldAfter?: number
  }>(),
  { language: undefined, foldAfter: 18 },
)

const { labels } = useReference()
const lines = computed(() => props.code.split('\n').length)
const foldable = computed(() => lines.value > props.foldAfter + 4)
const open = ref(false)
watch(
  () => props.code,
  () => (open.value = false),
)
</script>

<template>
  <div class="oa-code" :class="{ 'oa-code--folded': foldable && !open }" :style="{ '--oa-code-fold-lines': foldAfter }">
    <UidCode :code="code" :language="language" copy wrap />
    <button v-if="foldable" type="button" class="oa-code__toggle" :aria-expanded="open" @click="open = !open">
      {{ open ? labels.hide : `${labels.show} · ${lines}` }}
    </button>
  </div>
</template>
