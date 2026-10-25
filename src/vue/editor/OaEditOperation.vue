<script setup lang="ts">
/** One operation as a form: what it is, its parameters, body, responses and security. */
import { computed, ref } from 'vue'
import { UidButton, UidCheckbox, UidInput, UidSelect, UidTagsInput, UidTextarea } from '@dskripchenko/ui'
import { useEditor } from './context'
import { bind, renameKey, setField, type Doc } from './state'
import OaEditContent from './OaEditContent.vue'
import OaEditSchema from './OaEditSchema.vue'

const props = defineProps<{ path: string; method: string }>()
const { editor, labels } = useEditor()

const op = computed<Doc>(() => editor.doc.value!.paths[props.path][props.method])

const tags = computed<string[]>({
  get: () => op.value.tags ?? [],
  set: (list) => setField(op.value, 'tags', list),
})

/* -------------------------------- parameters ------------------------------- */
const params = computed<Doc[]>(() => op.value.parameters ?? [])
const openParam = ref<number | null>(null)
function addParameter(): void {
  op.value.parameters ??= []
  op.value.parameters.push({ name: `param${op.value.parameters.length + 1}`, in: 'query', schema: { type: 'string' } })
  openParam.value = op.value.parameters.length - 1
}
function setIn(p: Doc, where: unknown): void {
  p.in = where
  if (where === 'path') p.required = true
}
/** Names in the path template without a parameter yet: offered as one click. */
const missingPathParams = computed(() => {
  const names = [...props.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
  const declared = new Set(
    [...params.value, ...(editor.doc.value!.paths[props.path].parameters ?? [])].filter((p: Doc) => p.in === 'path').map((p: Doc) => p.name),
  )
  return names.filter((n) => !declared.has(n))
})
function addPathParam(name: string): void {
  op.value.parameters ??= []
  op.value.parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } })
}

/* ------------------------------- request body ------------------------------ */
function addBody(): void {
  op.value.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', properties: {} } } } }
}

/* -------------------------------- responses -------------------------------- */
const codes = computed(() => Object.keys(op.value.responses ?? {}))
const openCode = ref<string | null>(codes.value[0] ?? null)
const newCode = ref('')
function addResponse(): void {
  const code = newCode.value.trim() || (codes.value.includes('200') ? 'default' : '200')
  op.value.responses ??= {}
  if (!(code in op.value.responses)) op.value.responses[code] = { description: code === 'default' ? 'Error' : 'OK' }
  openCode.value = code
  newCode.value = ''
}
function renameCode(from: string, to: string): void {
  if (renameKey(op.value.responses, from, to.trim()) && openCode.value === from) openCode.value = to.trim()
}

/* --------------------------------- security -------------------------------- */
const schemeNames = computed(() => Object.keys(editor.doc.value!.components?.securitySchemes ?? {}))
const securityMode = computed({
  get: () => (op.value.security === undefined ? 'inherit' : op.value.security.length === 0 ? 'none' : 'custom'),
  set: (mode: string) => {
    if (mode === 'inherit') delete op.value.security
    else if (mode === 'none') op.value.security = []
    else op.value.security = schemeNames.value[0] ? [{ [schemeNames.value[0]]: [] }] : []
  },
})
const chosenSchemes = computed<string[]>({
  get: () => (op.value.security ?? []).flatMap((r: Doc) => Object.keys(r)),
  set: (names) => (op.value.security = names.map((n) => ({ [n]: [] }))),
})
</script>

<template>
  <div class="oa-ef">
    <div class="oa-ef__title">
      <span class="oa-method" :class="`oa-method--${method}`">{{ method.toUpperCase() }}</span>
      <code class="oa-op__path">{{ path }}</code>
    </div>
    <div class="oa-es__grid">
      <UidInput size="sm" :label="labels.summary" v-bind="bind(op, 'summary')" />
      <UidInput size="sm" :label="labels.operationId" v-bind="bind(op, 'operationId')" />
    </div>
    <UidTagsInput size="sm" :label="labels.operationTags" v-model="tags" />
    <UidTextarea size="sm" :label="labels.description" :rows="3" auto-grow v-bind="bind(op, 'description')" />
    <UidCheckbox :model-value="!!op.deprecated" :label="labels.deprecated" @update:model-value="(v: boolean) => setField(op, 'deprecated', v || undefined)" />

    <section class="oa-ef__section">
      <h4 class="oa-block__title">{{ labels.parameters }}</h4>
      <div v-if="missingPathParams.length" class="oa-ef__hint">
        <UidButton v-for="n in missingPathParams" :key="n" size="sm" variant="secondary" @click="addPathParam(n)">+ {{ n }} (path)</UidButton>
      </div>
      <div v-for="(p, i) in params" :key="i" class="oa-es__prop">
        <div class="oa-es__row">
          <button type="button" class="oa-schema__toggle" :aria-expanded="openParam === i" @click="openParam = openParam === i ? null : i">
            <span class="oa-schema__chevron" :class="{ 'is-open': openParam === i }" aria-hidden="true">›</span>
          </button>
          <template v-if="p.$ref"><code class="oa-schema__name">{{ p.$ref }}</code></template>
          <template v-else>
            <UidInput class="oa-es__prop-name" size="sm" v-bind="bind(p, 'name')" />
            <UidSelect
              class="oa-ef__in"
              size="sm"
              :options="['query', 'path', 'header', 'cookie'].map((x) => ({ value: x, label: x }))"
              :model-value="p.in"
              @update:model-value="(v: unknown) => setIn(p, v)"
            />
            <UidCheckbox :model-value="!!p.required" :disabled="p.in === 'path'" :label="labels.required" @update:model-value="(v: boolean) => setField(p, 'required', v || undefined)" />
          </template>
          <UidButton size="sm" variant="ghost" @click="params.splice(i, 1); setField(op, 'parameters', params)">{{ labels.remove }}</UidButton>
        </div>
        <div v-if="openParam === i && !p.$ref" class="oa-es__nested">
          <UidTextarea size="sm" :rows="1" auto-grow :placeholder="labels.description" v-bind="bind(p, 'description')" />
          <OaEditSchema v-if="p.schema" :schema="p.schema" :depth="1" hide-description />
          <UidButton v-else size="sm" variant="secondary" @click="p.schema = { type: 'string' }">{{ labels.type }}</UidButton>
        </div>
      </div>
      <UidButton size="sm" variant="secondary" @click="addParameter">{{ labels.addParameter }}</UidButton>
    </section>

    <section class="oa-ef__section">
      <h4 class="oa-block__title">{{ labels.requestBody }}</h4>
      <template v-if="op.requestBody && !op.requestBody.$ref">
        <div class="oa-es__row">
          <UidCheckbox :model-value="!!op.requestBody.required" :label="labels.required" @update:model-value="(v: boolean) => setField(op.requestBody, 'required', v || undefined)" />
          <UidButton size="sm" variant="ghost" @click="delete op.requestBody">{{ labels.remove }}</UidButton>
        </div>
        <UidTextarea size="sm" :rows="1" auto-grow :placeholder="labels.description" v-bind="bind(op.requestBody, 'description')" />
        <OaEditContent :owner="op.requestBody" />
      </template>
      <code v-else-if="op.requestBody?.$ref" class="oa-schema__name">{{ op.requestBody.$ref }}</code>
      <UidButton v-else size="sm" variant="secondary" @click="addBody">{{ labels.requestBody }}</UidButton>
    </section>

    <section class="oa-ef__section">
      <h4 class="oa-block__title">{{ labels.responses }}</h4>
      <div v-for="code in codes" :key="code" class="oa-es__prop">
        <div class="oa-es__row">
          <button type="button" class="oa-schema__toggle" :aria-expanded="openCode === code" @click="openCode = openCode === code ? null : code">
            <span class="oa-schema__chevron" :class="{ 'is-open': openCode === code }" aria-hidden="true">›</span>
          </button>
          <UidInput class="oa-ef__code" size="sm" :model-value="code" @blur="(e: FocusEvent) => renameCode(code, (e.target as HTMLInputElement).value)" />
          <template v-if="!op.responses[code].$ref">
            <UidInput class="oa-ef__grow" size="sm" :placeholder="labels.description" v-bind="bind(op.responses[code], 'description')" />
          </template>
          <code v-else class="oa-schema__name">{{ op.responses[code].$ref }}</code>
          <UidButton size="sm" variant="ghost" @click="delete op.responses[code]">{{ labels.remove }}</UidButton>
        </div>
        <div v-if="openCode === code && !op.responses[code].$ref" class="oa-es__nested">
          <OaEditContent :owner="op.responses[code]" />
        </div>
      </div>
      <div class="oa-es__row">
        <UidInput class="oa-ef__code" size="sm" placeholder="404" v-model="newCode" @keydown.enter.prevent="addResponse" />
        <UidButton size="sm" variant="secondary" @click="addResponse">{{ labels.addResponse }}</UidButton>
      </div>
    </section>

    <section v-if="schemeNames.length" class="oa-ef__section">
      <h4 class="oa-block__title">{{ labels.security }}</h4>
      <UidSelect
        size="sm"
        :options="[
          { value: 'inherit', label: labels.inheritSecurity },
          { value: 'none', label: labels.noSecurity },
          { value: 'custom', label: labels.security },
        ]"
        :model-value="securityMode"
        @update:model-value="(v: unknown) => (securityMode = String(v))"
      />
      <UidSelect
        v-if="securityMode === 'custom'"
        size="sm"
        multiple
        :options="schemeNames.map((n) => ({ value: n, label: n }))"
        :model-value="chosenSchemes"
        @update:model-value="(v: unknown) => (chosenSchemes = (v as string[]))"
      />
    </section>
  </div>
</template>
