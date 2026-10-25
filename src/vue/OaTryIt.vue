<script setup lang="ts">
/**
 * Try it: the parameters and body as a form, "Send", and the response. The
 * request goes through the reference's `send` — fetch by default, a host's
 * proxy when one is given.
 */
import { computed, ref } from 'vue'
import { UidAlert, UidButton, UidCode, UidInput, UidSelect } from '@dskripchenko/ui'
import type { HttpResponse, ParameterIn, RequestBody } from '../core/types'
import type { OperationEntry } from '../model'
import { stringifyJson } from '../json'
import { useReference } from './context'
import { defaultExample, exampleText, mediaTypes, namedExamples, sampleBody, type OperationDraft } from './draft'
import OaShareLink from './OaShareLink.vue'

const props = defineProps<{
  entry: OperationEntry
  draft: OperationDraft
  /** The form was filled from a link: a notice asks to check it. */
  prefilled?: boolean
}>()
const emit = defineEmits<{ dismiss: [] }>()
const ctx = useReference()
const labels = ctx.labels

const LOCATIONS: ParameterIn[] = ['path', 'query', 'header', 'cookie']
const groups = computed(() =>
  LOCATIONS.map((loc) => ({ loc, params: props.entry.parameters.filter((p) => p.in === loc) })).filter((g) => g.params.length),
)

const body = computed(() => ctx.spec.value.resolver.deref(props.entry.operation.requestBody) as RequestBody | undefined)
const types = computed(() => mediaTypes(body.value).map((t) => ({ value: t, label: t })))

function chooseMediaType(value: unknown): void {
  if (typeof value !== 'string') return
  props.draft.mediaType = value
  props.draft.bodyText = sampleBody(body.value?.content[value], ctx, value)
  bodyExample.value = defaultExample(body.value?.content[value], ctx)
}

/** The body's examples, "generated" first; choosing one replaces the body text. */
const bodyExamples = computed(() =>
  namedExamples(body.value?.content[props.draft.mediaType], ctx, true)
    .filter((e) => e.externalValue === undefined)
    .map((e) => ({ value: e.name, label: e.label })),
)
const bodyExample = ref(defaultExample(body.value?.content[props.draft.mediaType], ctx))
function chooseExample(value: unknown): void {
  if (typeof value !== 'string') return
  bodyExample.value = value
  props.draft.bodyText = exampleText(body.value?.content[props.draft.mediaType], value, ctx, props.draft.mediaType)
}

const sending = ref(false)
const response = ref<HttpResponse | null>(null)
const controller = ref<AbortController | null>(null)

async function send(): Promise<void> {
  sending.value = true
  response.value = null
  try {
    response.value = await ctx.send.value(props.draft.request)
  } catch (error) {
    response.value = { status: 0, statusText: '', headers: [], body: '', duration: 0, error: String(error) }
  } finally {
    sending.value = false
    controller.value = null
  }
}

const contentType = computed(() => response.value?.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '')
const prettyBody = computed(() => {
  const r = response.value
  if (!r) return ''
  if (/json/i.test(contentType.value)) {
    try {
      return stringifyJson(JSON.parse(r.body), 2)
    } catch {
      return r.body
    }
  }
  return r.body
})
const bodyLanguage = computed(() => (/json/i.test(contentType.value) ? 'json' : /xml|html/i.test(contentType.value) ? 'xml' : undefined))
const tone = computed(() => {
  const s = response.value?.status ?? 0
  return s >= 200 && s < 300 ? 'success' : s >= 400 ? 'danger' : s >= 300 ? 'info' : 'danger'
})
const showHeaders = ref(false)
</script>

<template>
  <section class="oa-panel oa-tryit">
    <header class="oa-panel__head">
      <span class="oa-panel__title">{{ labels.tryIt }}</span>
    </header>
    <div class="oa-tryit__body">
      <UidAlert v-if="prefilled" class="oa-tryit__prefilled" variant="info" dismissible @dismiss="emit('dismiss')">{{ labels.prefilled }}</UidAlert>
      <div v-for="g in groups" :key="g.loc" class="oa-tryit__group">
        <div class="oa-tryit__group-title">{{ g.loc }}</div>
        <UidInput
          v-for="p in g.params"
          :key="p.name"
          size="sm"
          :label="p.name"
          :required="p.required"
          :placeholder="p.schema?.type ? String(p.schema.type) : ''"
          :model-value="draft.values[p.in][p.name] ?? ''"
          @update:model-value="(v: string) => (draft.values[p.in][p.name] = v)"
        />
      </div>
      <div v-if="types.length" class="oa-tryit__group">
        <div class="oa-tryit__group-title">
          {{ labels.body }}
          <UidSelect
            v-if="types.length > 1"
            class="oa-tryit__media"
            size="sm"
            :options="types"
            :model-value="draft.mediaType"
            @update:model-value="chooseMediaType"
          />
          <span v-else class="oa-tryit__media-one">{{ draft.mediaType }}</span>
        </div>
        <div v-if="bodyExamples.length > 1" class="oa-tryit__example">
          <span>{{ labels.example }}:</span>
          <UidSelect
            class="oa-tryit__media"
            size="sm"
            :options="bodyExamples"
            :model-value="bodyExample"
            :aria-label="labels.example"
            @update:model-value="chooseExample"
          />
        </div>
        <textarea
          v-model="draft.bodyText"
          class="oa-tryit__textarea"
          spellcheck="false"
          :rows="Math.min(18, Math.max(4, draft.bodyText.split('\n').length + 1))"
        />
        <div v-if="draft.bodyInvalid" class="oa-tryit__warn">{{ labels.invalidJson }}</div>
      </div>
      <div class="oa-tryit__actions">
        <UidButton variant="primary" size="sm" :loading="sending" @click="send">
          {{ sending ? labels.sending : labels.send }}
        </UidButton>
        <UidButton v-if="response" variant="ghost" size="sm" @click="response = null">{{ labels.clear }}</UidButton>
      </div>
      <OaShareLink :entry="entry" :draft="draft" />

      <div v-if="response" class="oa-tryit__response" aria-live="polite">
        <UidAlert v-if="response.error" variant="danger" :title="labels.networkError">{{ response.error }}</UidAlert>
        <template v-else>
          <div class="oa-tryit__status">
            <span class="oa-status" :class="`oa-status--${tone}`">{{ response.status }} {{ response.statusText }}</span>
            <span class="oa-tryit__time">{{ Math.round(response.duration) }} ms</span>
            <button type="button" class="oa-link" @click="showHeaders = !showHeaders">
              {{ labels.headers }} ({{ response.headers.length }})
            </button>
          </div>
          <table v-if="showHeaders" class="oa-table oa-table--compact">
            <tbody>
              <tr v-for="([k, v], i) in response.headers" :key="i">
                <td><code>{{ k }}</code></td>
                <td>{{ v }}</td>
              </tr>
            </tbody>
          </table>
          <UidCode v-if="prettyBody" :code="prettyBody" :language="bodyLanguage" copy max-height="360px" />
        </template>
      </div>
    </div>
  </section>
</template>
