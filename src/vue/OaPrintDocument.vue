<script setup lang="ts">
/** The whole spec for paper: the introduction, every operation on its own page, then the schemas. */
import { computed } from 'vue'
import { UidMarkdown } from '@dskripchenko/ui'
import { useReference } from './context'
import OaPrintOperation from './OaPrintOperation.vue'
import OaPrintSchema from './OaPrintSchema.vue'
import { safeHref } from './safe'

const props = defineProps<{
  /** The page address the operation anchors are appended to; none printed without it. */
  base?: string
}>()
const ctx = useReference()
const labels = ctx.labels
const doc = computed(() => ctx.spec.value.document)
const operations = computed(() => ctx.spec.value.operations)
const schemas = computed(() => Object.entries(doc.value.components?.schemas ?? {}))
const urlOf = (id: string): string | undefined => (props.base ? `${props.base}#${ctx.anchorPrefix.value}operation/${id}` : undefined)
const today = new Date().toISOString().slice(0, 10)
</script>

<template>
  <div class="oap-document">
    <header class="oap-intro">
      <h1>{{ doc.info.title }}</h1>
      <p class="oap-note">{{ labels.version }} {{ doc.info.version }} · OpenAPI {{ ctx.spec.value.source.version }} · {{ labels.generatedOn }} {{ today }}</p>
      <p v-if="doc.info.summary">{{ doc.info.summary }}</p>
      <UidMarkdown v-if="doc.info.description" class="oap-md" :source="doc.info.description" />
      <template v-if="doc.servers?.length">
        <h2>{{ labels.servers }}</h2>
        <ul>
          <li v-for="s in doc.servers" :key="s.url"><code>{{ s.url }}</code><template v-if="s.description"> — {{ s.description }}</template></li>
        </ul>
      </template>
      <p v-if="doc.info.contact?.email || safeHref(doc.info.contact?.url)" class="oap-note">
        {{ doc.info.contact?.name }}
        <a v-if="safeHref(doc.info.contact?.url)" :href="safeHref(doc.info.contact?.url)">{{ doc.info.contact?.url }}</a>
        <span v-if="doc.info.contact?.email">{{ doc.info.contact.email }}</span>
      </p>
      <h2>{{ labels.operations }}</h2>
      <ol class="oap-toc">
        <li v-for="e in operations" :key="e.id">
          <span class="oap-method" :class="`oap-method--${e.method}`">{{ e.method.toUpperCase() }}</span>
          <code>{{ e.path }}</code> — {{ e.operation.summary || e.id }}
        </li>
      </ol>
    </header>

    <OaPrintOperation v-for="e in operations" :key="e.id" class="oap-page" :entry="e" :url="urlOf(e.id)" :standalone="false" />

    <section v-if="schemas.length" class="oap-page oap-schemas">
      <h1>{{ labels.schemas }}</h1>
      <div v-for="[name, s] in schemas" :key="name" class="oap-model">
        <h2>{{ name }}</h2>
        <UidMarkdown v-if="s.description" class="oap-md" :source="s.description" />
        <OaPrintSchema :schema="s" />
      </div>
    </section>
  </div>
</template>
