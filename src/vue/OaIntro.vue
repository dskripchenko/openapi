<script setup lang="ts">
/**
 * The document's introduction at the top of the content: its description and
 * contacts. The title, the server and the credentials live in the header.
 */
import { computed } from 'vue'
import { UidMarkdown } from '@dskripchenko/ui'
import { useReference } from './context'
import { safeHref } from './safe'

const ctx = useReference()
const labels = ctx.labels
const info = computed(() => ctx.spec.value.document.info)
</script>

<template>
  <header class="oa-intro">
    <div class="oa-intro__title">
      <h1>{{ info.title }}</h1>
      <span class="oa-chip-static">{{ info.version }}</span>
      <span class="oa-chip-static oa-chip-static--muted">OpenAPI {{ ctx.spec.value.source.version }}</span>
    </div>
    <p v-if="info.summary" class="oa-intro__summary">{{ info.summary }}</p>
    <UidMarkdown v-if="info.description" class="oa-md" :source="info.description" />
    <p v-if="info.contact || info.license || info.termsOfService" class="oa-intro__meta">
      <a v-if="safeHref(info.contact?.url)" :href="safeHref(info.contact?.url)" target="_blank" rel="noopener noreferrer">{{ info.contact?.name || info.contact?.url }}</a>
      <a v-if="info.contact?.email" :href="safeHref(`mailto:${info.contact.email}`)">{{ info.contact.email }}</a>
      <a v-if="safeHref(info.license?.url)" :href="safeHref(info.license?.url)" target="_blank" rel="noopener noreferrer">{{ info.license?.name }}</a>
      <span v-else-if="info.license">{{ info.license.name }}</span>
      <a v-if="safeHref(info.termsOfService)" :href="safeHref(info.termsOfService)" target="_blank" rel="noopener noreferrer">{{ labels.terms }}</a>
    </p>
  </header>
</template>
