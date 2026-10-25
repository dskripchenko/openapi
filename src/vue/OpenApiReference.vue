<script setup lang="ts">
/**
 * OpenApiReference — an API reference for a Swagger 2.0 / OpenAPI 3.x spec.
 *
 * Give it the spec as YAML/JSON text or an object. The page lists operations
 * by tag with a search, documents each one (parameters, body, responses as
 * schema trees, examples), prints the request in 13 languages and sends it
 * from "Try it". Deep links: `#operation/{id}` and `#schema/{name}`.
 *
 * Several specs — APIs or versions — go in `specs`: a switcher above the
 * navigation picks one, each loads when first opened (text, object or an
 * async loader), and deep links carry its id: `#{id}/operation/{op}`.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import { UidAlert, UidInput, UidLocaleProvider, UidMarkdown, UidSelect, UidSpinner, en as uidEn, ru as uidRu } from '@dskripchenko/ui'
import { loadSpec } from '../load'
import type { LoadedSpec } from '../model'
import type { ResolverOptions } from '../model'
import { sendRequest, type SendFn } from '../request'
import { SNIPPET_TARGETS, type SnippetTarget } from '../snippets'
import { referenceKey, type ReferenceContext, type SpecInput, type SpecSource } from './context'
import { LOCALES, en, type OpenApiLabels } from './labels'
import OaIntro from './OaIntro.vue'
import OaOperation from './OaOperation.vue'
import OaSchema from './OaSchema.vue'
import { relayOAuthCallback } from './oauthPopup'
import { credentialsKey, persistMode, usePersistedCredentials } from './persist'

const props = withDefaults(
  defineProps<{
    /** The spec: YAML or JSON text, or a parsed object. Use `specs` for several. */
    spec?: SpecInput
    /** Several specs on one page, with a switcher. */
    specs?: SpecSource[]
    /** The id of the open spec (`v-model:active`); the first by default. */
    active?: string
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
    /**
     * Keeps API keys and tokens between visits, per spec: `'session'` (or
     * `true`) in sessionStorage, `'local'` in localStorage. Off by default.
     */
    persistCredentials?: boolean | 'session' | 'local'
    /** The OAuth redirect URI the identity provider allows; the page URL without query and fragment by default. */
    oauthRedirectUrl?: string
  }>(),
  {
    spec: undefined,
    specs: undefined,
    active: undefined,
    send: undefined,
    tryIt: true,
    locale: undefined,
    labels: () => ({}),
    snippetTargets: () => SNIPPET_TARGETS.map((t) => t.id),
    defaultSnippet: 'curl',
    baseUrl: undefined,
    external: undefined,
    hashNavigation: true,
    persistCredentials: false,
    oauthRedirectUrl: undefined,
  },
)

const emit = defineEmits<{
  loaded: [spec: LoadedSpec, id: string]
  error: [error: Error, id: string]
  'update:active': [id: string]
}>()

/* ------------------------------ the specs ------------------------------- */

const SINGLE = 'spec'
const sources = computed<SpecSource[]>(() => props.specs ?? (props.spec !== undefined ? [{ id: SINGLE, spec: props.spec }] : []))
const multi = computed(() => !!props.specs && props.specs.length > 1)

const activeId = ref<string>(props.active ?? sources.value[0]?.id ?? SINGLE)
watch(
  () => props.active,
  (id) => {
    if (id !== undefined && id !== activeId.value) void open(id)
  },
)

/** Loaded specs by id, kept while their source stays the same. */
const cache = new Map<string, { input: SpecInput; spec: LoadedSpec }>()
const loaded = shallowRef<LoadedSpec | null>(null)
const loadError = ref<string | null>(null)
const loading = ref(false)
let ticket = 0

async function load(id: string): Promise<void> {
  const source = sources.value.find((s) => s.id === id)
  const my = ++ticket
  if (!source) {
    loaded.value = null
    return
  }
  const hit = cache.get(id)
  // A loader is matched by the spec's id: an inline `specs` array makes new
  // functions on every render, and they must not fetch again.
  const same = hit && (hit.input === source.spec || (typeof hit.input === 'function' && typeof source.spec === 'function'))
  if (hit && same) {
    loaded.value = hit.spec
    loadError.value = null
    return
  }
  try {
    let input: string | object = source.spec as string | object
    if (typeof source.spec === 'function') {
      loading.value = true
      input = await (source.spec as () => Promise<string | object>)()
      if (my !== ticket) return
    }
    const spec = loadSpec(input, props.external ? { external: props.external } : {})
    cache.set(id, { input: source.spec, spec })
    loaded.value = spec
    loadError.value = null
    emit('loaded', spec, id)
  } catch (error) {
    if (my !== ticket) return
    loaded.value = null
    loadError.value = error instanceof Error ? error.message : String(error)
    emit('error', error instanceof Error ? error : new Error(String(error)), id)
  } finally {
    if (my === ticket) loading.value = false
  }
}

/** Credentials typed per spec, kept across switches. */
const savedCredentials = new Map<string, Record<string, unknown>>()
const savedExpiry = new Map<string, Record<string, number>>()

async function open(id: string): Promise<void> {
  if (!sources.value.some((s) => s.id === id)) return
  savedCredentials.set(activeId.value, { ...ctx.credentials })
  for (const k of Object.keys(ctx.credentials)) delete ctx.credentials[k]
  Object.assign(ctx.credentials, savedCredentials.get(id) ?? {})
  savedExpiry.set(activeId.value, { ...ctx.tokenExpiry })
  for (const k of Object.keys(ctx.tokenExpiry)) delete ctx.tokenExpiry[k]
  Object.assign(ctx.tokenExpiry, savedExpiry.get(id) ?? {})
  activeId.value = id
  query.value = ''
  emit('update:active', id)
  await load(id)
}

watch(
  () => [sources.value, props.external],
  () => {
    if (props.external) cache.clear()
    if (!sources.value.some((s) => s.id === activeId.value)) activeId.value = sources.value[0]?.id ?? SINGLE
    void load(activeId.value)
  },
)

const switcher = computed(() =>
  sources.value.map((s) => ({ value: s.id, label: s.name ?? cache.get(s.id)?.spec.document.info.title ?? s.id })),
)

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
  anchorPrefix: computed(() => (multi.value ? `${activeId.value}/` : '')),
  tokenExpiry: reactive({}),
  oauthRedirectUrl: computed(() => props.oauthRedirectUrl),
  persistence: computed(() => persistMode(props.persistCredentials)),
  forgetCredentials: () => persisted.forget(),
}
provide(referenceKey, ctx)
// The key exists once the open spec has loaded (not while a switch is still loading it).
const persisted = usePersistedCredentials(
  ctx,
  () => ctx.persistence.value,
  () => {
    const spec = loaded.value
    return spec && cache.get(activeId.value)?.spec === spec ? credentialsKey(activeId.value, spec.document.info.title) : null
  },
)
// Loaded in a sign-in popup and redirected back: hand the result to the opener.
onMounted(relayOAuthCallback)
void load(activeId.value)

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
/** The element id of a section: prefixed with the spec's id when there are several. */
const anchorOf = (local: string): string => ctx.anchorPrefix.value + local

/** Opens a section by its local anchor (`operation/{id}`, `schema/{name}`) in the open spec. */
async function go(local: string): Promise<void> {
  const anchor = anchorOf(local)
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

/** Opens what the address names: the spec (when there are several), then the section. */
async function followHash(): Promise<void> {
  let hash = decodeURIComponent(window.location.hash.slice(1))
  if (multi.value) {
    const slash = hash.indexOf('/')
    const id = slash === -1 ? hash : hash.slice(0, slash)
    if (sources.value.some((s) => s.id === id)) {
      if (id !== activeId.value) await open(id)
      else await load(id)
      hash = slash === -1 ? '' : hash.slice(slash + 1)
    }
  }
  if (hash.startsWith('operation/') || hash.startsWith('schema/') || hash.startsWith('tag/')) {
    if (!loaded.value) await load(activeId.value)
    if (anchorOf(hash) !== active.value) void go(hash)
  }
}
const onHashChange = (): void => void followHash()
onMounted(() => {
  void followHash()
  window.addEventListener('hashchange', onHashChange)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))

const schemas = computed(() => loaded.value?.document.components?.schemas ?? {})

/** An operation under several tags is shown under each; only its first copy carries the anchor. */
const firstGroupOf = computed(() => {
  const first = new Map<string, string>()
  for (const g of loaded.value?.groups ?? []) for (const e of g.operations) if (!first.has(e.id)) first.set(e.id, g.name)
  return first
})
const tagIntro = (name: string) => loaded.value?.groups.find((g) => g.name === name)

defineExpose({ go, open, spec: loaded, active: activeId })
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
  <div ref="root" class="oa-reference">
    <!-- Shown here only while the navigation is not: loading or a failed spec. -->
    <div v-if="multi && (loading || loadError)" class="oa-switcher">
      <UidSelect size="sm" :options="switcher" :model-value="activeId" @update:model-value="(v: unknown) => open(String(v))" />
    </div>
    <div v-if="loading" class="oa-loading"><UidSpinner /></div>
    <UidAlert v-else-if="loadError" variant="danger" :title="labels.loadError">{{ loadError }}</UidAlert>
    <template v-else-if="loaded">
      <nav class="oa-nav" :aria-label="labels.operations">
        <UidSelect
          v-if="multi"
          class="oa-nav__specs"
          size="sm"
          searchable
          :options="switcher"
          :model-value="activeId"
          :aria-label="labels.specs"
          @update:model-value="(v: unknown) => open(String(v))"
        />
        <UidInput v-model="query" size="sm" type="search" :placeholder="labels.search" class="oa-nav__search" />
        <div class="oa-nav__scroll">
          <div v-for="g in groups" :key="g.name" class="oa-nav__group">
            <div class="oa-nav__tag">{{ g.displayName }}</div>
            <a
              v-for="e in g.operations"
              :key="e.id"
              :href="`#${anchorOf(`operation/${e.id}`)}`"
              class="oa-nav__op"
              :class="{ 'is-active': active === anchorOf(`operation/${e.id}`), 'is-deprecated': e.deprecated }"
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
              :href="`#${anchorOf(`operation/${e.id}`)}`"
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
              :href="`#${anchorOf(`schema/${n}`)}`"
              class="oa-nav__op"
              :class="{ 'is-active': active === anchorOf(`schema/${n}`) }"
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
          <h2 :id="anchorOf(`tag/${g.name}`)" class="oa-tag__title">{{ g.displayName }}</h2>
          <UidMarkdown v-if="tagIntro(g.name)?.description" class="oa-md" :source="tagIntro(g.name)!.description!" />
          <OaOperation
            v-for="e in g.operations.filter((x) => !x.webhook)"
            :key="e.id"
            :entry="e"
            :anchored="firstGroupOf.get(e.id) === g.name"
          />
        </section>
        <section v-if="loaded.operations.some((e) => e.webhook)" class="oa-tag">
          <h2 class="oa-tag__title">{{ labels.webhooks }}</h2>
          <OaOperation v-for="e in loaded.operations.filter((x) => x.webhook)" :key="e.id" :entry="e" />
        </section>
        <section v-if="Object.keys(schemas).length" class="oa-tag">
          <h2 class="oa-tag__title">{{ labels.schemas }}</h2>
          <div v-for="(s, name) in schemas" :id="anchorOf(`schema/${name}`)" :key="name" class="oa-model">
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
