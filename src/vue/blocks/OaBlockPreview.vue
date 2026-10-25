<script setup lang="ts">
/**
 * A block as readers see it: every operation as the embed's compact card
 * (OpenApiOperation), under the block's title. A block that does not read
 * shows the reason and its source instead.
 */
import { computed } from 'vue'
import { UidAlert, UidCode, UidMarkdown } from '@dskripchenko/ui'
import type { ParseBlockResult } from '../../blocks'
import type { SendFn } from '../../request'
import type { SnippetTarget } from '../../snippets'
import { sharedSpec } from '../embed'
import type { OpenApiLabels } from '../labels'
import OpenApiOperation from '../OpenApiOperation.vue'
import type { BlockLabels } from './labels'

const props = defineProps<{
  result: ParseBlockResult
  source: string
  labels: BlockLabels
  /** Bumped on every parse that reads: the cards start afresh for a changed block. */
  version: number
  locale?: string
  cardLabels?: Partial<OpenApiLabels>
  send?: SendFn
  tryIt?: boolean
  snippetTargets?: SnippetTarget[]
  defaultSnippet?: SnippetTarget
  baseUrl?: string
  persistCredentials?: boolean | 'session' | 'local'
  oauthRedirectUrl?: string
}>()

/** The document, loaded once for all the cards (they share the load by its identity). */
const loaded = computed(() => {
  if (!props.result.ok) return null
  try {
    return { spec: sharedSpec(props.result.document, undefined) as Exclude<ReturnType<typeof sharedSpec>, Promise<unknown>>, error: null }
  } catch (error) {
    return { spec: null, error: error instanceof Error ? error.message : String(error) }
  }
})
const operations = computed(() => loaded.value?.spec?.operations.filter((o) => !o.webhook) ?? [])
const heading = computed(() => {
  const r = props.result
  if (!r.ok || r.kind !== 'requests') return null
  const data = r.data as { title?: unknown; description?: unknown; requests?: unknown }
  if (!data.requests) return null
  return { title: typeof data.title === 'string' ? data.title : '', description: typeof data.description === 'string' ? data.description : '' }
})
const where = computed(() => (props.result.ok || !props.result.error.line ? '' : `${props.result.error.line}:${props.result.error.column ?? 1} `))
const cardProps = computed(() => ({
  locale: props.locale,
  labels: props.cardLabels,
  send: props.send,
  tryIt: props.tryIt,
  baseUrl: props.baseUrl,
  persistCredentials: props.persistCredentials,
  oauthRedirectUrl: props.oauthRedirectUrl,
  ...(props.snippetTargets ? { snippetTargets: props.snippetTargets } : {}),
  ...(props.defaultSnippet ? { defaultSnippet: props.defaultSnippet } : {}),
}))
</script>

<template>
  <div class="oa-bk__preview">
    <template v-if="!result.ok">
      <UidAlert class="oa-bk__alert" variant="danger" :title="labels.parseError">
        <code class="oa-bk__where">{{ where }}</code>{{ result.error.message }}
      </UidAlert>
      <UidCode v-if="source.trim()" class="oa-bk__raw" :code="source" :language="result.format" />
    </template>
    <UidAlert v-else-if="loaded?.error" class="oa-bk__alert" variant="danger" :title="labels.parseError">{{ loaded.error }}</UidAlert>
    <template v-else>
      <header v-if="heading && (heading.title || heading.description)" class="oa-bk__heading">
        <h3 v-if="heading.title" class="oa-bk__title">{{ heading.title }}</h3>
        <UidMarkdown v-if="heading.description" class="oa-bk__description" :source="heading.description" />
      </header>
      <p v-if="!operations.length" class="oa-bk__empty">{{ labels.noOperations }}</p>
      <OpenApiOperation
        v-for="(op, i) in operations"
        :key="`${version}:${i}`"
        :spec="result.document"
        :operation="op.id"
        v-bind="cardProps"
      />
    </template>
  </div>
</template>
