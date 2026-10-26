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
 *
 * Scalar's anchors work too (`#{doc}/tag/{tag}/{METHOD}{path}`, `#model/…`),
 * and `#{anchor}?f={payload}` opens an operation with its try-it form filled
 * (see `../links/prefill` for the format); nothing is sent by itself.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { UidAlert, UidButton, UidDrawer, UidInput, UidLocaleProvider, UidMarkdown, UidSelect, UidSpinner } from '@dskripchenko/ui'
import { Download, KeyRound, Menu, Printer, Settings2 } from '@dskripchenko/ui/icons'
import { decodePrefill, pickSpec, resolveSection, splitLink } from '../links'
import type { LoadedSpec } from '../model'
import type { ResolverOptions } from '../model'
import type { SendFn } from '../request'
import { SNIPPET_TARGETS, type SnippetTarget } from '../snippets'
import type { SpecInput, SpecSource } from './context'
import type { OpenApiLabels } from './labels'
import { downloadSpec, downloadTypes } from './download'
import { printDocument } from './print'
import { currentServer } from './draft'
import OaAuth from './OaAuth.vue'
import OaIntro from './OaIntro.vue'
import OaServers from './OaServers.vue'
import OaOperation from './OaOperation.vue'
import OaSchema from './OaSchema.vue'
import { isLargeSpec } from './lazy'
import { buildSearchIndex, fold, type SearchHit, type SearchIndex } from './search'
import { useReferenceContext } from './useReferenceContext'

const props = withDefaults(
  defineProps<{
    /** The spec: YAML or JSON text, or a parsed object. Use `specs` for several. */
    spec?: SpecInput
    /** Several specs on one page, with a switcher. */
    specs?: SpecSource[]
    /** The id of the open spec (`v-model:active`); the first by default. */
    active?: string
    /**
     * Sends try-it requests; `fetch` from the page by default. Pass a proxy for
     * foreign APIs. The optional second argument carries the `signal` "Cancel" aborts.
     */
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
    /** The header's title; the open spec's own by default. */
    title?: string
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
    title: undefined,
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

const initialId = props.active ?? sources.value[0]?.id ?? SINGLE
watch(
  () => props.active,
  (id) => {
    if (id !== undefined && id !== activeId.value) void open(id)
  },
)

const reference = useReferenceContext(props, {
  sources: () => sources.value,
  initial: initialId,
  anchorPrefix: (id) => (multi.value ? `${id}/` : ''),
  onSwitch: (id) => {
    query.value = ''
    emit('update:active', id)
  },
  onLoaded: (spec, id) => emit('loaded', spec, id),
  onError: (error, id) => emit('error', error, id),
})
const { ctx, cache, loaded, loadError, loading, labels, kitLocale, load, open, activeId } = reference

const switcher = computed(() =>
  sources.value.map((s) => ({ value: s.id, label: s.name ?? cache.get(s.id)?.spec.document.info.title ?? s.id })),
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

/**
 * Opens a section by its local anchor (`operation/{id}`, `schema/{name}`) in
 * the open spec. `tryIt` lands on the operation's try-it panel instead.
 */
async function go(local: string, opts: { tryIt?: boolean } = {}): Promise<void> {
  const anchor = anchorOf(local)
  active.value = anchor
  await nextTick()
  const el = root.value?.querySelector<HTMLElement>(`[id="${CSS.escape(anchor)}"]`)
  if (!el) return
  const target = (): HTMLElement => (opts.tryIt ? el.querySelector<HTMLElement>('.oa-tryit') : null) ?? el
  target().scrollIntoView({ block: 'start' })
  // Operations render as they come near: the ones above the target grow and
  // push it down. Settle, then land on it again.
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await nextTick()
    target().scrollIntoView({ block: 'start' })
  }
  if (props.hashNavigation && typeof history !== 'undefined') {
    // The canonical anchor replaces an alias and drops a prefill payload, so
    // a reload does not fill the form again and credentials leave the address.
    const url = new URL(window.location.href)
    url.searchParams.delete('oa-f')
    url.hash = anchor
    history.replaceState(null, '', url.toString())
  }
}

/**
 * Opens what the address names: the spec (when there are several), then the
 * section — our anchors or Scalar's — and fills the form of a prefilled link.
 */
async function followHash(): Promise<void> {
  const { anchor, payload: inHash } = splitLink(window.location.hash)
  const payload = inHash ?? new URLSearchParams(window.location.search).get('oa-f') ?? undefined
  const { spec: id, rest } = pickSpec(anchor, multi.value ? sources.value : [])
  if (id !== undefined) {
    if (id !== activeId.value) await open(id)
    else await load(id)
  }
  if (!rest) return
  if (!loaded.value) await load(activeId.value)
  const spec = loaded.value
  if (!spec) return
  const local = resolveSection(rest, spec)
  if (!local) return
  const data = payload && local.startsWith('operation/') ? await decodePrefill(payload) : null
  if (data) {
    // The spec's own watchers (the server reset) run first.
    await nextTick()
    ctx.prefill.value = { anchor: anchorOf(local), data }
    await go(local, { tryIt: true })
  } else if (anchorOf(local) !== active.value) void go(local)
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

/* -------------------------------- the shell -------------------------------- */

const settingsOpen = ref(false)
const navOpen = ref(false)
const headerTitle = computed(() => props.title ?? loaded.value?.document.info.title ?? '')
const headerSummary = computed(() => {
  const info = loaded.value?.document.info
  const text = info?.summary ?? info?.description?.split(/\n\s*\n/)[0]?.replace(/[#*_`>\[\]]/g, '') ?? ''
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
})
/** The host the requests go to, for the settings button. */
const serverHost = computed(() => {
  if (!loaded.value) return ''
  const url = currentServer(ctx)
  try {
    return new URL(url, ctx.baseUrl.value).host
  } catch {
    return url
  }
})
const hasSchemes = computed(() => Object.keys(loaded.value?.document.components?.securitySchemes ?? {}).length > 0)
const signedIn = computed(() => Object.values(ctx.credentials).some((v) => (typeof v === 'string' ? v !== '' : !!v && !!(v as { username?: string }).username)))

/** Picking a section on a phone closes the navigation drawer. */
async function goFromNav(local: string): Promise<void> {
  navOpen.value = false
  await go(local)
}

/* Scroll spy: the navigation follows the section in view. */
let spy: IntersectionObserver | null = null
function watchSections(): void {
  spy?.disconnect()
  if (typeof IntersectionObserver === 'undefined' || !root.value) return
  const visible = new Map<string, number>()
  spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
        else visible.delete(e.target.id)
      }
      const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]?.[0]
      if (!top || top === active.value) return
      active.value = top
      const link = root.value?.querySelector<HTMLElement>(`.oa-nav [href="#${CSS.escape(top)}"]`)
      link?.scrollIntoView({ block: 'nearest' })
    },
    { rootMargin: '-15% 0px -70% 0px' },
  )
  for (const el of root.value.querySelectorAll<HTMLElement>('.oa-op[id], .oa-model[id]')) spy.observe(el)
}
watch(loaded, () => void nextTick(watchSections), { flush: 'post' })
onMounted(() => void nextTick(watchSections))
onBeforeUnmount(() => spy?.disconnect())

defineExpose({ go, open, spec: loaded, active: activeId })
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
  <div ref="root" class="oa-reference" :class="{ 'oa-reference--large': loaded && isLargeSpec(loaded) }">
    <!-- Shown here only while the navigation is not: loading or a failed spec. -->
    <div v-if="multi && (loading || loadError)" class="oa-switcher">
      <UidSelect size="sm" :options="switcher" :model-value="activeId" @update:model-value="(v: unknown) => open(String(v))" />
    </div>
    <div v-if="loading" class="oa-loading"><UidSpinner /></div>
    <UidAlert v-else-if="loadError" variant="danger" :title="labels.loadError">{{ loadError }}</UidAlert>
    <template v-else-if="loaded">
      <header class="oa-header" :class="{ 'oa-header--multi': multi }">
        <button type="button" class="oa-header__icon oa-header__menu" :aria-label="labels.operations" :aria-expanded="navOpen" @click="navOpen = !navOpen">
          <Menu :size="18" aria-hidden="true" />
        </button>
        <div class="oa-header__title" :title="headerSummary || headerTitle">
          <span class="oa-header__name">{{ headerTitle }}</span>
          <span class="oa-chip-static">{{ loaded.document.info.version }}</span>
          <span v-if="headerSummary" class="oa-header__summary">{{ headerSummary }}</span>
        </div>
        <div class="oa-header__find">
          <UidSelect
            v-if="multi"
            class="oa-header__specs oa-nav__specs"
            size="sm"
            searchable
            :options="switcher"
            :model-value="activeId"
            :aria-label="labels.specs"
            @update:model-value="(v: unknown) => open(String(v))"
          />
          <div class="oa-search oa-header__search">
            <UidInput
              :model-value="query"
              size="sm"
              type="search"
              :placeholder="searchPlaceholder"
              class="oa-header__search-input oa-nav__search"
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
        </div>
        <div class="oa-header__actions">
          <div class="oa-header__downloads" role="group" :aria-label="labels.downloadSpec">
            <button
              v-for="f in (['yaml', 'json'] as const)"
              :key="f"
              type="button"
              class="oa-header__download"
              :data-format="f"
              :title="`${labels.downloadSpec} (${f.toUpperCase()})`"
              @click="downloadSpec(loaded, f)"
            >
              <Download :size="14" aria-hidden="true" />{{ f.toUpperCase() }}
            </button>
            <button type="button" class="oa-header__download" data-format="ts" :title="labels.downloadTypes" @click="downloadTypes(loaded)">
              <Download :size="14" aria-hidden="true" />TS
            </button>
          </div>
          <button type="button" class="oa-header__settings" :aria-label="labels.settings" :aria-expanded="settingsOpen" @click="settingsOpen = true">
            <Settings2 :size="16" aria-hidden="true" />
            <span class="oa-header__host">{{ serverHost || labels.servers }}</span>
            <KeyRound v-if="hasSchemes" :size="15" class="oa-header__key" :class="{ 'is-on': signedIn }" aria-hidden="true" />
          </button>
          <slot name="actions" />
        </div>
      </header>

      <div class="oa-body">
        <div v-if="navOpen" class="oa-nav__overlay" @click="navOpen = false" />
        <nav class="oa-nav" :class="{ 'is-open': navOpen }" :aria-label="labels.operations">
        <div class="oa-nav__scroll">
          <div v-for="g in groups" :key="g.name" class="oa-nav__group">
            <div class="oa-nav__tag">{{ g.displayName }}</div>
            <a
              v-for="e in g.operations"
              :key="e.id"
              :href="`#${anchorOf(`operation/${e.id}`)}`"
              class="oa-nav__op"
              :class="{ 'is-active': active === anchorOf(`operation/${e.id}`), 'is-deprecated': e.deprecated }"
              @click.prevent="goFromNav(`operation/${e.id}`)"
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
              @click.prevent="goFromNav(`operation/${e.id}`)"
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
              @click.prevent="goFromNav(`schema/${n}`)"
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
      </div>

      <footer class="oa-footer">
        <span>{{ loaded.document.info.title }} · {{ loaded.document.info.version }}</span>
        <span>OpenAPI {{ loaded.source.version }}</span>
        <slot name="footer" />
      </footer>

      <UidDrawer v-model="settingsOpen" side="right" width="420px" :title="labels.settings">
        <div class="oa-settings">
          <section class="oa-settings__section">
            <h3 class="oa-settings__title">{{ labels.servers }}</h3>
            <OaServers />
          </section>
          <section v-if="hasSchemes" class="oa-settings__section">
            <h3 class="oa-settings__title">{{ labels.authentication }}</h3>
            <OaAuth embedded />
          </section>
          <section class="oa-settings__section oa-settings__downloads">
            <h3 class="oa-settings__title">{{ labels.downloadSpec }}</h3>
            <div class="oa-settings__row">
              <UidButton v-for="f in (['yaml', 'json'] as const)" :key="f" variant="secondary" size="sm" :icon="Download" :data-format="f" @click="downloadSpec(loaded, f)">{{ f.toUpperCase() }}</UidButton>
              <UidButton variant="secondary" size="sm" :icon="Download" data-format="ts" :title="labels.downloadTypes" @click="downloadTypes(loaded)">TS</UidButton>
            </div>
          </section>
          <section class="oa-settings__section oa-settings__print">
            <UidButton variant="secondary" size="sm" :icon="Printer" @click="printDocument(ctx)">{{ labels.printDocument }}</UidButton>
          </section>
        </div>
      </UidDrawer>
    </template>
  </div>
  </component>
</template>

<style src="./openapi.css"></style>
