<script setup lang="ts">
/**
 * OpenApiReference — an API reference for a Swagger 2.0 / OpenAPI 3.x spec.
 *
 * Give it the spec as YAML/JSON text or an object. The page lists operations
 * by tag with a search, documents each one (parameters, body, responses as
 * schema trees, examples), prints the request in 13 languages and sends it
 * from "Try it". Deep links: `#operation/{id}` and `#schema/{name}`.
 */
import { computed, nextTick, onMounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import { UidAlert, UidInput, UidLocaleProvider, UidMarkdown, en as uidEn, ru as uidRu } from '@dskripchenko/ui'
import { loadSpec } from '../load'
import type { LoadedSpec } from '../model'
import type { ResolverOptions } from '../model'
import { sendRequest, type SendFn } from '../request'
import { SNIPPET_TARGETS, type SnippetTarget } from '../snippets'
import { referenceKey, type ReferenceContext } from './context'
import { LOCALES, en, type OpenApiLabels } from './labels'
import OaIntro from './OaIntro.vue'
import OaOperation from './OaOperation.vue'
import OaSchema from './OaSchema.vue'

const props = withDefaults(
  defineProps<{
    /** The spec: YAML or JSON text, or a parsed object. */
    spec: string | object
    /** Sends try-it requests; `fetch` from the page by default. Pass a proxy for foreign APIs. */
    send?: SendFn
    /** Turns "Try it" off (samples stay). */
    tryIt?: boolean
    /**
     * Interface language: 'en' or 'ru'. Set, it also sets the kit's locale
     * inside the reference; left out, the strings are English and the kit
     * follows the host's own UidLocaleProvider.
     */
    locale?: string
    /** Overrides of single interface strings. */
    labels?: Partial<OpenApiLabels>
    /** The languages offered for samples, in order. All 13 by default. */
    snippetTargets?: SnippetTarget[]
    /** The language shown first. */
    defaultSnippet?: SnippetTarget
    /** The base a relative server URL resolves against; the page origin by default. */
    baseUrl?: string
    /** Loads external `$ref` documents; none are loaded without it. */
    external?: ResolverOptions['external']
    /** Updates `location.hash` when an operation is opened from the navigation. */
    hashNavigation?: boolean
  }>(),
  {
    send: undefined,
    tryIt: true,
    locale: undefined,
    labels: () => ({}),
    snippetTargets: () => SNIPPET_TARGETS.map((t) => t.id),
    defaultSnippet: 'curl',
    baseUrl: undefined,
    external: undefined,
    hashNavigation: true,
  },
)

const emit = defineEmits<{ loaded: [spec: LoadedSpec]; error: [error: Error] }>()

const loaded = shallowRef<LoadedSpec | null>(null)
const loadError = ref<string | null>(null)

function load(): void {
  try {
    loaded.value = loadSpec(props.spec, props.external ? { external: props.external } : {})
    loadError.value = null
    emit('loaded', loaded.value)
  } catch (error) {
    loaded.value = null
    loadError.value = error instanceof Error ? error.message : String(error)
    emit('error', error instanceof Error ? error : new Error(String(error)))
  }
}
load()
watch(() => [props.spec, props.external], load)

const labels = computed<OpenApiLabels>(() => ({ ...(LOCALES[props.locale ?? 'en'] ?? en), ...props.labels }))
const kitLocale = computed(() => (props.locale === 'ru' ? uidRu : props.locale === 'en' ? uidEn : undefined))

const defaultSend: SendFn = (req) => sendRequest(req)
const ctx: ReferenceContext = {
  spec: computed(() => loaded.value!) as ReferenceContext['spec'],
  labels,
  server: reactive({ index: 0, custom: '', variables: {} }),
  credentials: reactive({}),
  snippetTarget: ref(props.defaultSnippet),
  snippetTargets: computed(() => props.snippetTargets),
  send: computed(() => props.send ?? defaultSend),
  tryIt: computed(() => props.tryIt),
  baseUrl: computed(() => props.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : undefined)),
}
provide(referenceKey, ctx)

watch(
  loaded,
  (spec) => {
    const first = spec?.document.servers?.[0]
    ctx.server.index = 0
    ctx.server.variables = Object.fromEntries(Object.entries(first?.variables ?? {}).map(([k, v]) => [k, v.default]))
  },
  { immediate: true },
)

/* ------------------------------ navigation ------------------------------ */

const query = ref('')
const groups = computed(() => {
  const spec = loaded.value
  if (!spec) return []
  const q = query.value.trim().toLowerCase()
  return spec.groups
    .map((g) => ({
      ...g,
      operations: g.operations.filter(
        (e) =>
          !e.webhook &&
          (!q ||
            e.path.toLowerCase().includes(q) ||
            e.method.includes(q) ||
            (e.operation.summary ?? '').toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.operations.length)
})
const webhooks = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (loaded.value?.operations ?? []).filter(
    (e) => e.webhook && (!q || e.path.toLowerCase().includes(q) || (e.operation.summary ?? '').toLowerCase().includes(q)),
  )
})
const schemaNames = computed(() => {
  const q = query.value.trim().toLowerCase()
  return Object.keys(loaded.value?.document.components?.schemas ?? {}).filter((n) => !q || n.toLowerCase().includes(q))
})
const nothing = computed(() => !groups.value.length && !webhooks.value.length && !schemaNames.value.length)

const active = ref('')
const root = ref<HTMLElement | null>(null)

async function go(anchor: string): Promise<void> {
  active.value = anchor
  await nextTick()
  const el = root.value?.querySelector<HTMLElement>(`[id="${CSS.escape(anchor)}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'start' })
  // Operations render as they come near: the ones above the target grow and
  // push it down. Settle, then land on it again.
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await nextTick()
    el.scrollIntoView({ block: 'start' })
  }
  if (props.hashNavigation && typeof history !== 'undefined') history.replaceState(null, '', `#${anchor}`)
}

onMounted(() => {
  const hash = decodeURIComponent(window.location.hash.slice(1))
  if (hash.startsWith('operation/') || hash.startsWith('schema/')) void go(hash)
})

const schemas = computed(() => loaded.value?.document.components?.schemas ?? {})
const tagIntro = (name: string) => loaded.value?.groups.find((g) => g.name === name)

defineExpose({ go, spec: loaded })
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
  <div ref="root" class="oa-reference">
    <UidAlert v-if="loadError" variant="danger" :title="labels.loadError">{{ loadError }}</UidAlert>
    <template v-else-if="loaded">
      <nav class="oa-nav" :aria-label="labels.operations">
        <UidInput v-model="query" size="sm" type="search" :placeholder="labels.search" class="oa-nav__search" />
        <div class="oa-nav__scroll">
          <div v-for="g in groups" :key="g.name" class="oa-nav__group">
            <div class="oa-nav__tag">{{ g.displayName }}</div>
            <a
              v-for="e in g.operations"
              :key="e.id"
              :href="`#operation/${e.id}`"
              class="oa-nav__op"
              :class="{ 'is-active': active === `operation/${e.id}`, 'is-deprecated': e.deprecated }"
              @click.prevent="go(`operation/${e.id}`)"
            >
              <span class="oa-method oa-method--small" :class="`oa-method--${e.method}`">{{ e.method === 'delete' ? 'DEL' : e.method.toUpperCase() }}</span>
              <span class="oa-nav__label">{{ e.operation.summary || e.path }}</span>
            </a>
          </div>
          <div v-if="webhooks.length" class="oa-nav__group">
            <div class="oa-nav__tag">{{ labels.webhooks }}</div>
            <a
              v-for="e in webhooks"
              :key="e.id"
              :href="`#operation/${e.id}`"
              class="oa-nav__op"
              @click.prevent="go(`operation/${e.id}`)"
            >
              <span class="oa-method oa-method--small" :class="`oa-method--${e.method}`">{{ e.method.toUpperCase() }}</span>
              <span class="oa-nav__label">{{ e.operation.summary || e.path }}</span>
            </a>
          </div>
          <div v-if="schemaNames.length" class="oa-nav__group">
            <div class="oa-nav__tag">{{ labels.schemas }}</div>
            <a
              v-for="n in schemaNames"
              :key="n"
              :href="`#schema/${n}`"
              class="oa-nav__op"
              :class="{ 'is-active': active === `schema/${n}` }"
              @click.prevent="go(`schema/${n}`)"
            >
              <span class="oa-nav__label">{{ n }}</span>
            </a>
          </div>
          <p v-if="nothing" class="oa-nav__empty">{{ labels.noResults }}</p>
        </div>
      </nav>

      <main class="oa-main">
        <OaIntro />
        <section v-for="g in loaded.groups" :key="g.name" class="oa-tag">
          <h2 :id="`tag/${g.name}`" class="oa-tag__title">{{ g.displayName }}</h2>
          <UidMarkdown v-if="tagIntro(g.name)?.description" class="oa-md" :source="tagIntro(g.name)!.description!" />
          <OaOperation v-for="e in g.operations.filter((x) => !x.webhook)" :key="e.id" :entry="e" />
        </section>
        <section v-if="loaded.operations.some((e) => e.webhook)" class="oa-tag">
          <h2 class="oa-tag__title">{{ labels.webhooks }}</h2>
          <OaOperation v-for="e in loaded.operations.filter((x) => x.webhook)" :key="e.id" :entry="e" />
        </section>
        <section v-if="Object.keys(schemas).length" class="oa-tag">
          <h2 class="oa-tag__title">{{ labels.schemas }}</h2>
          <div v-for="(s, name) in schemas" :id="`schema/${name}`" :key="name" class="oa-model">
            <h3 class="oa-model__title">{{ name }}</h3>
            <UidMarkdown v-if="s.description" class="oa-md oa-md--small" :source="s.description" />
            <OaSchema :schema="s" />
          </div>
        </section>
      </main>
    </template>
  </div>
  </component>
</template>

<style src="./openapi.css"></style>
