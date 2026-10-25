<script setup lang="ts">
/**
 * Try it: the parameters and body as a form, "Send", and the response. The
 * request goes through the reference's `send` — fetch by default, a host's
 * proxy when one is given.
 *
 * Parameters are grouped by location, each with the input its schema calls
 * for; undeclared query parameters, headers and cookies can be added. A JSON
 * body is a form generated from its schema, with the JSON text one click
 * away; form bodies (multipart, urlencoded) get one field per property, files
 * get a file picker, and a binary body is a single file. "What will be sent"
 * shows the final URL and headers. A request in flight can be cancelled; the
 * response shows its size, JSON pretty or raw, images as a preview and other
 * bytes as a download. Nothing in the panel scrolls on its own.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { UidAlert, UidButton, UidFileUpload, UidSelect } from '@dskripchenko/ui'
import type { HttpResponse, Parameter, ParameterIn, RequestBody, Schema } from '../core/types'
import type { OperationEntry } from '../model'
import { stringifyJson } from '../json'
import { inferType } from '../schema/util'
import { vAutoGrow } from './autoGrow'
import { useReference } from './context'
import { defaultExample, exampleText, mediaTypes, namedExamples, parseValue, sampleBody, type OperationDraft } from './draft'
import { valueText } from './fields'
import { BODY_FILE, formatBytes, formFields, isBinaryBody, type FormField } from './form'
import OaCodeBlock from './OaCodeBlock.vue'
import OaField from './OaField.vue'
import OaKeyValue from './OaKeyValue.vue'
import OaRequestPreview from './OaRequestPreview.vue'
import OaSchemaForm from './OaSchemaForm.vue'
import OaShareLink from './OaShareLink.vue'
import { bodyFormSchema } from './schemaForm'

const props = defineProps<{
  entry: OperationEntry
  draft: OperationDraft
  /** The form was filled from a link: a notice asks to check it. */
  prefilled?: boolean
}>()
const emit = defineEmits<{ dismiss: [] }>()
const ctx = useReference()
const labels = ctx.labels
const resolve = (r: string) => ctx.spec.value.resolver.get(r) as never

const LOCATIONS: ParameterIn[] = ['path', 'query', 'header', 'cookie']
const LOCATION_LABEL = { path: 'locPath', query: 'locQuery', header: 'locHeader', cookie: 'locCookie' } as const
/**
 * Parameter groups by location. Query and Headers are always there, so
 * undeclared ones can be added; Path and Cookies when the spec has some.
 */
const groups = computed(() =>
  LOCATIONS.map((loc) => ({ loc, params: props.entry.parameters.filter((p) => p.in === loc) })).filter(
    (g) => g.params.length || g.loc === 'query' || g.loc === 'header' || (g.loc === 'cookie' && props.draft.extra.cookie.length),
  ),
)
/** A parameter's schema: its own, else the schema of its first content type. */
const paramSchema = (p: Parameter): Schema | undefined => p.schema ?? Object.values(p.content ?? {})[0]?.schema
const addExtra = (loc: ParameterIn) => {
  if (loc !== 'path') props.draft.extra[loc].push(['', ''])
}

const body = computed(() => ctx.spec.value.resolver.deref(props.entry.operation.requestBody) as RequestBody | undefined)
const types = computed(() => mediaTypes(body.value).map((t) => ({ value: t, label: t })))

function chooseMediaType(value: unknown): void {
  if (typeof value !== 'string') return
  props.draft.mediaType = value
  props.draft.bodyText = sampleBody(body.value?.content[value], ctx, value)
  bodyExample.value = defaultExample(body.value?.content[value], ctx)
  for (const key of Object.keys(props.draft.files)) delete props.draft.files[key]
  view.value = 'form'
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

/* --------------------------------- bodies -------------------------------- */

const media = computed(() => body.value?.content[props.draft.mediaType])
const binary = computed(() => !!props.draft.mediaType && isBinaryBody(props.draft.mediaType, media.value, resolve))
/** Multipart and urlencoded bodies: one field per property. */
const fields = computed(() => (binary.value ? undefined : formFields(props.draft.mediaType, media.value, resolve)))
const fileFields = computed(() => fields.value?.filter((f) => f.file) ?? [])
/** A JSON body with an object (or array) schema: edited as a generated form. */
const jsonSchema = computed(() => (binary.value || fields.value ? undefined : bodyFormSchema(props.draft.mediaType, media.value, resolve)))
/** "Form" or "JSON": the view the user chose. The form shows only while the text parses. */
const view = ref<'form' | 'json'>('form')

/** The body text parsed: undefined when empty; ok false when it is not JSON. */
const parsed = computed<{ ok: boolean; value?: unknown }>(() => {
  const text = props.draft.bodyText.trim()
  if (!text) return { ok: true }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
})
/** The body as an object: `{}` when empty, null when it is not a JSON object. */
const bodyObject = computed<Record<string, unknown> | null>(() => {
  const { ok, value } = parsed.value
  if (!ok) return null
  if (value === undefined) return {}
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
})
const formable = computed(() => !!fields.value || !!jsonSchema.value)
/** The form can show the text: an object for form bodies, any JSON for a JSON body. */
const fits = computed(() => (fields.value ? bodyObject.value !== null : parsed.value.ok))
const showForm = computed(() => formable.value && view.value === 'form' && fits.value)
function setView(next: 'form' | 'json'): void {
  // Text that does not parse stays in JSON, where the warning says why.
  if (next === 'form' && !fits.value) return
  view.value = next
}

/** The JSON form writes the whole body back, pretty. */
function writeBody(value: unknown): void {
  props.draft.bodyText = value === undefined ? '' : stringifyJson(value, 2)
}

function setField(field: FormField, text: string): void {
  const next = { ...(bodyObject.value ?? {}) }
  if (text === '') delete next[field.name]
  else next[field.name] = parseValue(text, inferType(field.schema, resolve))
  props.draft.bodyText = Object.keys(next).length ? stringifyJson(next, 2) : ''
}

/** UidFileUpload keeps `{ file, id }` items; the draft keeps the files. Ids stay stable per file. */
const ids = new WeakMap<File, string>()
let nextId = 0
function uploads(key: string): { file: File; id: string }[] {
  return (props.draft.files[key] ?? []).map((file) => {
    if (!ids.has(file)) ids.set(file, `f${++nextId}`)
    return { file, id: ids.get(file)! }
  })
}
function setFiles(key: string, items: { file: File }[]): void {
  if (items.length) props.draft.files[key] = items.map((i) => i.file)
  else delete props.draft.files[key]
}
const bodyAccept = computed(() => {
  const mt = props.draft.mediaType
  return mt && !/octet-stream/i.test(mt) ? mt : undefined
})

/* ------------------------------- sending -------------------------------- */

const sending = ref(false)
const cancelled = ref(false)
const response = ref<HttpResponse | null>(null)
let controller: AbortController | null = null
/** Bumped by every send and cancel: a late answer to an old send is dropped. */
let ticket = 0

async function send(): Promise<void> {
  const my = ++ticket
  controller = new AbortController()
  sending.value = true
  cancelled.value = false
  response.value = null
  let result: HttpResponse
  try {
    result = await ctx.send.value(props.draft.request, { signal: controller.signal })
  } catch (error) {
    result = { status: 0, statusText: '', headers: [], body: '', duration: 0, error: String(error) }
  }
  if (my !== ticket) return
  response.value = result
  sending.value = false
  controller = null
}

function cancel(): void {
  controller?.abort()
  controller = null
  ticket++
  sending.value = false
  cancelled.value = true
}

function clear(): void {
  response.value = null
  cancelled.value = false
}

/* ------------------------------- response ------------------------------- */

const contentType = computed(() => response.value?.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '')
const isJson = computed(() => /json/i.test(contentType.value))
const pretty = ref(true)
const shownBody = computed(() => {
  const r = response.value
  if (!r) return ''
  if (isJson.value && pretty.value) {
    try {
      return stringifyJson(JSON.parse(r.body), 2)
    } catch {
      return r.body
    }
  }
  return r.body
})
const bodyLanguage = computed(() => (isJson.value ? 'json' : /xml|html/i.test(contentType.value) ? 'xml' : undefined))
const size = computed(() => {
  const r = response.value
  if (!r) return 0
  return r.blob ? r.blob.size : new TextEncoder().encode(r.body).length
})
const tone = computed(() => {
  const s = response.value?.status ?? 0
  return s >= 200 && s < 300 ? 'success' : s >= 400 ? 'danger' : s >= 300 ? 'info' : 'danger'
})
const showHeaders = ref(false)

/** An object URL for a binary response: an image preview or a download. Revoked when replaced. */
const blobUrl = ref<string | null>(null)
watch(response, (r) => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = r?.blob && r.blob.size ? URL.createObjectURL(r.blob) : null
})
onBeforeUnmount(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  controller?.abort()
})
const isImage = computed(() => !!blobUrl.value && /^image\//i.test(contentType.value))
const downloadName = computed(() => {
  const disposition = response.value?.headers.find(([k]) => k.toLowerCase() === 'content-disposition')?.[1] ?? ''
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]
  if (named) {
    try {
      return decodeURIComponent(named)
    } catch {
      return named
    }
  }
  const subtype = /\/([\w.+-]+)/.exec(contentType.value)?.[1]?.replace(/^.*\+/, '')
  return 'response' + (subtype && subtype !== 'octet-stream' ? '.' + subtype : '.bin')
})
</script>

<template>
  <section class="oa-panel oa-tryit">
    <header class="oa-panel__head">
      <span class="oa-panel__title">{{ labels.tryIt }}</span>
    </header>
    <div class="oa-tryit__body">
      <UidAlert v-if="prefilled" class="oa-tryit__prefilled" variant="info" dismissible @dismiss="emit('dismiss')">{{ labels.prefilled }}</UidAlert>

      <section v-for="g in groups" :key="g.loc" class="oa-tryit__group" :data-loc="g.loc">
        <div class="oa-tryit__group-title">
          <span class="oa-tryit__heading">{{ labels[LOCATION_LABEL[g.loc]] }}</span>
        </div>
        <OaField
          v-for="p in g.params"
          :key="p.name"
          :name="p.name"
          :schema="paramSchema(p)"
          :required="p.required"
          :deprecated="p.deprecated"
          :description="p.description"
          :model-value="draft.values[p.in][p.name] ?? ''"
          @update:model-value="(v: string) => (draft.values[p.in][p.name] = v)"
        />
        <OaKeyValue
          v-if="g.loc !== 'path' && draft.extra[g.loc].length"
          :rows="draft.extra[g.loc]"
          @update:rows="(rows: [string, string][]) => g.loc !== 'path' && (draft.extra[g.loc] = rows)"
        />
        <button v-if="g.loc !== 'path'" type="button" class="oa-tryit__add" :data-add="g.loc" @click="addExtra(g.loc)">
          <span aria-hidden="true">+</span> {{ g.loc === 'header' ? labels.addHeader : g.loc === 'query' ? labels.addQueryParam : labels.addCookie }}
        </button>
      </section>

      <section v-if="types.length" class="oa-tryit__group oa-tryit__bodygroup">
        <div class="oa-tryit__group-title">
          <span class="oa-tryit__heading">{{ labels.body }}</span>
          <UidSelect
            v-if="types.length > 1"
            class="oa-tryit__media"
            size="sm"
            :options="types"
            :model-value="draft.mediaType"
            @update:model-value="chooseMediaType"
          />
          <span v-else class="oa-tryit__media-one">{{ draft.mediaType }}</span>
          <div v-if="formable && !binary" class="oa-segmented oa-tryit__view-toggle" role="radiogroup" :aria-label="labels.body">
            <button
              type="button"
              role="radio"
              class="oa-segmented__item"
              data-view="form"
              :class="{ 'is-active': showForm }"
              :aria-checked="showForm"
              :disabled="!fits"
              @click="setView('form')"
            >{{ labels.formView }}</button>
            <button
              type="button"
              role="radio"
              class="oa-segmented__item"
              data-view="json"
              :class="{ 'is-active': !showForm }"
              :aria-checked="!showForm"
              @click="setView('json')"
            >{{ labels.jsonView }}</button>
          </div>
        </div>
        <div v-if="!binary && bodyExamples.length > 1" class="oa-tryit__example">
          <span>{{ labels.example }}</span>
          <UidSelect
            class="oa-tryit__media"
            size="sm"
            :options="bodyExamples"
            :model-value="bodyExample"
            :aria-label="labels.example"
            @update:model-value="chooseExample"
          />
        </div>
        <UidFileUpload
          v-if="binary"
          class="oa-tryit__file"
          :label="labels.file"
          :accept="bodyAccept"
          :model-value="uploads(BODY_FILE)"
          @update:model-value="(v: { file: File }[]) => setFiles(BODY_FILE, v)"
        />
        <OaSchemaForm
          v-else-if="showForm && jsonSchema"
          class="oa-tryit__form"
          root
          :schema="jsonSchema"
          :model-value="parsed.value"
          @update:model-value="writeBody"
        />
        <div v-else-if="showForm && fields" class="oa-tryit__form">
          <template v-for="f in fields" :key="f.name">
            <UidFileUpload
              v-if="f.file"
              class="oa-tryit__file"
              :data-field="f.name"
              :label="f.name"
              :required="f.required"
              :multiple="f.multiple"
              :accept="f.accept"
              :model-value="uploads(f.name)"
              @update:model-value="(v: { file: File }[]) => setFiles(f.name, v)"
            />
            <OaField
              v-else
              :name="f.name"
              :schema="f.schema"
              :required="f.required"
              :model-value="valueText(bodyObject?.[f.name])"
              @update:model-value="(v: string) => setField(f, v)"
            />
          </template>
        </div>
        <template v-else>
          <textarea v-model="draft.bodyText" v-auto-grow class="oa-tryit__textarea" spellcheck="false" rows="4" />
          <div v-if="draft.bodyInvalid" class="oa-tryit__warn">{{ labels.invalidJson }}</div>
          <UidFileUpload
            v-for="f in fileFields"
            :key="f.name"
            class="oa-tryit__file"
            :data-field="f.name"
            :label="f.name"
            :required="f.required"
            :multiple="f.multiple"
            :accept="f.accept"
            :model-value="uploads(f.name)"
            @update:model-value="(v: { file: File }[]) => setFiles(f.name, v)"
          />
        </template>
      </section>

      <OaRequestPreview :request="draft.request" @add-header="addExtra('header')" />

      <div class="oa-tryit__actions">
        <UidButton class="oa-tryit__send" variant="primary" :loading="sending" @click="send">
          {{ sending ? labels.sending : labels.send }}
        </UidButton>
        <UidButton v-if="sending" class="oa-tryit__cancel" variant="secondary" @click="cancel">{{ labels.cancel }}</UidButton>
        <UidButton v-else-if="response || cancelled" class="oa-tryit__clear" variant="secondary" @click="clear">{{ labels.clear }}</UidButton>
      </div>
      <OaShareLink :entry="entry" :draft="draft" />

      <div v-if="cancelled" class="oa-tryit__response oa-tryit__cancelled" aria-live="polite">
        <UidAlert variant="warning" :title="labels.cancelled" />
      </div>
      <div v-if="response" class="oa-tryit__response" aria-live="polite">
        <div class="oa-tryit__heading">{{ labels.response }}</div>
        <UidAlert v-if="response.error" variant="danger" :title="labels.networkError">{{ response.error }}</UidAlert>
        <template v-else>
          <div class="oa-tryit__status">
            <span class="oa-status" :class="`oa-status--${tone}`">{{ response.status }} {{ response.statusText }}</span>
            <span class="oa-tryit__time">{{ Math.round(response.duration) }} ms</span>
            <span class="oa-tryit__size">{{ formatBytes(size) }}</span>
            <button type="button" class="oa-link" :aria-expanded="showHeaders" @click="showHeaders = !showHeaders">
              {{ labels.headers }} ({{ response.headers.length }})
            </button>
            <span v-if="isJson && response.body" class="oa-tryit__view">
              <button type="button" class="oa-chip" :class="{ 'is-active': pretty }" @click="pretty = true">{{ labels.pretty }}</button>
              <button type="button" class="oa-chip" :class="{ 'is-active': !pretty }" @click="pretty = false">{{ labels.raw }}</button>
            </span>
          </div>
          <dl v-if="showHeaders" class="oa-preview__headers oa-tryit__headers">
            <template v-for="([k, v], i) in response.headers" :key="i">
              <dt>{{ k }}</dt>
              <dd>{{ v }}</dd>
            </template>
          </dl>
          <img v-if="isImage" class="oa-tryit__image" :src="blobUrl!" :alt="contentType" />
          <a v-if="blobUrl" class="oa-link oa-tryit__download" :href="blobUrl" :download="downloadName">
            {{ labels.download }} {{ downloadName }}
          </a>
          <OaCodeBlock v-else-if="shownBody" class="oa-tryit__result" :code="shownBody" :language="bodyLanguage" />
        </template>
      </div>
    </div>
  </section>
</template>

