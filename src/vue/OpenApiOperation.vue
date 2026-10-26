<script setup lang="ts">
/**
 * OpenApiOperation — one operation of a spec, embedded in a documentation
 * page: a compact card with the method, path and summary, a small toolbar
 * (server and credentials, print to PDF, a link to the full reference), and
 * the operation as the reference shows it — parameters, body, responses,
 * samples and try-it. No header, navigation or footer.
 *
 * `operation` names it by operationId, `METHOD /path`, or an anchor (ours or
 * Scalar's). Several embeds of the same spec input — the same text, object
 * or loader function — load it once.
 */
import { computed, ref } from 'vue'
import { UidAlert, UidButton, UidDrawer, UidLocaleProvider, UidSpinner } from '@dskripchenko/ui'
import { ExternalLink, KeyRound, Printer, Settings2 } from 'lucide-vue-next'
import type { LoadedSpec, ResolverOptions } from '../model'
import type { SendFn } from '../request'
import { SNIPPET_TARGETS, type SnippetTarget } from '../snippets'
import type { SpecInput } from './context'
import { currentServer } from './draft'
import { findOperation, sharedSpec } from './embed'
import type { OpenApiLabels } from './labels'
import OaAuth from './OaAuth.vue'
import OaOperation from './OaOperation.vue'
import OaServers from './OaServers.vue'
import { printOperation } from './print'
import { useReferenceContext } from './useReferenceContext'

const props = withDefaults(
  defineProps<{
    /** The spec: YAML or JSON text, a parsed object, or a loader of either. */
    spec: SpecInput
    /** operationId, `METHOD /path`, or an anchor such as `operation/{id}` or Scalar's `tag/{tag}/{METHOD}{path}`. */
    operation: string
    /**
     * The full reference's address. Set, the card links to the operation
     * there: this URL, `#`, the canonical anchor (`{specId}/` in front when
     * `specId` is given).
     */
    referenceUrl?: string
    /**
     * The spec's id in that reference (its `specs` id, the standalone `slug`).
     * Also keys the kept credentials, so an embed and the reference share them.
     */
    specId?: string
    send?: SendFn
    tryIt?: boolean
    locale?: string
    labels?: Partial<OpenApiLabels>
    snippetTargets?: SnippetTarget[]
    defaultSnippet?: SnippetTarget
    baseUrl?: string
    external?: ResolverOptions['external']
    persistCredentials?: boolean | 'session' | 'local'
    oauthRedirectUrl?: string
  }>(),
  {
    referenceUrl: undefined,
    specId: undefined,
    send: undefined,
    tryIt: true,
    locale: undefined,
    labels: () => ({}),
    snippetTargets: () => SNIPPET_TARGETS.map((t) => t.id),
    defaultSnippet: 'curl',
    baseUrl: undefined,
    external: undefined,
    persistCredentials: false,
    oauthRedirectUrl: undefined,
  },
)

const emit = defineEmits<{
  loaded: [spec: LoadedSpec]
  error: [error: Error]
}>()

const id = computed(() => props.specId ?? 'spec')
const sources = computed(() => [{ id: id.value, spec: props.spec }])
const { ctx, loaded, loading, loadError, labels, kitLocale } = useReferenceContext(props, {
  sources: () => sources.value,
  initial: id.value,
  // The embed's sections carry no ids: a page may hold several, or a reference too.
  anchorPrefix: () => (props.specId ? `${props.specId}/` : ''),
  obtain: sharedSpec,
  onLoaded: (spec) => emit('loaded', spec),
  onError: (error) => emit('error', error),
})

const entry = computed(() => (loaded.value ? findOperation(loaded.value, props.operation) : undefined))
const anchor = computed(() => (entry.value ? `${ctx.anchorPrefix.value}operation/${entry.value.id}` : ''))
const referenceLink = computed(() => (props.referenceUrl && entry.value ? `${props.referenceUrl.split('#')[0]}#${anchor.value}` : undefined))

const settingsOpen = ref(false)
const hasSchemes = computed(() => Object.keys(loaded.value?.document.components?.securitySchemes ?? {}).length > 0)
const signedIn = computed(() => Object.values(ctx.credentials).some((v) => (typeof v === 'string' ? v !== '' : !!v && !!(v as { username?: string }).username)))
const serverHost = computed(() => {
  if (!loaded.value || !entry.value) return ''
  const url = currentServer(ctx, entry.value)
  try {
    return new URL(url, ctx.baseUrl.value).host
  } catch {
    return url
  }
})

function print(): void {
  if (!entry.value) return
  // Paper needs the full address, not one relative to this page.
  const url = referenceLink.value ? new URL(referenceLink.value, window.location.href).href : undefined
  void printOperation(entry.value, ctx, url ? { url } : {})
}

defineExpose({ spec: loaded, entry, print })
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
    <div class="oa-reference oa-embed">
      <div v-if="loading" class="oa-loading"><UidSpinner /></div>
      <UidAlert v-else-if="loadError" variant="danger" :title="labels.loadError">{{ loadError }}</UidAlert>
      <UidAlert v-else-if="loaded && !entry" variant="warning" :title="labels.operationNotFound">
        <code>{{ operation }}</code>
      </UidAlert>
      <article v-else-if="loaded && entry" class="oa-embed__card" :class="{ 'oa-op--deprecated': entry.deprecated }" :data-operation="entry.id">
        <header class="oa-embed__head">
          <div class="oa-embed__heading">
            <div class="oa-op__line">
              <span class="oa-method" :class="`oa-method--${entry.method}`">{{ entry.method.toUpperCase() }}</span>
              <code class="oa-op__path">{{ entry.path }}</code>
              <span v-if="entry.deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
            </div>
            <h3 v-if="entry.operation.summary" class="oa-embed__title">{{ entry.operation.summary }}</h3>
          </div>
          <div class="oa-embed__tools">
            <button
              type="button"
              class="oa-header__settings oa-embed__settings"
              :aria-label="labels.settings"
              :title="labels.settings"
              :aria-expanded="settingsOpen"
              @click="settingsOpen = true"
            >
              <Settings2 :size="15" aria-hidden="true" />
              <span class="oa-header__host">{{ serverHost || labels.servers }}</span>
              <KeyRound v-if="hasSchemes" :size="14" class="oa-header__key" :class="{ 'is-on': signedIn }" aria-hidden="true" />
            </button>
            <UidButton class="oa-embed__pdf" variant="ghost" size="sm" :icon="Printer" :title="labels.printOperation" @click="print">{{ labels.pdf }}</UidButton>
            <a v-if="referenceLink" class="oa-embed__ref" :href="referenceLink">
              {{ labels.openInReference }}<ExternalLink :size="13" aria-hidden="true" />
            </a>
          </div>
        </header>
        <OaOperation :entry="entry" :anchored="false" compact />
      </article>

      <UidDrawer v-if="loaded" v-model="settingsOpen" side="right" width="420px" :title="labels.settings">
        <div class="oa-settings">
          <section class="oa-settings__section">
            <h3 class="oa-settings__title">{{ labels.servers }}</h3>
            <OaServers />
          </section>
          <section v-if="hasSchemes" class="oa-settings__section">
            <h3 class="oa-settings__title">{{ labels.authentication }}</h3>
            <OaAuth embedded />
          </section>
        </div>
      </UidDrawer>
    </div>
  </component>
</template>

<style src="./openapi.css"></style>
