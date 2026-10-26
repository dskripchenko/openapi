<script setup lang="ts">
/**
 * The block as a form: the requests (several share a title, a base URL and
 * an auth scheme), and for the open one its method and URL, what it is, its
 * parameters, auth, body and responses. Edits go straight into `model`; the
 * widget turns them into the block's text.
 */
import { computed, ref, watch } from 'vue'
import { UidButton, UidCheckbox, UidFormField, UidInput, UidSelect, UidTextarea } from '@dskripchenko/ui'
import { Braces, Plus, X } from 'lucide-vue-next'
import {
  BLOCK_METHODS,
  BODY_TYPES,
  MEDIA_ALIASES,
  PARAM_LOCATIONS,
  emptyParam,
  emptyRequest,
  inferSchema,
  isStructuredMedia,
  parseShorthand,
  stringifyBlock,
  syncPathParams,
  type BlockFormat,
  type BlockMethod,
  type BlockModel,
  type BlockModelError,
  type ParamLocation,
  type RequestModel,
} from '../../blocks'
import { detectFormat } from '../../json'
import { parseSpec } from '../../load'
import OaSourceEditor from '../editor/OaSourceEditor.vue'
import OaBlockAuth from './OaBlockAuth.vue'
import type { BlockLabels } from './labels'

const props = defineProps<{
  model: BlockModel
  labels: BlockLabels
  format: BlockFormat
  errors: BlockModelError[]
}>()

const current = ref(0)
watch(
  () => props.model.requests.length,
  (n) => (current.value = Math.min(current.value, Math.max(0, n - 1))),
)
// A block always has a request: the last one cannot be removed.
const req = computed<RequestModel>(() => props.model.requests[current.value] ?? props.model.requests[0]!)
const errorOf = (field: string): string | undefined => props.errors.find((e) => e.field === `${current.value}.${field}`)?.message

/* --------------------------------- requests -------------------------------- */
function addRequest(): void {
  const m = props.model
  m.multiple = true
  m.requests.push(emptyRequest(nextPath()))
  current.value = m.requests.length - 1
}
/** A path not used yet: /resource, /resource2… */
function nextPath(): string {
  const used = new Set(props.model.requests.map((r) => r.url))
  let path = '/resource'
  for (let n = 2; used.has(path); n++) path = `/resource${n}`
  return path
}
function removeRequest(i: number): void {
  props.model.requests.splice(i, 1)
}
const pathOf = (r: RequestModel): string => r.url.replace(/^https?:\/\/[^/]+/i, '') || '/'

/* ---------------------------------- request --------------------------------- */
const methods = BLOCK_METHODS.map((m) => ({ value: m, label: m }))
function setUrl(url: string): void {
  if (!req.value) return
  req.value.url = url
  syncPathParams(req.value)
}

/* -------------------------------- parameters -------------------------------- */
const locations = PARAM_LOCATIONS.map((l) => ({ value: l, label: l }))
const COMMON_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
  'object',
  'string[]',
  'integer[]',
  'string(date-time)',
  'string(date)',
  'string(email)',
  'string(uuid)',
  'string(uri)',
  'integer(int64)',
  'number(float)',
  'file',
]
/** The usual types, and a type written in the source that is not among them. */
const typeOptions = (current: string) => (COMMON_TYPES.includes(current) ? COMMON_TYPES : [current, ...COMMON_TYPES]).map((t) => ({ value: t, label: t }))
function addParam(): void {
  const r = req.value
  if (!r) return
  const taken = new Set(r.params.map((p) => p.name))
  let name = 'param'
  for (let n = 2; taken.has(name); n++) name = `param${n}`
  r.params.push(emptyParam('query', name))
}
function setLocation(i: number, loc: ParamLocation): void {
  const p = req.value?.params[i]
  if (!p) return
  // A path parameter comes from the URL: moving one there adds it to the URL too.
  if (loc === 'path' && req.value && !req.value.url.includes(`{${p.name}}`)) req.value.url = `${req.value.url.replace(/\/+$/, '')}/{${p.name}}`
  p.in = loc
  if (loc === 'path') p.required = true
  syncPathParams(req.value!)
}
const exampleHint = (type: string): string => {
  try {
    const t = parseShorthand(type).schema.type
    return t === 'integer' || t === 'number' ? '42' : t === 'boolean' ? 'true' : t === 'array' ? '["a"]' : t === 'object' ? '{"a": 1}' : ''
  } catch {
    return ''
  }
}

/* ----------------------------------- body ----------------------------------- */
const mediaOptions = (current: string) => {
  const list = BODY_TYPES.map((t) => ({ value: t, label: `${t} · ${MEDIA_ALIASES[t]}` }))
  return BODY_TYPES.includes(current) ? list : [{ value: current, label: current }, ...list]
}
function addBody(): void {
  const b = req.value?.body
  if (!b) return
  b.enabled = true
  if (!b.example && !b.schema) b.example = '{\n  "name": "value"\n}'
}
/** Switching to the schema with none written: start from the example's shape. */
function setMode(mode: 'example' | 'schema'): void {
  const b = req.value?.body
  if (!b) return
  b.mode = mode
  if (mode !== 'schema' || b.schema.trim() || !b.example.trim()) return
  try {
    const value = isStructuredMedia(b.type) ? parseSpec(b.example, detectFormat(b.example)).value : b.example
    b.schema = stringifyBlock(inferSchema(value), props.format).trimEnd()
  } catch {
    // An example that does not read gives no schema to start from.
  }
}

/* --------------------------------- responses -------------------------------- */
const openExample = ref<Set<number>>(new Set())
function toggleExample(i: number): void {
  const next = new Set(openExample.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  openExample.value = next
}
// Responses with an example open with it; clearing one keeps its editor open.
watch(
  [current, () => props.model],
  () => (openExample.value = new Set(req.value?.responses.flatMap((r, i) => (r.example ? [i] : [])) ?? [])),
  { immediate: true },
)
function addResponse(): void {
  const r = req.value
  if (!r) return
  const taken = new Set(r.responses.map((x) => x.status))
  const status = ['200', '201', '400', '404', '500'].find((s) => !taken.has(s)) ?? 'default'
  r.responses.push({ status, description: '', example: '' })
}
</script>

<template>
  <div class="oa-bk__form">
    <section v-if="model.multiple" class="oa-bk__section oa-bk__shared">
      <h4 class="oa-bk__section-title">{{ labels.shared }}</h4>
      <div class="oa-bk__grid">
        <UidInput size="sm" :label="labels.title" v-model="model.title" />
        <UidInput size="sm" :label="labels.baseUrl" placeholder="https://api.example.com/v1" v-model="model.baseUrl" />
      </div>
      <OaBlockAuth :auth="model.auth" :labels="labels" :inherit-label="labels.authInherit" />
    </section>

    <nav v-if="model.multiple" class="oa-bk__requests" :aria-label="labels.requests">
      <button
        v-for="(r, i) in model.requests"
        :key="i"
        type="button"
        class="oa-bk__request"
        :class="{ 'is-active': i === current }"
        :aria-pressed="i === current"
        @click="current = i"
      >
        <span class="oa-method oa-method--small" :class="`oa-method--${r.method.toLowerCase()}`">{{ r.method === 'DELETE' ? 'DEL' : r.method }}</span>
        <code class="oa-bk__request-path">{{ pathOf(r) }}</code>
      </button>
      <UidButton size="sm" variant="ghost" :icon="Plus" @click="addRequest">{{ labels.addRequest }}</UidButton>
    </nav>

    <template v-if="req">
      <section class="oa-bk__section">
        <div class="oa-bk__line oa-bk__line--top">
          <UidFormField class="oa-bk__method" :label="labels.method">
            <UidSelect size="sm" :options="methods" :model-value="req.method" @update:model-value="(v: unknown) => (req.method = v as BlockMethod)" />
          </UidFormField>
          <UidInput class="oa-bk__url" size="sm" :label="labels.url" :hint="labels.urlHint" placeholder="https://api.example.com/users/{id}" :model-value="req.url" @update:model-value="setUrl" />
        </div>
        <UidInput size="sm" :label="labels.summary" v-model="req.summary" />
        <UidTextarea size="sm" :label="labels.description" :rows="2" auto-grow :max-rows="10" v-model="req.description" />
      </section>

      <section class="oa-bk__section">
        <h4 class="oa-bk__section-title">{{ labels.parameters }}</h4>
        <div v-if="req.params.length" class="oa-bk__params">
          <div v-for="(p, i) in req.params" :key="i" class="oa-bk__param">
            <div class="oa-bk__param-main">
              <UidSelect
                class="oa-bk__param-in"
                size="sm"
                :options="locations"
                :model-value="p.in"
                :disabled="p.in === 'path'"
                :aria-label="labels.parameters"
                @update:model-value="(v: unknown) => setLocation(i, v as ParamLocation)"
              />
              <UidInput class="oa-bk__param-name" size="sm" :placeholder="labels.name" :readonly="p.in === 'path'" v-model="p.name" />
              <UidSelect class="oa-bk__param-type" size="sm" searchable :options="typeOptions(p.type)" :model-value="p.type" @update:model-value="(v: unknown) => (p.type = String(v))" />
              <UidCheckbox class="oa-bk__param-req" :label="labels.required" :disabled="p.in === 'path'" v-model="p.required" />
              <span v-if="p.in === 'path'" class="oa-bk__param-tag" :title="labels.fromUrl">{{ labels.fromUrl }}</span>
              <button v-else type="button" class="oa-icon-button" :aria-label="labels.remove" :title="labels.remove" @click="req.params.splice(i, 1)">
                <X :size="14" aria-hidden="true" />
              </button>
            </div>
            <div class="oa-bk__param-more">
              <UidInput size="sm" :placeholder="labels.description" v-model="p.description" />
              <UidInput size="sm" :placeholder="`${labels.example}${exampleHint(p.type) ? `: ${exampleHint(p.type)}` : ''}`" v-model="p.example" />
            </div>
          </div>
        </div>
        <UidButton size="sm" variant="secondary" :icon="Plus" @click="addParam">{{ labels.addParameter }}</UidButton>
      </section>

      <section class="oa-bk__section">
        <h4 class="oa-bk__section-title">{{ labels.auth }}</h4>
        <OaBlockAuth
          :auth="req.auth"
          :labels="labels"
          :inherit-label="model.multiple && model.auth.kind !== 'inherit' ? labels.authInheritShared : labels.authInherit"
          :allow-none="model.multiple && model.auth.kind !== 'inherit'"
        />
      </section>

      <section class="oa-bk__section">
        <h4 class="oa-bk__section-title">{{ labels.body }}</h4>
        <UidButton v-if="!req.body.enabled" size="sm" variant="secondary" :icon="Plus" @click="addBody">{{ labels.addBody }}</UidButton>
        <template v-else>
          <div class="oa-bk__line">
            <UidFormField class="oa-bk__media" :label="labels.mediaType">
              <UidSelect size="sm" :options="mediaOptions(req.body.type)" :model-value="req.body.type" @update:model-value="(v: unknown) => (req.body.type = String(v))" />
            </UidFormField>
            <UidCheckbox class="oa-bk__body-req" :label="labels.required" v-model="req.body.required" />
            <UidButton class="oa-bk__body-remove" size="sm" variant="ghost" @click="req.body.enabled = false">{{ labels.remove }}</UidButton>
          </div>
          <UidInput size="sm" :placeholder="labels.description" v-model="req.body.description" />
          <div class="oa-segmented oa-bk__mode" role="radiogroup" :aria-label="labels.body">
            <button
              v-for="m in (['example', 'schema'] as const)"
              :key="m"
              type="button"
              role="radio"
              class="oa-segmented__item"
              :class="{ 'is-active': req.body.mode === m }"
              :aria-checked="req.body.mode === m"
              @click="setMode(m)"
            >
              {{ m === 'example' ? labels.exampleMode : labels.schemaMode }}
            </button>
          </div>
          <template v-if="req.body.mode === 'example'">
            <OaSourceEditor
              v-if="isStructuredMedia(req.body.type)"
              v-model="req.body.example"
              class="oa-bk__code"
              language="json"
              bare
              :fit="{ min: 3, max: 16 }"
              :aria-label="labels.exampleMode"
            />
            <UidTextarea v-else size="sm" class="oa-bk__mono" :rows="3" auto-grow :max-rows="16" v-model="req.body.example" />
            <p v-if="errorOf('body.example')" class="oa-bk__error">{{ errorOf('body.example') }}</p>
          </template>
          <template v-else>
            <OaSourceEditor v-model="req.body.schema" class="oa-bk__code" :language="format" bare :fit="{ min: 3, max: 16 }" :aria-label="labels.schemaMode" />
            <p v-if="errorOf('body.schema')" class="oa-bk__error">{{ errorOf('body.schema') }}</p>
          </template>
        </template>
      </section>

      <section class="oa-bk__section">
        <h4 class="oa-bk__section-title">{{ labels.responses }}</h4>
        <div v-for="(res, i) in req.responses" :key="i" class="oa-bk__response">
          <div class="oa-bk__response-main">
            <UidInput class="oa-bk__status" size="sm" :placeholder="labels.status" :aria-label="labels.status" v-model="res.status" />
            <UidInput class="oa-bk__grow" size="sm" :placeholder="labels.description" v-model="res.description" />
            <UidButton class="oa-bk__example-toggle" :class="{ 'is-on': openExample.has(i) }" size="sm" variant="ghost" :icon="Braces" :title="labels.example" :aria-label="labels.example" :aria-expanded="openExample.has(i)" @click="toggleExample(i)" />
            <button type="button" class="oa-icon-button" :aria-label="labels.remove" :title="labels.remove" @click="req.responses.splice(i, 1)">
              <X :size="14" aria-hidden="true" />
            </button>
          </div>
          <template v-if="openExample.has(i)">
            <OaSourceEditor v-model="res.example" class="oa-bk__code" language="json" bare :fit="{ min: 3, max: 14 }" :aria-label="labels.example" />
            <p v-if="errorOf(`responses.${i}.example`)" class="oa-bk__error">{{ errorOf(`responses.${i}.example`) }}</p>
          </template>
        </div>
        <UidButton size="sm" variant="secondary" :icon="Plus" @click="addResponse">{{ labels.addResponse }}</UidButton>
      </section>

      <footer class="oa-bk__footer">
        <UidButton v-if="!model.multiple" size="sm" variant="ghost" :icon="Plus" @click="addRequest">{{ labels.addRequest }}</UidButton>
        <UidButton v-else-if="model.requests.length > 1" size="sm" variant="ghost" @click="removeRequest(current)">{{ labels.removeRequest }}</UidButton>
      </footer>
    </template>
  </div>
</template>
