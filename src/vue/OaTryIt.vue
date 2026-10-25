<script setup lang="ts">
/**
 * Try it: the parameters and body as a form, "Send", and the response. The
 * request goes through the reference's `send` — fetch by default, a host's
 * proxy when one is given.
 *
 * Form bodies (multipart, urlencoded) get one field per property, files get
 * a file picker, and a binary body is a single file. A request in flight can
 * be cancelled; the response shows its size, JSON pretty or raw, images as a
 * preview and other bytes as a download.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { UidAlert, UidButton, UidCode, UidFileUpload, UidInput, UidSelect } from '@dskripchenko/ui'
import type { HttpResponse, ParameterIn, RequestBody } from '../core/types'
import type { OperationEntry } from '../model'
import { stringifyJson } from '../json'
import { describe as describeSchema } from '../schema'
import { useReference } from './context'
import { mediaTypes, parseValue, sampleBody, type OperationDraft } from './draft'
import { BODY_FILE, fieldText, formatBytes, formFields, isBinaryBody, type FormField } from './form'

const props = defineProps<{ entry: OperationEntry; draft: OperationDraft }>()
const ctx = useReference()
const labels = ctx.labels
const resolve = (r: string) => ctx.spec.value.resolver.get(r) as never

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
  for (const key of Object.keys(props.draft.files)) delete props.draft.files[key]
  rawBody.value = false
}

/* ------------------------------ form bodies ------------------------------ */

const media = computed(() => body.value?.content[props.draft.mediaType])
const binary = computed(() => !!props.draft.mediaType && isBinaryBody(props.draft.mediaType, media.value, resolve))
const fields = computed(() => (binary.value ? undefined : formFields(props.draft.mediaType, media.value, resolve)))
const fileFields = computed(() => fields.value?.filter((f) => f.file) ?? [])
const rawBody = ref(false)

/** The body text as an object: `{}` when empty, null when it is not a JSON object. */
const bodyObject = computed<Record<string, unknown> | null>(() => {
  const text = props.draft.bodyText.trim()
  if (!text) return {}
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
})
/** The form is shown while the body text is an object; otherwise the text itself. */
const formMode = computed(() => !!fields.value && !rawBody.value && bodyObject.value !== null)

function setField(field: FormField, text: string): void {
  const next = { ...(bodyObject.value ?? {}) }
  if (text === '') delete next[field.name]
  else next[field.name] = parseValue(text, field.schema.type)
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
const fieldType = (f: FormField): string => describeSchema(f.schema, { resolve })

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
          <button v-if="fields && bodyObject !== null" type="button" class="oa-link oa-tryit__mode" @click="rawBody = !rawBody">
            {{ rawBody ? labels.formView : labels.rawJson }}
          </button>
        </div>
        <UidFileUpload
          v-if="binary"
          class="oa-tryit__file"
          :label="labels.file"
          :accept="bodyAccept"
          :model-value="uploads(BODY_FILE)"
          @update:model-value="(v: { file: File }[]) => setFiles(BODY_FILE, v)"
        />
        <template v-else-if="formMode">
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
            <UidInput
              v-else
              size="sm"
              :data-field="f.name"
              :label="f.name"
              :required="f.required"
              :placeholder="fieldType(f)"
              :model-value="fieldText(bodyObject?.[f.name])"
              @update:model-value="(v: string) => setField(f, v)"
            />
          </template>
        </template>
        <template v-else>
          <textarea
            v-model="draft.bodyText"
            class="oa-tryit__textarea"
            spellcheck="false"
            :rows="Math.min(18, Math.max(4, draft.bodyText.split('\n').length + 1))"
          />
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
      </div>
      <div class="oa-tryit__actions">
        <UidButton variant="primary" size="sm" :loading="sending" @click="send">
          {{ sending ? labels.sending : labels.send }}
        </UidButton>
        <UidButton v-if="sending" class="oa-tryit__cancel" variant="secondary" size="sm" @click="cancel">{{ labels.cancel }}</UidButton>
        <UidButton v-else-if="response || cancelled" variant="ghost" size="sm" @click="clear">{{ labels.clear }}</UidButton>
      </div>

      <div v-if="cancelled" class="oa-tryit__response oa-tryit__cancelled" aria-live="polite">
        <UidAlert variant="warning" :title="labels.cancelled" />
      </div>
      <div v-if="response" class="oa-tryit__response" aria-live="polite">
        <UidAlert v-if="response.error" variant="danger" :title="labels.networkError">{{ response.error }}</UidAlert>
        <template v-else>
          <div class="oa-tryit__status">
            <span class="oa-status" :class="`oa-status--${tone}`">{{ response.status }} {{ response.statusText }}</span>
            <span class="oa-tryit__time">{{ Math.round(response.duration) }} ms</span>
            <span class="oa-tryit__size">{{ formatBytes(size) }}</span>
            <button type="button" class="oa-link" @click="showHeaders = !showHeaders">
              {{ labels.headers }} ({{ response.headers.length }})
            </button>
            <span v-if="isJson && response.body" class="oa-tryit__view">
              <button type="button" class="oa-chip" :class="{ 'is-active': pretty }" @click="pretty = true">{{ labels.pretty }}</button>
              <button type="button" class="oa-chip" :class="{ 'is-active': !pretty }" @click="pretty = false">{{ labels.raw }}</button>
            </span>
          </div>
          <table v-if="showHeaders" class="oa-table oa-table--compact">
            <tbody>
              <tr v-for="([k, v], i) in response.headers" :key="i">
                <td><code>{{ k }}</code></td>
                <td>{{ v }}</td>
              </tr>
            </tbody>
          </table>
          <img v-if="isImage" class="oa-tryit__image" :src="blobUrl!" :alt="contentType" />
          <a v-if="blobUrl" class="oa-link oa-tryit__download" :href="blobUrl" :download="downloadName">
            {{ labels.download }} {{ downloadName }}
          </a>
          <UidCode v-else-if="shownBody" :code="shownBody" :language="bodyLanguage" copy max-height="360px" />
        </template>
      </div>
    </div>
  </section>
</template>
