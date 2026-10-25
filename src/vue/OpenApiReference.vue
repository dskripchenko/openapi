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
import { buildSearchIndex, fold, type SearchHit, type SearchIndex } from './search'

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

async function open(id: string): Promise<void> {
  if (!sources.value.some((s) => s.id === id)) return
  savedCredentials.set(activeId.value, { ...ctx.credentials })
  for (const k of Object.keys(ctx.credentials)) delete ctx.credentials[k]
  Object.assign(ctx.credentials, savedCredentials.get(id) ?? {})
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
}
provide(referenceKey, ctx)
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

/*
 * Search: one index per loaded spec, built on the first query. It covers the
 * open spec only; the navigation below keeps what matches, and a list under
 * the input shows the best hits.
 */
const indexes = new WeakMap<LoadedSpec, SearchIndex>()
function searchIndex(spec: LoadedSpec): SearchIndex {
  let index = indexes.get(spec)
  if (!index) indexes.set(spec, (index = buildSearchIndex(spec)))
  return index
}
const matched = computed(() => (loaded.value && query.value.trim() ? searchIndex(loaded.value).matches(query.value) : null))
const shown = (key: string): boolean => !matched.value || matched.value.has(key)

const groups = computed(() => {
  const spec = loaded.value
  if (!spec) return []
  return spec.groups
    .map((g) => ({ ...g, operations: g.operations.filter((e) => !e.webhook && shown(`operation/${e.id}`)) }))
    .filter((g) => g.operations.length)
})
const webhooks = computed(() => (loaded.value?.operations ?? []).filter((e) => e.webhook && shown(`operation/${e.id}`)))
const schemaNames = computed(() => Object.keys(loaded.value?.document.components?.schemas ?? {}).filter((n) => shown(`schema/${n}`)))

const hits = computed<SearchHit[]>(() => (loaded.value && query.value.trim() ? searchIndex(loaded.value).search(query.value, 50) : []))
const resultsOpen = ref(false)
const cursor = ref(0)
const searchId = `oa-search-${Math.random().toString(36).slice(2, 10)}`
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
const searchPlaceholder = computed(() => `${labels.value.search}   /  ${isMac ? '⌘K' : 'Ctrl+K'}`)
const kindLabel = (h: SearchHit): string =>
  h.entry.kind === 'tag' ? labels.value.tag : h.entry.kind === 'schema' ? labels.value.schema : labels.value.section

function onQuery(value: string): void {
  query.value = value
  cursor.value = 0
  resultsOpen.value = true
}

/** Opens a hit: a section by its anchor, or a heading of the description. */
async function pick(hit: SearchHit | undefined): Promise<void> {
  if (!hit) return
  resultsOpen.value = false
  if (hit.entry.kind !== 'heading') return go(hit.entry.key)
  const wanted = fold(hit.entry.title)
  const heading = [...(root.value?.querySelectorAll<HTMLElement>('.oa-intro h1, .oa-intro h2, .oa-intro h3, .oa-intro h4, .oa-intro h5, .oa-intro h6') ?? [])].find(
    (h) => fold(h.textContent ?? '').trim() === wanted,
  )
  heading?.scrollIntoView({ block: 'start' })
}

async function moveCursor(step: number): Promise<void> {
  if (!hits.value.length) return
  resultsOpen.value = true
  cursor.value = (cursor.value + step + hits.value.length) % hits.value.length
  await nextTick()
  root.value?.querySelector(`#${searchId}-${cursor.value}`)?.scrollIntoView({ block: 'nearest' })
}

function onSearchKey(ev: KeyboardEvent): void {
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault()
    void moveCursor(ev.key === 'ArrowDown' ? 1 : -1)
  } else if (ev.key === 'Enter') {
    if (!resultsOpen.value || !hits.value.length) return
    ev.preventDefault()
    void pick(hits.value[cursor.value])
  } else if (ev.key === 'Escape') {
    if (resultsOpen.value && query.value) resultsOpen.value = false
    else query.value = ''
  }
}

/** `/` (outside text fields) and Ctrl/Cmd+K put the cursor into the search. */
function onGlobalKey(ev: KeyboardEvent): void {
  const target = ev.target as HTMLElement | null
  const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  const combo = (ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'k'
  const slash = ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey
  if (!combo && !slash) return
  const input = root.value?.querySelector<HTMLInputElement>('.oa-nav__search input')
  // A reference that is not on screen (a hidden editor preview) leaves the keys alone.
  if (!input || !input.getClientRects().length) return
  ev.preventDefault()
  input.focus()
  input.select()
}
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
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('keydown', onGlobalKey)
})

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
        <div class="oa-search">
          <UidInput
            :model-value="query"
            size="sm"
            type="search"
            :placeholder="searchPlaceholder"
            class="oa-nav__search"
            role="combobox"
            autocomplete="off"
            :aria-label="labels.search"
            aria-autocomplete="list"
            :aria-expanded="resultsOpen && !!query.trim()"
            :aria-controls="`${searchId}-list`"
            :aria-activedescendant="resultsOpen && hits.length ? `${searchId}-${cursor}` : undefined"
            @update:model-value="onQuery"
            @keydown="onSearchKey"
            @focus="resultsOpen = true"
            @blur="resultsOpen = false"
          />
          <div
            v-if="resultsOpen && query.trim()"
            :id="`${searchId}-list`"
            class="oa-search__results"
            role="listbox"
            :aria-label="labels.searchResults"
            @mousedown.prevent
          >
            <div
              v-for="(h, i) in hits"
              :id="`${searchId}-${i}`"
              :key="h.entry.key"
              role="option"
              class="oa-search__hit"
              :class="{ 'is-cursor': i === cursor }"
              :aria-selected="i === cursor"
              @mouseenter="cursor = i"
              @click="pick(h)"
            >
              <div class="oa-search__line">
                <span v-if="h.entry.method" class="oa-method oa-method--small" :class="`oa-method--${h.entry.method}`">{{ h.entry.method === 'delete' ? 'DEL' : h.entry.method.toUpperCase() }}</span>
                <span v-else class="oa-search__kind">{{ kindLabel(h) }}</span>
                <span class="oa-search__title"><template v-for="(s, j) in h.title" :key="j"><mark v-if="s.mark">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template></span>
              </div>
              <code v-if="h.entry.path && h.entry.path !== h.entry.title" class="oa-search__path">{{ h.entry.path }}</code>
              <div v-if="h.snippet" class="oa-search__snippet"><template v-for="(s, j) in h.snippet" :key="j"><mark v-if="s.mark">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template></div>
            </div>
            <p v-if="!hits.length" class="oa-nav__empty">{{ labels.noResults }}</p>
          </div>
        </div>
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
