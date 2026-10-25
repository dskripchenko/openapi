<script setup lang="ts">
/**
 * The document's head: title, version, description, contact, the server to
 * call and the credentials, and the spec itself to download.
 */
import { computed } from 'vue'
import { UidButton, UidInput, UidMarkdown, UidSelect } from '@dskripchenko/ui'
import { Download } from '@dskripchenko/ui/icons'
import type { Server } from '../core/types'
import { stringifySpec, type SpecFormat } from '../load'
import { useReference } from './context'
import OaAuth from './OaAuth.vue'
import { safeHref } from './safe'

const ctx = useReference()
const labels = ctx.labels
const info = computed(() => ctx.spec.value.document.info)
const servers = computed<Server[]>(() => ctx.spec.value.document.servers ?? [])
const options = computed(() => [
  ...servers.value.map((s, i) => ({ value: i, label: s.description ? `${s.url} — ${s.description}` : s.url })),
  { value: -1, label: '…' },
])
const current = computed(() => (ctx.server.index === -1 ? undefined : servers.value[ctx.server.index]))

function choose(v: unknown): void {
  if (typeof v !== 'number') return
  ctx.server.index = v
  ctx.server.variables = Object.fromEntries(Object.entries(servers.value[v]?.variables ?? {}).map(([k, sv]) => [k, sv.default]))
}

const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}.]+/gu, '-').replace(/^-+|-+$/g, '')

/** `{title}-{version}.yaml`: the source document as given, not the normalized 3.1 copy. */
function download(format: SpecFormat): void {
  const spec = ctx.spec.value
  const text = stringifySpec(spec.source.raw, format)
  const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'application/yaml' })
  const name = [slug(info.value.title ?? ''), slug(String(info.value.version ?? ''))].filter(Boolean).join('-') || 'openapi'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.${format === 'json' ? 'json' : 'yaml'}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
</script>

<template>
  <header class="oa-intro">
    <div class="oa-intro__title">
      <h1>{{ info.title }}</h1>
      <span class="oa-intro__version">{{ info.version }}</span>
      <span class="oa-intro__spec">OpenAPI {{ ctx.spec.value.source.version }}</span>
      <span class="oa-intro__download" role="group" :aria-label="labels.downloadSpec" :title="labels.downloadSpec">
        <UidButton
          v-for="f in (['yaml', 'json'] as const)"
          :key="f"
          variant="ghost"
          size="sm"
          :icon="Download"
          :data-format="f"
          :aria-label="`${labels.downloadSpec} (${f.toUpperCase()})`"
          @click="download(f)"
        >{{ f.toUpperCase() }}</UidButton>
      </span>
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

    <div class="oa-intro__panels">
      <section v-if="servers.length" class="oa-panel oa-servers">
        <header class="oa-panel__head">
          <span class="oa-panel__title">{{ labels.servers }}</span>
        </header>
        <div class="oa-servers__body">
          <UidSelect size="sm" :options="options" :model-value="ctx.server.index" @update:model-value="choose" />
          <UidInput v-if="ctx.server.index === -1" size="sm" v-model="ctx.server.custom" placeholder="https://api.example.com" />
          <div v-if="current?.variables" class="oa-auth__row">
            <template v-for="(v, name) in current.variables" :key="name">
              <label v-if="v.enum" class="oa-servers__var">
                <span>{{ name }}</span>
                <UidSelect
                  size="sm"
                  :options="v.enum.map((e) => ({ value: e, label: e }))"
                  :model-value="ctx.server.variables[name] ?? v.default"
                  @update:model-value="(x: unknown) => (ctx.server.variables[name] = String(x))"
                />
              </label>
              <UidInput v-else size="sm" :label="String(name)" v-model="ctx.server.variables[name]" />
            </template>
          </div>
        </div>
      </section>
      <OaAuth />
    </div>
  </header>
</template>
