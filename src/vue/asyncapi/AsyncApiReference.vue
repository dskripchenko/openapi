<script setup lang="ts">
/**
 * An AsyncAPI 2.x / 3.0 document as a reference page: servers, operations
 * grouped by tag (or channel), each with its channel, parameters, messages
 * and reply; then the messages and schemas of the components. Schemas are
 * shown with the same component as the OpenAPI reference.
 */
import { computed, provide, reactive, ref, shallowRef } from 'vue'
import { en as uidEn, ru as uidRu, UidAlert, UidLocaleProvider, UidMarkdown } from '@dskripchenko/ui'
import { Download, Menu } from 'lucide-vue-next'
import { groupAsyncOperations, loadAsyncApi, type AsyncApiSpec, type AsyncOperation } from '../../asyncapi'
import type { Schema } from '../../core/types'
import { stringifySpec } from '../../load'
import type { LoadedSpec, ResolverOptions } from '../../model'
import type { SendFn } from '../../request'
import { referenceKey, type ReferenceContext } from '../context'
import { LOCALES, en, type OpenApiLabels } from '../labels'
import { resolveLocale } from '../page'
import OaSchema from '../OaSchema.vue'
import OaCodeBlock from '../OaCodeBlock.vue'
import AsyncApiMessage from './AsyncApiMessage.vue'
import { ASYNC_LOCALES, asyncEn, type AsyncApiLabels } from './labels'

const props = withDefaults(
  defineProps<{
    /** The document: YAML or JSON text, or a parsed object. */
    spec: string | object
    locale?: string
    labels?: Partial<AsyncApiLabels>
    /** Loads documents that `$ref`s point to by URL. */
    external?: ResolverOptions['external']
  }>(),
  { locale: undefined, labels: undefined, external: undefined },
)

const lang = computed(() => resolveLocale(props.locale))
const L = computed<AsyncApiLabels>(() => ({ ...(ASYNC_LOCALES[lang.value] ?? asyncEn), ...props.labels }))
const oaLabels = computed<OpenApiLabels>(() => LOCALES[lang.value] ?? en)
/** The kit's locale when `locale` is set; otherwise the host's UidLocaleProvider is in charge. */
const kitLocale = computed(() => (props.locale === 'ru' ? uidRu : props.locale === 'en' ? uidEn : undefined))

const result = computed<{ spec?: AsyncApiSpec; error?: string }>(() => {
  try {
    return { spec: loadAsyncApi(props.spec, props.external ? { external: props.external } : {}) }
  } catch (e) {
    return { error: (e as Error).message }
  }
})
const spec = computed(() => result.value.spec)
const groups = computed(() => (spec.value ? groupAsyncOperations(spec.value) : []))
const schemas = computed(() => {
  const s = spec.value
  const all = ((s?.raw.components as Record<string, unknown> | undefined)?.schemas ?? {}) as Record<string, Schema>
  return Object.entries(all)
})

// The schema and code components read their strings and the resolver from
// the reference context; an AsyncAPI page has no requests, servers to pick
// or credentials, so those parts stay empty.
const loadedLike = computed(
  () =>
    ({
      source: { family: 'openapi31', version: spec.value?.version ?? '', raw: spec.value?.raw },
      document: { openapi: '3.1.0', info: spec.value?.info ?? { title: '', version: '' }, paths: {} },
      resolver: spec.value?.resolver ?? { get: () => undefined, deref: () => undefined, isCircular: () => false },
      operations: [],
      groups: [],
      warnings: [],
    }) as unknown as LoadedSpec,
)
const noRequests: SendFn = async () => {
  throw new Error('AsyncAPI pages send no requests')
}
const ctx: ReferenceContext = {
  spec: loadedLike,
  labels: oaLabels,
  server: reactive({ index: 0, custom: '', variables: {} }),
  credentials: reactive({}),
  snippetTarget: ref('curl'),
  snippetTargets: ref([]),
  send: ref(noRequests),
  tryIt: ref(false),
  baseUrl: ref(undefined),
  anchorPrefix: ref(''),
  prefill: shallowRef(null),
  tokenExpiry: reactive({}),
  oauthRedirectUrl: ref(undefined),
  persistence: ref(null),
  forgetCredentials: () => {},
}
provide(referenceKey, ctx)

const navOpen = ref(false)
const channelOf = (o: AsyncOperation) => spec.value?.channels.find((c) => c.id === o.channel)

/** An address split into text and `{parameter}` parts. */
function addressParts(address: string | null | undefined): { text: string; param: boolean }[] {
  if (!address) return []
  return address.split(/(\{[^}]+\})/).filter(Boolean).map((text) => ({ text, param: /^\{[^}]+\}$/.test(text) }))
}

function go(anchor: string): void {
  navOpen.value = false
  if (typeof document === 'undefined') return
  document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function download(format: 'yaml' | 'json'): void {
  const s = spec.value
  if (!s || typeof document === 'undefined') return
  const url = URL.createObjectURL(new Blob([stringifySpec(s.raw, format)], { type: format === 'json' ? 'application/json' : 'application/yaml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${(s.info.title || 'asyncapi').replace(/[\\/:*?"<>|]+/g, '_')}.${format}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const json = (v: unknown) => JSON.stringify(v, null, 2)
const anchorOp = (id: string) => `operation/${id}`
const anchorMessage = (key: string) => `message/${key}`
const anchorSchema = (name: string) => `schema/${name}`
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
  <div class="oa-reference oa-async">
    <UidAlert v-if="result.error" variant="danger" :title="L.loadError">{{ result.error }}</UidAlert>
    <template v-else-if="spec">
      <header class="oa-header">
        <button type="button" class="oa-header__icon oa-header__menu" :aria-label="L.operations" :aria-expanded="navOpen" @click="navOpen = !navOpen">
          <Menu :size="18" aria-hidden="true" />
        </button>
        <div class="oa-header__title">
          <span class="oa-header__name">{{ spec.info.title }}</span>
          <span class="oa-chip-static">{{ spec.info.version }}</span>
          <span class="oa-header__summary">AsyncAPI {{ spec.version }}</span>
        </div>
        <div class="oa-header__actions">
          <div class="oa-header__downloads" role="group" :aria-label="L.downloadSpec">
            <button v-for="f in (['yaml', 'json'] as const)" :key="f" type="button" class="oa-header__download" :data-format="f" :title="`${L.downloadSpec} (${f.toUpperCase()})`" @click="download(f)">
              <Download :size="14" aria-hidden="true" />{{ f.toUpperCase() }}
            </button>
          </div>
          <slot name="actions" />
        </div>
      </header>

      <div class="oa-body">
        <div v-if="navOpen" class="oa-nav__overlay" @click="navOpen = false" />
        <nav class="oa-nav" :class="{ 'is-open': navOpen }" :aria-label="L.operations">
          <div class="oa-nav__scroll">
            <div v-for="g in groups" :key="g.name" class="oa-nav__group">
              <div v-if="g.name" class="oa-nav__tag">{{ g.name }}</div>
              <a v-for="o in g.operations" :key="o.id" :href="`#${anchorOp(o.id)}`" class="oa-nav__op" :class="{ 'is-deprecated': o.deprecated }" @click.prevent="go(anchorOp(o.id))">
                <span class="oa-method oa-method--small oa-action" :class="`oa-action--${o.action}`">{{ o.action === 'send' ? 'SEND' : 'RECV' }}</span>
                <span class="oa-nav__label">{{ o.title || o.summary || o.id }}</span>
              </a>
            </div>
            <div v-if="spec.messages.length" class="oa-nav__group">
              <div class="oa-nav__tag">{{ L.messages }}</div>
              <a v-for="m in spec.messages" :key="m.key" :href="`#${anchorMessage(m.key)}`" class="oa-nav__op" @click.prevent="go(anchorMessage(m.key))">
                <span class="oa-nav__label">{{ m.title || m.name || m.key }}</span>
              </a>
            </div>
            <div v-if="schemas.length" class="oa-nav__group">
              <div class="oa-nav__tag">{{ L.schemas }}</div>
              <a v-for="[name] in schemas" :key="name" :href="`#${anchorSchema(name)}`" class="oa-nav__op" @click.prevent="go(anchorSchema(name))">
                <span class="oa-nav__label">{{ name }}</span>
              </a>
            </div>
          </div>
        </nav>

        <main class="oa-main">
          <section class="oa-intro">
            <UidMarkdown v-if="spec.info.description" class="oa-md" :source="spec.info.description" />
            <div v-if="spec.servers.length" class="oa-block">
              <h4 class="oa-block__title">{{ L.servers }}</h4>
              <div v-for="s in spec.servers" :key="s.id" class="oa-param oa-async-server" :data-server="s.id">
                <div class="oa-schema__row">
                  <code class="oa-schema__name">{{ s.id }}</code>
                  <span class="oa-chip-static">{{ s.protocol }}<template v-if="s.protocolVersion"> {{ s.protocolVersion }}</template></span>
                  <code class="oa-async__address">{{ s.url }}</code>
                </div>
                <UidMarkdown v-if="s.description" class="oa-md oa-md--small" :source="s.description" />
                <div v-for="v in s.variables" :key="v.name" class="oa-schema__enum">
                  <span class="oa-schema__label">{{ v.name }}:</span>
                  <code v-for="e in v.enum ?? (v.default !== undefined ? [v.default] : [])" :key="e">{{ e }}</code>
                </div>
              </div>
            </div>
          </section>

          <p v-if="!spec.operations.length" class="oa-nav__empty">{{ L.noOperations }}</p>

          <section v-for="g in groups" :key="g.name" class="oa-tag">
            <h2 v-if="g.name" class="oa-tag__title">{{ g.name }}</h2>
            <UidMarkdown v-if="spec.tags.find((t) => t.name === g.name)?.description" class="oa-md" :source="spec.tags.find((t) => t.name === g.name)!.description!" />
            <section v-for="o in g.operations" :id="anchorOp(o.id)" :key="o.id" class="oa-op oa-async-op" :class="{ 'oa-op--deprecated': o.deprecated }" :data-operation="o.id">
              <header class="oa-op__head">
                <div class="oa-op__titlebar">
                  <h3 class="oa-op__title">{{ o.title || o.summary || o.id }}</h3>
                </div>
                <div class="oa-op__line">
                  <span class="oa-method oa-action" :class="`oa-action--${o.action}`">{{ o.action === 'send' ? L.send : L.receive }}</span>
                  <code class="oa-op__path">
                    <template v-for="(p, i) in addressParts(channelOf(o)?.address ?? o.channel)" :key="i"><span v-if="p.param" class="oa-async__param">{{ p.text }}</span><template v-else>{{ p.text }}</template></template>
                  </code>
                  <span v-if="o.deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ L.deprecated }}</span>
                </div>
              </header>
              <div class="oa-async-op__body">
                <p v-if="o.title && o.summary" class="oa-async__summary">{{ o.summary }}</p>
                <UidMarkdown v-if="o.description" class="oa-md" :source="o.description" />
                <UidMarkdown v-if="channelOf(o)?.description" class="oa-md oa-md--small" :source="channelOf(o)!.description!" />
                <div v-if="channelOf(o)?.parameters.length" class="oa-block">
                  <h4 class="oa-block__title">{{ L.parameters }}</h4>
                  <div v-for="p in channelOf(o)!.parameters" :key="p.name" class="oa-param">
                    <div class="oa-schema__row">
                      <code class="oa-schema__name">{{ p.name }}</code>
                      <span v-if="p.schema?.type" class="oa-schema__type">{{ p.schema.type }}</span>
                      <code v-if="p.location" class="oa-async__meta">{{ p.location }}</code>
                    </div>
                    <UidMarkdown v-if="p.description" class="oa-md oa-md--small" :source="p.description" />
                    <div v-if="p.schema?.enum" class="oa-schema__enum">
                      <code v-for="(e, i) in p.schema.enum" :key="i">{{ JSON.stringify(e) }}</code>
                    </div>
                  </div>
                </div>
                <AsyncApiMessage v-for="m in o.messages" :key="m.key" :message="m" :labels="L" />
                <div v-if="o.reply" class="oa-block oa-async-reply">
                  <h4 class="oa-block__title">{{ L.reply }}</h4>
                  <p v-if="o.reply.channel || o.reply.address" class="oa-async__meta">
                    <template v-if="o.reply.channel">
                      <span class="oa-schema__label">{{ L.channel }}:</span>
                      <code>{{ spec.channels.find((c) => c.id === o.reply!.channel)?.address ?? o.reply.channel }}</code>
                    </template>
                    <template v-if="o.reply.address">
                      <span class="oa-schema__label">{{ L.replyAddress }}:</span> <code>{{ o.reply.address }}</code>
                    </template>
                  </p>
                  <AsyncApiMessage v-for="m in o.reply.messages" :key="m.key" :message="m" :labels="L" />
                </div>
                <div v-if="o.bindings" class="oa-block">
                  <h4 class="oa-block__title">{{ L.bindings }}</h4>
                  <OaCodeBlock :code="json(o.bindings)" language="json" />
                </div>
              </div>
            </section>
          </section>

          <section v-if="spec.messages.length" class="oa-tag">
            <h2 class="oa-tag__title">{{ L.messages }}</h2>
            <AsyncApiMessage v-for="m in spec.messages" :key="m.key" :message="m" :labels="L" :anchor="anchorMessage(m.key)" />
          </section>

          <section v-if="schemas.length" class="oa-tag">
            <h2 class="oa-tag__title">{{ L.schemas }}</h2>
            <div v-for="[name, s] in schemas" :id="anchorSchema(name)" :key="name" class="oa-model">
              <h3 class="oa-model__title">{{ name }}</h3>
              <UidMarkdown v-if="s.description" class="oa-md oa-md--small" :source="s.description" />
              <OaSchema :schema="s" />
            </div>
          </section>
        </main>
      </div>

      <footer class="oa-footer">
        <span>{{ spec.info.title }} · {{ spec.info.version }}</span>
        <span>AsyncAPI {{ spec.version }}</span>
        <slot name="footer" />
      </footer>
    </template>
  </div>
  </component>
</template>

<style src="../openapi.css"></style>
