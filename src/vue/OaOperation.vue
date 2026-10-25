<script setup lang="ts">
/**
 * One operation: what it does on the left (parameters, body, responses), and
 * how to call it on the right (samples, try-it). Both sides share one draft.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { UidButton, UidMarkdown } from '@dskripchenko/ui'
import { Check, Link } from '@dskripchenko/ui/icons'
import type { Header, MediaType, Parameter, ParameterIn, RequestBody, Response } from '../core/types'
import type { OperationEntry } from '../model'
import { describe as describeSchema } from '../schema'
import { useReference } from './context'
import { createDraft, mediaTypes, namedExamples, type OperationDraft } from './draft'
import OaExamples from './OaExamples.vue'
import OaSamples from './OaSamples.vue'
import OaSchema from './OaSchema.vue'
import OaTryIt from './OaTryIt.vue'
import { safeHref } from './safe'
import { applyPrefill } from './share'

const props = withDefaults(
  defineProps<{
    entry: OperationEntry
    /** False for the second and later copies of an operation listed under several tags. */
    anchored?: boolean
  }>(),
  { anchored: true },
)
const ctx = useReference()
const labels = ctx.labels
const deref = <T,>(v: unknown): T | undefined => ctx.spec.value.resolver.deref(v as never) as T | undefined
const resolveRef = (r: string) => ctx.spec.value.resolver.get(r) as never

const op = computed(() => props.entry.operation)

/**
 * A large spec has hundreds of operations: each one builds its draft, samples
 * and forms only when it comes near the viewport, and keeps them after.
 */
const root = ref<HTMLElement | null>(null)
const draft = shallowRef<OperationDraft | null>(null)
let observer: IntersectionObserver | null = null
function show(): void {
  if (draft.value) return
  draft.value = createDraft(props.entry, ctx)
  observer?.disconnect()
  observer = null
}
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined' || !root.value) return show()
  observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && show(), { rootMargin: '1200px 0px' })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
defineExpose({ show })

const LOCATIONS: ParameterIn[] = ['path', 'query', 'header', 'cookie']
const paramGroups = computed(() =>
  LOCATIONS.map((loc) => ({ loc, params: props.entry.parameters.filter((p) => p.in === loc) })).filter((g) => g.params.length),
)
const paramType = (p: Parameter): string => (p.schema ? describeSchema(p.schema, { resolve: resolveRef }) : Object.keys(p.content ?? {})[0] ?? '')

const body = computed(() => deref<RequestBody>(op.value.requestBody))
const bodyTypes = computed(() => mediaTypes(body.value))
const bodyType = ref(bodyTypes.value[0] ?? '')
const bodyMedia = computed<MediaType | undefined>(() => body.value?.content[bodyType.value])

const responses = computed(() =>
  Object.entries(op.value.responses ?? {}).map(([code, r]) => ({ code, response: deref<Response>(r) })),
)
const openResponse = ref<string | null>(responses.value[0]?.code ?? null)
const responseType = ref<Record<string, string>>({})
function responseMedia(code: string, r: Response | undefined): { type: string; media: MediaType } | undefined {
  const types = Object.keys(r?.content ?? {})
  if (!types.length) return undefined
  const type = responseType.value[code] && types.includes(responseType.value[code]!) ? responseType.value[code]! : (types.find((t) => /json/i.test(t)) ?? types[0]!)
  return { type, media: r!.content![type]! }
}
/** A parameter's named examples; a simple one fills its try-it field on click. */
const paramExamples = (p: Parameter) => (p.examples ? namedExamples(p, ctx) : [])
const fillable = (value: unknown): value is string | number =>
  ctx.tryIt.value && !props.entry.webhook && (typeof value === 'string' || typeof value === 'number')
function useParamExample(p: Parameter, value: string | number): void {
  if (draft.value) draft.value.values[p.in][p.name] = String(value)
}
const tone = (code: string): string =>
  code.startsWith('2') ? 'success' : code.startsWith('3') ? 'info' : code.startsWith('4') || code.startsWith('5') ? 'danger' : 'neutral'

const anchor = computed(() => `${ctx.anchorPrefix.value}operation/${props.entry.id}`)
/** Copies the address of the operation's anchor: the page without its hash, `#`, the section id. */
const linkCopied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copyLink(): Promise<void> {
  const id = root.value?.id || anchor.value
  try {
    await navigator.clipboard.writeText(`${window.location.href.split('#')[0]}#${id}`)
  } catch {
    return
  }
  linkCopied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (linkCopied.value = false), 1500)
}
onBeforeUnmount(() => clearTimeout(copiedTimer))

const headersOf = (r: Response | undefined) =>
  Object.entries(r?.headers ?? {}).map(([name, h]) => ({ name, header: deref<Header>(h) }))

/** A prefilled link to this operation: the draft is made now, however far down it is, and filled. */
const prefilled = ref(false)
watch(
  () => ctx.prefill.value,
  (p) => {
    if (!p || !props.anchored || props.entry.webhook || p.anchor !== anchor.value) return
    ctx.prefill.value = null
    show()
    applyPrefill(draft.value!, p.data, props.entry, ctx)
    prefilled.value = true
  },
  { immediate: true },
)
</script>

<template>
  <section :id="anchored ? anchor : undefined" ref="root" class="oa-op" :class="{ 'oa-op--deprecated': entry.deprecated, 'oa-op--pending': !draft }">
    <header class="oa-op__head">
      <div class="oa-op__titlebar">
        <h3 class="oa-op__title">{{ op.summary || entry.path }}</h3>
        <UidButton
          class="oa-op__copy"
          :class="{ 'is-copied': linkCopied }"
          variant="ghost"
          size="sm"
          :icon="linkCopied ? Check : Link"
          :aria-label="linkCopied ? labels.operationLinkCopied : labels.copyOperationLink"
          :title="linkCopied ? labels.operationLinkCopied : labels.copyOperationLink"
          @click="copyLink"
        />
        <span v-if="linkCopied" class="oa-op__copied" role="status">{{ labels.operationLinkCopied }}</span>
      </div>
      <div class="oa-op__line">
        <span class="oa-method" :class="`oa-method--${entry.method}`">{{ entry.method.toUpperCase() }}</span>
        <code class="oa-op__path">{{ entry.path }}</code>
        <span v-if="entry.deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
      </div>
    </header>

    <div v-if="draft" class="oa-op__grid">
      <div class="oa-op__doc">
        <UidMarkdown v-if="op.description" class="oa-md" :source="op.description" />
        <p v-if="safeHref(op.externalDocs?.url)" class="oa-op__ext">
          <a :href="safeHref(op.externalDocs?.url)" target="_blank" rel="noopener noreferrer">{{ op.externalDocs?.description || labels.externalDocs }}</a>
        </p>

        <div v-if="paramGroups.length" class="oa-block">
          <h4 class="oa-block__title">{{ labels.parameters }}</h4>
          <div v-for="g in paramGroups" :key="g.loc" class="oa-params">
            <div class="oa-params__loc">{{ g.loc }}</div>
            <div v-for="p in g.params" :key="p.name" class="oa-param">
              <div class="oa-schema__row">
                <code class="oa-schema__name">{{ p.name }}</code>
                <span class="oa-schema__type">{{ paramType(p) }}</span>
                <span v-if="p.required" class="oa-schema__flag oa-schema__flag--required">{{ labels.required }}</span>
                <span v-if="p.deprecated" class="oa-schema__flag oa-schema__flag--deprecated">{{ labels.deprecated }}</span>
              </div>
              <UidMarkdown v-if="p.description" class="oa-md oa-md--small" :source="p.description" />
              <div v-if="p.schema?.enum" class="oa-schema__enum">
                <span class="oa-schema__label">{{ labels.enum }}:</span>
                <code v-for="(e, i) in p.schema.enum" :key="i">{{ JSON.stringify(e) }}</code>
              </div>
              <div v-if="p.schema?.default !== undefined" class="oa-schema__enum">
                <span class="oa-schema__label">{{ labels.default }}:</span>
                <code>{{ JSON.stringify(p.schema.default) }}</code>
              </div>
              <div v-if="paramExamples(p).length" class="oa-schema__enum oa-param__examples">
                <span class="oa-schema__label">{{ labels.examples }}:</span>
                <template v-for="ex in paramExamples(p)" :key="ex.name">
                  <button
                    v-if="fillable(ex.value)"
                    type="button"
                    class="oa-chip"
                    :title="`${labels.useExample}: ${String(ex.value)}`"
                    @click="useParamExample(p, ex.value)"
                  >{{ ex.label }}</button>
                  <code v-else :title="ex.value !== undefined ? JSON.stringify(ex.value) : ex.externalValue">{{ ex.label }}</code>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div v-if="body" class="oa-block">
          <h4 class="oa-block__title">
            {{ labels.requestBody }}
            <span v-if="body.required" class="oa-schema__flag oa-schema__flag--required">{{ labels.required }}</span>
            <span class="oa-block__media">
              <button
                v-for="t in bodyTypes"
                :key="t"
                type="button"
                class="oa-chip"
                :class="{ 'is-active': t === bodyType }"
                @click="bodyType = t"
              >{{ t }}</button>
            </span>
          </h4>
          <UidMarkdown v-if="body.description" class="oa-md oa-md--small" :source="body.description" />
          <OaExamples v-if="bodyMedia" :key="bodyType" :media="bodyMedia" :media-type="bodyType" mode="request" />
          <OaSchema v-if="bodyMedia?.schema" :schema="bodyMedia.schema" mode="request" />
        </div>

        <div v-if="responses.length" class="oa-block">
          <h4 class="oa-block__title">{{ labels.responses }}</h4>
          <div v-for="{ code, response } in responses" :key="code" class="oa-response">
            <button
              type="button"
              class="oa-response__head"
              :aria-expanded="openResponse === code"
              @click="openResponse = openResponse === code ? null : code"
            >
              <span class="oa-status" :class="`oa-status--${tone(code)}`">{{ code }}</span>
              <span class="oa-response__desc">{{ response?.description }}</span>
              <span class="oa-schema__chevron" :class="{ 'is-open': openResponse === code }" aria-hidden="true">›</span>
            </button>
            <div v-if="openResponse === code" class="oa-response__body">
              <table v-if="headersOf(response).length" class="oa-table oa-table--compact">
                <thead><tr><th>{{ labels.headers }}</th><th /></tr></thead>
                <tbody>
                  <tr v-for="h in headersOf(response)" :key="h.name">
                    <td><code>{{ h.name }}</code></td>
                    <td>{{ h.header?.schema ? describeSchema(h.header.schema, { resolve: resolveRef }) : '' }} {{ h.header?.description }}</td>
                  </tr>
                </tbody>
              </table>
              <template v-if="responseMedia(code, response)">
                <div class="oa-block__media">
                  <button
                    v-for="t in Object.keys(response?.content ?? {})"
                    :key="t"
                    type="button"
                    class="oa-chip"
                    :class="{ 'is-active': t === responseMedia(code, response)!.type }"
                    @click="responseType[code] = t"
                  >{{ t }}</button>
                </div>
                <OaSchema v-if="responseMedia(code, response)!.media.schema" :schema="responseMedia(code, response)!.media.schema!" mode="response" />
                <OaExamples
                  :key="responseMedia(code, response)!.type"
                  :media="responseMedia(code, response)!.media"
                  :media-type="responseMedia(code, response)!.type"
                  mode="response"
                  generated
                />
              </template>
            </div>
          </div>
        </div>

        <div v-if="op.callbacks" class="oa-block">
          <h4 class="oa-block__title">{{ labels.callbacks }}</h4>
          <div v-for="(cb, name) in op.callbacks" :key="name" class="oa-callback">
            <code class="oa-schema__name">{{ name }}</code>
            <div v-for="(item, expr) in (deref<Record<string, Record<string, unknown>>>(cb) ?? {})" :key="expr" class="oa-callback__item">
              <code>{{ expr }}</code>
              <span v-for="m in Object.keys(item).filter((k) => ['get','put','post','delete','patch','head','options','trace'].includes(k))" :key="m" class="oa-method oa-method--small" :class="`oa-method--${m}`">{{ m.toUpperCase() }}</span>
            </div>
          </div>
        </div>
      </div>

      <aside class="oa-op__side">
        <OaSamples :draft="draft" />
        <OaTryIt v-if="ctx.tryIt.value && !entry.webhook" :entry="entry" :draft="draft" :prefilled="prefilled" @dismiss="prefilled = false" />
      </aside>
    </div>
  </section>
</template>
