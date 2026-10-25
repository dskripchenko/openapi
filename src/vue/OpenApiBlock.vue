<script setup lang="ts">
/**
 * OpenApiBlock — an "API block" of rich content: the text of a fenced
 * ```openapi block (compact requests or a whole OpenAPI document, YAML or
 * JSON) shown as live API cards.
 *
 * Read-only, it is the preview: every operation as OpenApiOperation's compact
 * card, with try-it, samples and types. Editable, three tabs over one text:
 *   - Preview: the cards;
 *   - Source: the text, with a YAML/JSON switch that converts it and the
 *     parse error by line;
 *   - Constructor: a form of the requests. Its edits rewrite the text after
 *     a short pause; what the form cannot express stays as written.
 *
 * `source` is the text; edits come out as `update:source`, in the format the
 * text is in.
 */
import { computed, h, ref, shallowRef, watch, type VNode } from 'vue'
import { UidAlert, UidButton, UidLocaleProvider, UidTab, UidTabPanel, UidTabs, en as uidEn, ru as uidRu } from '@dskripchenko/ui'
import {
  blockToModel,
  modelToBlock,
  parseBlock,
  stringifyBlock,
  syncOrigins,
  type BlockFormat,
  type BlockModel,
  type BlockModelError,
} from '../blocks'
import { detectFormat } from '../json'
import type { SendFn } from '../request'
import type { SnippetTarget } from '../snippets'
import OaBlockConstructor from './blocks/OaBlockConstructor.vue'
import OaBlockPreview from './blocks/OaBlockPreview.vue'
import { BLOCK_LOCALES, blockEn, type BlockLabels } from './blocks/labels'
import OaSourceEditor from './editor/OaSourceEditor.vue'
import type { OpenApiLabels } from './labels'

export type BlockTab = 'preview' | 'source' | 'constructor'

const props = withDefaults(
  defineProps<{
    /** The block's text: YAML or JSON. */
    source: string
    /** Preview, Source and Constructor tabs; read-only shows the preview alone. */
    editable?: boolean
    /** The tab an editable block opens with. */
    tab?: BlockTab
    /** Interface language: 'en' or 'ru' (also sets the kit's locale inside). */
    locale?: string
    /** Overrides of the cards' strings (the reference's labels). */
    labels?: Partial<OpenApiLabels>
    /** Overrides of the widget's own strings. */
    blockLabels?: Partial<BlockLabels>
    send?: SendFn
    tryIt?: boolean
    snippetTargets?: SnippetTarget[]
    defaultSnippet?: SnippetTarget
    baseUrl?: string
    persistCredentials?: boolean | 'session' | 'local'
    oauthRedirectUrl?: string
    /** Milliseconds between the last constructor edit and `update:source`. */
    debounce?: number
  }>(),
  {
    editable: false,
    tab: 'preview',
    locale: undefined,
    labels: () => ({}),
    blockLabels: () => ({}),
    send: undefined,
    tryIt: true,
    snippetTargets: undefined,
    defaultSnippet: undefined,
    baseUrl: undefined,
    persistCredentials: false,
    oauthRedirectUrl: undefined,
    debounce: 300,
  },
)
const emit = defineEmits<{ 'update:source': [source: string] }>()

const bl = computed<BlockLabels>(() => ({ ...(BLOCK_LOCALES[props.locale ?? 'en'] ?? blockEn), ...props.blockLabels }))
const kitLocale = computed(() => (props.locale === 'ru' ? uidRu : props.locale === 'en' ? uidEn : undefined))

/* ----------------------------------- text ----------------------------------- */
const text = ref(props.source)
const parsed = computed(() => parseBlock(text.value))
/** The format edits are written in: the text's own; YAML for an empty block. */
const format = computed<BlockFormat>(() => (text.value.trim() ? detectFormat(text.value) : 'yaml'))
/** Bumped on each parse that reads, so the preview's cards start afresh. */
const version = ref(0)
watch(parsed, (r) => r.ok && version.value++)

// An outside change (the host's undo, another editor) replaces the text; the open tab stays.
watch(
  () => props.source,
  (s) => {
    if (s === text.value) return
    cancelCommit()
    text.value = s
  },
)

function setText(next: string): void {
  if (next === text.value) return
  text.value = next
  emit('update:source', next)
}

/* ---------------------------------- source ---------------------------------- */
function setFormat(f: BlockFormat): void {
  const r = parsed.value
  if (!r.ok || f === format.value) return
  cancelCommit()
  setText(stringifyBlock(r.data, f))
}

/* -------------------------------- constructor ------------------------------- */
const tab = ref<BlockTab>(props.tab)
watch(
  () => props.tab,
  (t) => (tab.value = t),
)
const model = ref<BlockModel | null>(null)
const modelErrors = shallowRef<BlockModelError[]>([])
/** The data the model was made from, or last written as: model edits patch it. */
let base: unknown
/** The text the constructor wrote: it does not rebuild the model. */
let ownText: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** The form follows the text while it is open; an empty block starts with one request. */
function rebuild(): void {
  const r = parsed.value
  if (!text.value.trim()) {
    base = undefined
    model.value = blockToModel({}, format.value)
  } else if (r.ok && r.kind === 'requests') {
    base = r.data
    model.value = blockToModel(r.data, r.format)
  } else model.value = null
  modelErrors.value = []
}
watch(
  [text, () => tab.value === 'constructor' && props.editable],
  ([t, open]) => {
    if (!open) return
    if (t === ownText && model.value) return
    rebuild()
  },
  { immediate: true },
)

watch(
  model,
  () => {
    if (!model.value) return
    clearTimeout(timer)
    timer = setTimeout(commit, props.debounce)
  },
  { deep: true },
)
function cancelCommit(): void {
  clearTimeout(timer)
  timer = undefined
}

/** Writes the form into the text, keeping the text's format. */
function commit(): void {
  timer = undefined
  const m = model.value
  if (!m) return
  const fmt = format.value
  const { data, errors } = modelToBlock(m, base, fmt)
  modelErrors.value = errors
  syncOrigins(m)
  // Nothing changed (the form was just rebuilt): the text keeps its comments and layout.
  if (base !== undefined && JSON.stringify(data) === JSON.stringify(base)) return
  base = data
  const next = stringifyBlock(data, fmt)
  ownText = next
  setText(next)
}

/** Writes pending constructor edits now (before the host saves, say). */
function flush(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    commit()
  }
}

const parseError = computed(() => (parsed.value.ok ? null : parsed.value.error))
const sourceLabels = computed(() => ({ issues: bl.value.issues, noIssues: bl.value.noIssues, parseError: bl.value.parseError }))
const previewProps = computed(() => ({
  result: parsed.value,
  source: text.value,
  labels: bl.value,
  version: version.value,
  locale: props.locale,
  cardLabels: props.labels,
  send: props.send,
  tryIt: props.tryIt,
  snippetTargets: props.snippetTargets,
  defaultSnippet: props.defaultSnippet,
  baseUrl: props.baseUrl,
  persistCredentials: props.persistCredentials,
  oauthRedirectUrl: props.oauthRedirectUrl,
}))

/**
 * The YAML / JSON switch. It sits in the tab bar; a narrow block has no room
 * there, so a second copy heads the panel instead (CSS shows one of them).
 */
const FormatToggle = (): VNode =>
  h(
    'div',
    { class: 'oa-segmented oa-bk__format', role: 'radiogroup', 'aria-label': 'YAML / JSON' },
    (['yaml', 'json'] as const).map((f) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: ['oa-segmented__item', { 'is-active': format.value === f }],
          'aria-checked': format.value === f,
          disabled: !parsed.value.ok,
          onClick: () => setFormat(f),
        },
        f.toUpperCase(),
      ),
    ),
  )

defineExpose({ tab, text, parsed, flush })
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
    <div class="oa-bk" :class="{ 'oa-bk--editable': editable }">
      <OaBlockPreview v-if="!editable" v-bind="previewProps" />
      <UidTabs v-else v-model="tab" class="oa-bk__tabs">
        <template #list>
          <UidTab value="preview">{{ bl.preview }}</UidTab>
          <UidTab value="source">{{ bl.source }}<span v-if="parseError" class="oa-bk__dot" :title="bl.parseError" /></UidTab>
          <UidTab value="constructor">{{ bl.constructorTab }}</UidTab>
          <FormatToggle v-if="tab !== 'preview'" class="oa-bk__format--bar" />
        </template>
        <UidTabPanel value="preview">
          <OaBlockPreview v-bind="previewProps" />
        </UidTabPanel>
        <UidTabPanel value="source">
          <FormatToggle class="oa-bk__format--panel" />
          <OaSourceEditor
            class="oa-bk__source"
            :model-value="text"
            :language="format"
            :parse-error="parseError"
            :labels="sourceLabels"
            :fit="{ min: 8, max: 30 }"
            :aria-label="bl.source"
            @update:model-value="(t: string) => (cancelCommit(), setText(t))"
          />
        </UidTabPanel>
        <UidTabPanel value="constructor">
          <FormatToggle v-if="model" class="oa-bk__format--panel" />
          <OaBlockConstructor v-if="model" :model="model" :labels="bl" :format="format" :errors="modelErrors" />
          <UidAlert v-else-if="parsed.ok" variant="info">
            {{ bl.documentKind }}
            <UidButton size="sm" variant="secondary" @click="tab = 'source'">{{ bl.openSource }}</UidButton>
          </UidAlert>
          <UidAlert v-else variant="warning" :title="bl.parseError">
            {{ bl.fixInSource }}
            <UidButton size="sm" variant="secondary" @click="tab = 'source'">{{ bl.openSource }}</UidButton>
          </UidAlert>
        </UidTabPanel>
      </UidTabs>
    </div>
  </component>
</template>

<style src="./openapi.css"></style>
