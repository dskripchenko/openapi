<script setup lang="ts">
/**
 * A schema as a form, recursive: the kind (a type, a reference to a named
 * schema, or a composition), its constraints, and — for objects and arrays —
 * the nested schemas of properties and items. Edits land in the schema
 * object itself; the editor writes the file after them.
 */
import { computed, ref } from 'vue'
import { UidButton, UidCheckbox, UidInput, UidSelect, UidTagsInput, UidTextarea } from '@dskripchenko/ui'
import { useEditor } from './context'
import { bind, renameKey, setField, type Doc } from './state'

defineOptions({ name: 'OaEditSchema' })

const props = withDefaults(
  defineProps<{
    schema: Doc
    depth?: number
    /** Leaves the description out — a parameter has its own. */
    hideDescription?: boolean
  }>(),
  { depth: 0, hideDescription: false },
)
const { labels, schemaNames, is31 } = useEditor()

type Kind = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'ref' | 'oneOf' | 'anyOf' | 'allOf' | 'any'
const KINDS: Kind[] = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'ref', 'oneOf', 'anyOf', 'allOf', 'any']
const FORMATS: Record<string, string[]> = {
  string: ['', 'date-time', 'date', 'time', 'duration', 'email', 'uri', 'uuid', 'hostname', 'ipv4', 'ipv6', 'byte', 'binary', 'password'],
  integer: ['', 'int32', 'int64'],
  number: ['', 'float', 'double'],
}

const baseType = computed<string | undefined>(() => {
  const t = props.schema.type
  return Array.isArray(t) ? t.find((x: string) => x !== 'null') : t
})
const kind = computed<Kind>(() => {
  const s = props.schema
  if (s.$ref) return 'ref'
  if (s.oneOf) return 'oneOf'
  if (s.anyOf) return 'anyOf'
  if (s.allOf) return 'allOf'
  return (baseType.value as Kind | undefined) ?? (s.properties ? 'object' : 'any')
})

const nullable = computed<boolean>({
  get: () => (Array.isArray(props.schema.type) ? props.schema.type.includes('null') : !!props.schema.nullable),
  set: (on) => {
    const s = props.schema
    if (!is31.value) return setField(s, 'nullable', on ? true : undefined)
    const t = baseType.value
    if (!t) return
    s.type = on ? [t, 'null'] : t
  },
})

const KEEP = new Set(['description', 'title', 'deprecated', 'readOnly', 'writeOnly', 'example', 'examples', 'externalDocs'])
function setKind(next: unknown): void {
  const k = next as Kind
  const s = props.schema
  const wasNull = nullable.value
  for (const key of Object.keys(s)) if (!KEEP.has(key)) delete s[key]
  if (k === 'ref') s.$ref = `#/components/schemas/${schemaNames.value[0] ?? 'Model'}`
  else if (k === 'oneOf' || k === 'anyOf' || k === 'allOf') s[k] = [{ type: 'string' }]
  else if (k !== 'any') {
    s.type = wasNull && is31.value ? [k, 'null'] : k
    if (wasNull && !is31.value) s.nullable = true
    if (k === 'object') s.properties = {}
    if (k === 'array') s.items = { type: 'string' }
  }
}

const refName = computed({
  get: () => String(props.schema.$ref ?? '').split('/').pop() ?? '',
  set: (name: string) => (props.schema.$ref = `#/components/schemas/${name}`),
})

/* -------------------------------- properties ------------------------------- */
const properties = computed(() => Object.keys(props.schema.properties ?? {}))
const open = ref<Record<string, boolean>>({})
function isRequired(name: string): boolean {
  return (props.schema.required ?? []).includes(name)
}
function setRequired(name: string, on: boolean): void {
  const list: string[] = [...(props.schema.required ?? [])].filter((n) => n !== name)
  if (on) list.push(name)
  setField(props.schema, 'required', list)
}
function addProperty(): void {
  props.schema.properties ??= {}
  let i = properties.value.length + 1
  while (`field${i}` in props.schema.properties) i++
  props.schema.properties[`field${i}`] = { type: 'string' }
  open.value[`field${i}`] = true
}
function removeProperty(name: string): void {
  delete props.schema.properties[name]
  setRequired(name, false)
}
function renameProperty(from: string, to: string): void {
  if (!renameKey(props.schema.properties, from, to.trim())) return
  if (isRequired(from)) {
    setField(props.schema, 'required', (props.schema.required as string[]).map((n) => (n === from ? to.trim() : n)))
  }
  open.value[to.trim()] = open.value[from] ?? false
}

/* --------------------------------- variants -------------------------------- */
const variants = computed<Doc[] | undefined>(() => props.schema.oneOf ?? props.schema.anyOf ?? props.schema.allOf)

/* ----------------------------------- enum ---------------------------------- */
const enumValues = computed<string[]>({
  get: () => (props.schema.enum ?? []).map((v: unknown) => String(v)),
  set: (list) => {
    const numeric = kind.value === 'integer' || kind.value === 'number'
    setField(props.schema, 'enum', list.map((v) => (numeric && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)))
  },
})

function numberField(key: string) {
  return {
    modelValue: props.schema[key] === undefined ? '' : String(props.schema[key]),
    'onUpdate:modelValue': (v: string) => setField(props.schema, key, v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)),
  }
}

const exampleText = computed({
  get: () => (props.schema.example === undefined ? '' : typeof props.schema.example === 'string' ? props.schema.example : JSON.stringify(props.schema.example)),
  set: (text: string) => {
    let value: unknown = text
    if (kind.value !== 'string') {
      try {
        value = JSON.parse(text)
      } catch {
        value = text
      }
    }
    setField(props.schema, 'example', text === '' ? undefined : value)
  },
})
</script>

<template>
  <div class="oa-es" :class="`oa-es--depth-${Math.min(depth, 3)}`">
    <div class="oa-es__row">
      <UidSelect
        class="oa-es__kind"
        size="sm"
        :options="KINDS.map((k) => ({ value: k, label: k === 'ref' ? '$ref' : k === 'any' ? labels.any : k }))"
        :model-value="kind"
        @update:model-value="setKind"
      />
      <UidSelect
        v-if="kind === 'ref'"
        class="oa-es__ref"
        size="sm"
        searchable
        :options="schemaNames.map((n) => ({ value: n, label: n }))"
        :model-value="refName"
        @update:model-value="(v: unknown) => (refName = String(v))"
      />
      <UidSelect
        v-if="FORMATS[kind]"
        class="oa-es__format"
        size="sm"
        :placeholder="labels.format"
        :options="FORMATS[kind]!.map((f) => ({ value: f, label: f || '—' }))"
        :model-value="schema.format ?? ''"
        @update:model-value="(v: unknown) => setField(schema, 'format', v || undefined)"
      />
      <UidCheckbox v-if="kind !== 'ref' && kind !== 'any' && !variants" v-model="nullable" :label="labels.nullable" />
    </div>

    <UidTextarea v-if="kind !== 'ref' && !hideDescription" size="sm" :rows="1" auto-grow :placeholder="labels.description" v-bind="bind(schema, 'description')" />

    <div v-if="['string', 'integer', 'number'].includes(kind)" class="oa-es__grid">
      <template v-if="kind === 'string'">
        <UidInput size="sm" :label="labels.minLength" v-bind="numberField('minLength')" />
        <UidInput size="sm" :label="labels.maxLength" v-bind="numberField('maxLength')" />
        <UidInput size="sm" :label="labels.pattern" v-bind="bind(schema, 'pattern')" />
      </template>
      <template v-else>
        <UidInput size="sm" :label="labels.minimum" v-bind="numberField('minimum')" />
        <UidInput size="sm" :label="labels.maximum" v-bind="numberField('maximum')" />
      </template>
      <UidInput size="sm" :label="labels.default" v-bind="bind(schema, 'default')" />
      <UidInput size="sm" :label="labels.example" :model-value="exampleText" @update:model-value="(v: string) => (exampleText = v)" />
    </div>
    <UidTagsInput v-if="['string', 'integer', 'number'].includes(kind)" size="sm" :label="labels.enumValues" v-model="enumValues" />

    <div v-if="kind === 'array'" class="oa-es__nested">
      <div class="oa-es__nested-title">{{ labels.items }}</div>
      <div class="oa-es__grid">
        <UidInput size="sm" :label="labels.minItems" v-bind="numberField('minItems')" />
        <UidInput size="sm" :label="labels.maxItems" v-bind="numberField('maxItems')" />
      </div>
      <OaEditSchema v-if="schema.items" :schema="schema.items" :depth="depth + 1" />
      <UidButton v-else size="sm" variant="secondary" @click="schema.items = { type: 'string' }">{{ labels.items }}</UidButton>
    </div>

    <div v-if="kind === 'object'" class="oa-es__nested">
      <div class="oa-es__nested-title">{{ labels.properties }}</div>
      <div v-for="name in properties" :key="name" class="oa-es__prop">
        <div class="oa-es__row">
          <button type="button" class="oa-schema__toggle" :aria-expanded="!!open[name]" @click="open[name] = !open[name]">
            <span class="oa-schema__chevron" :class="{ 'is-open': open[name] }" aria-hidden="true">›</span>
          </button>
          <UidInput class="oa-es__prop-name" size="sm" :model-value="name" @blur="(e: FocusEvent) => renameProperty(name, (e.target as HTMLInputElement).value)" />
          <span class="oa-schema__type">{{ schema.properties[name].$ref ? schema.properties[name].$ref.split('/').pop() : schema.properties[name].type ?? '' }}</span>
          <UidCheckbox :model-value="isRequired(name)" :label="labels.required" @update:model-value="(v: boolean) => setRequired(name, v)" />
          <UidButton size="sm" variant="ghost" @click="removeProperty(name)">{{ labels.remove }}</UidButton>
        </div>
        <OaEditSchema v-if="open[name]" :schema="schema.properties[name]" :depth="depth + 1" />
      </div>
      <UidButton size="sm" variant="secondary" @click="addProperty">{{ labels.addProperty }}</UidButton>
    </div>

    <div v-if="variants" class="oa-es__nested">
      <div class="oa-es__nested-title">{{ labels.variants }}</div>
      <div v-for="(v, i) in variants" :key="i" class="oa-es__prop">
        <div class="oa-es__row">
          <span class="oa-schema__type">#{{ i + 1 }}</span>
          <UidButton v-if="variants.length > 1" size="sm" variant="ghost" @click="variants.splice(i, 1)">{{ labels.remove }}</UidButton>
        </div>
        <OaEditSchema :schema="v" :depth="depth + 1" />
      </div>
      <UidButton size="sm" variant="secondary" @click="variants.push({ type: 'string' })">{{ labels.addVariant }}</UidButton>
    </div>
  </div>
</template>
