<script setup lang="ts">
/**
 * Request samples: the draft's request printed in the chosen language. The
 * choice is shared by every operation on the page.
 */
import { computed } from 'vue'
import { UidCode, UidSelect } from '@dskripchenko/ui'
import { generateSnippet, SNIPPET_TARGETS, type SnippetTarget } from '../snippets'
import { useReference } from './context'
import type { OperationDraft } from './draft'

const props = defineProps<{ draft: OperationDraft }>()
const ctx = useReference()

const options = computed(() =>
  SNIPPET_TARGETS.filter((t) => ctx.snippetTargets.value.includes(t.id)).map((t) => ({ value: t.id, label: t.label })),
)
const info = computed(() => SNIPPET_TARGETS.find((t) => t.id === ctx.snippetTarget.value) ?? SNIPPET_TARGETS[0]!)
const code = computed(() => generateSnippet(info.value.id, props.draft.request))

function choose(value: unknown): void {
  if (typeof value === 'string') ctx.snippetTarget.value = value as SnippetTarget
}
</script>

<template>
  <section class="oa-panel oa-samples">
    <header class="oa-panel__head">
      <span class="oa-panel__title">{{ ctx.labels.value.samples }}</span>
      <UidSelect
        class="oa-samples__select"
        size="sm"
        :options="options"
        :model-value="ctx.snippetTarget.value"
        searchable
        @update:model-value="choose"
      />
    </header>
    <UidCode class="oa-samples__code" :code="code" :language="info.language" copy max-height="420px" />
  </section>
</template>
