<script setup lang="ts">
/**
 * OpenApiEditor — builds and edits an OpenAPI spec.
 *
 * Three views over one document, like the WYSIWYG editor's source mode:
 *   - Visual: a tree of the document (info, servers, tags, security, paths
 *     and their operations, schemas) and a form for the chosen node;
 *   - Source: the YAML or JSON text with highlighting, line numbers and the
 *     problems found, each jumping to its line;
 *   - Preview: the document as the reference shows it.
 *
 * v-model is the text. Its format is kept: a YAML file is edited as YAML.
 * Visual edits rewrite the text (comments in YAML do not survive them); the
 * source view edits the text as is.
 */
import { computed, provide, reactive, ref, watch } from 'vue'
import { UidAlert, UidButton, UidInput, UidSelect } from '@dskripchenko/ui'
import { UidLocaleProvider, en as uidEn, ru as uidRu } from '@dskripchenko/ui'
import type { SendFn } from '../request'
import { editorKey, type EditorContext } from './editor/context'
import { EDITOR_LOCALES, editorEn, type EditorLabels } from './editor/labels'
import { autoCommit, METHODS, renameKey, useEditorDoc, type Doc, type Selection } from './editor/state'
import OaEditInfo from './editor/OaEditInfo.vue'
import OaEditOperation from './editor/OaEditOperation.vue'
import OaEditScheme from './editor/OaEditScheme.vue'
import OaEditSchema from './editor/OaEditSchema.vue'
import OaEditServers from './editor/OaEditServers.vue'
import OaEditTags from './editor/OaEditTags.vue'
import OaSourceEditor from './editor/OaSourceEditor.vue'
import OpenApiReference from './OpenApiReference.vue'

type View = 'visual' | 'source' | 'preview'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** The view to open with. */
    view?: View
    /** Interface language: 'en' or 'ru' (also sets the kit's locale inside). */
    locale?: string
    /** Overrides of single editor strings. */
    labels?: Partial<EditorLabels>
    /** Passed to the preview's try-it. */
    send?: SendFn
    /** Format for a document created from scratch. */
    newFormat?: 'yaml' | 'json'
  }>(),
  { view: 'visual', locale: undefined, labels: () => ({}), send: undefined, newFormat: 'yaml' },
)
const emit = defineEmits<{ 'update:modelValue': [text: string] }>()

const editor = useEditorDoc(props.modelValue, (text) => emit('update:modelValue', text)) as ReturnType<typeof useEditorDoc> & {
  readonly lastEmitted: string
}
autoCommit(editor)

watch(
  () => props.modelValue,
  (text) => {
    if (text !== editor.text.value && text !== editor.lastEmitted) editor.setText(text)
  },
)

const labels = computed<EditorLabels>(() => ({ ...(EDITOR_LOCALES[props.locale ?? 'en'] ?? editorEn), ...props.labels }))
const kitLocale = computed(() => (props.locale === 'ru' ? uidRu : props.locale === 'en' ? uidEn : undefined))

const ctx: EditorContext = {
  editor,
  labels,
  schemaNames: computed(() => Object.keys(editor.doc.value?.components?.schemas ?? {})),
  is31: computed(() => String(editor.doc.value?.openapi ?? '').startsWith('3.1')),
}
provide(editorKey, ctx)

const view = ref<View>(props.view)
const isSwagger2 = computed(() => editor.family.value === 'swagger2')
const canVisual = computed(() => !!editor.doc.value && !editor.parseError.value && !isSwagger2.value)
const errorCount = computed(() => editor.issues.value.filter((i) => i.severity === 'error').length + (editor.parseError.value ? 1 : 0))

/* ---------------------------------- source ---------------------------------- */
function onSource(text: string): void {
  editor.setText(text, { lazy: true })
  emit('update:modelValue', text)
}

/* ----------------------------------- tree ----------------------------------- */
const doc = computed<Doc | null>(() => editor.doc.value)
const sel = editor.selection
const isSel = (s: Selection): boolean => JSON.stringify(s) === JSON.stringify(sel.value)
const paths = computed(() => Object.keys(doc.value?.paths ?? {}))
const methodsOf = (path: string): string[] => METHODS.filter((m) => doc.value?.paths?.[path]?.[m])
const schemaNames = ctx.schemaNames
const schemeNames = computed(() => Object.keys(doc.value?.components?.securitySchemes ?? {}))

function uniqueKey(obj: Doc, base: string): string {
  if (!(base in obj)) return base
  let i = 2
  while (`${base}${i}` in obj) i++
  return `${base}${i}`
}
function addPath(): void {
  const d = doc.value!
  d.paths ??= {}
  const path = uniqueKey(d.paths, '/resource')
  d.paths[path] = { get: { summary: '', responses: { '200': { description: 'OK' } } } }
  sel.value = { kind: 'operation', path, method: 'get' }
}
function addSchema(): void {
  const d = doc.value!
  d.components ??= {}
  d.components.schemas ??= {}
  const name = uniqueKey(d.components.schemas, 'Model')
  d.components.schemas[name] = { type: 'object', properties: {} }
  sel.value = { kind: 'schema', name }
}
function addScheme(): void {
  const d = doc.value!
  d.components ??= {}
  d.components.securitySchemes ??= {}
  const name = uniqueKey(d.components.securitySchemes, 'bearerAuth')
  d.components.securitySchemes[name] = { type: 'http', scheme: 'bearer' }
  sel.value = { kind: 'scheme', name }
}

/* ------------------------------ path and schema ----------------------------- */
const newMethodChoice = ref<string>('')
/** The method offered for a new operation: the user's pick, else the first one the path lacks. */
const newMethod = computed<string>({
  get: () => {
    const s = sel.value
    const item = s.kind === 'path' ? (doc.value?.paths?.[s.path] ?? {}) : {}
    if (newMethodChoice.value && !item[newMethodChoice.value]) return newMethodChoice.value
    return METHODS.find((m) => !item[m]) ?? ''
  },
  set: (m) => (newMethodChoice.value = m),
})
function addOperation(path: string): void {
  const item = doc.value!.paths[path]
  const method = METHODS.find((m) => m === newMethod.value && !item[m]) ?? METHODS.find((m) => !item[m])
  if (!method) return
  item[method] = { summary: '', responses: { '200': { description: 'OK' } } }
  sel.value = { kind: 'operation', path, method }
}
function renamePath(from: string, to: string): void {
  const next = to.trim()
  if (!next.startsWith('/')) return
  if (renameKey(doc.value!.paths, from, next)) sel.value = { kind: 'path', path: next }
}
function removePath(path: string): void {
  delete doc.value!.paths[path]
  sel.value = { kind: 'info' }
}
function removeOperation(path: string, method: string): void {
  delete doc.value!.paths[path][method]
  sel.value = { kind: 'path', path }
}
function renameSchema(from: string, to: string): void {
  const next = to.trim()
  if (!/^[A-Za-z0-9._-]+$/.test(next)) return
  if (!renameKey(doc.value!.components.schemas, from, next)) return
  // References to the schema follow the new name.
  const before = `#/components/schemas/${from}`
  const after = `#/components/schemas/${next}`
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Doc
      if (o.$ref === before) o.$ref = after
      Object.values(o).forEach(walk)
    }
  }
  walk(doc.value)
  sel.value = { kind: 'schema', name: next }
}
function removeSchema(name: string): void {
  delete doc.value!.components.schemas[name]
  sel.value = { kind: 'info' }
}
/** The footer's remove button: the chosen operation or security scheme. */
function removeCurrent(): void {
  const s = sel.value
  if (s.kind === 'operation') removeOperation(s.path, s.method)
  else if (s.kind === 'scheme') removeScheme(s.name)
}
function removeScheme(name: string): void {
  delete doc.value!.components.securitySchemes[name]
  sel.value = { kind: 'info' }
}

/** A selection pointing at something deleted (an undo in the source) falls back to info. */
watch([doc, () => editor.text.value], () => {
  const s = sel.value
  const d = doc.value
  if (!d) return
  const gone =
    (s.kind === 'path' && !d.paths?.[s.path]) ||
    (s.kind === 'operation' && !d.paths?.[s.path]?.[s.method]) ||
    (s.kind === 'schema' && !d.components?.schemas?.[s.name]) ||
    (s.kind === 'scheme' && !d.components?.securitySchemes?.[s.name])
  if (gone) sel.value = { kind: 'info' }
})

/* ------------------------------- new document ------------------------------- */
function createDocument(): void {
  const text =
    props.newFormat === 'json'
      ? JSON.stringify({ openapi: '3.1.0', info: { title: labels.value.newDocumentTitle, version: '1.0.0' }, paths: {} }, null, 2)
      : `openapi: 3.1.0\ninfo:\n  title: ${labels.value.newDocumentTitle}\n  version: 1.0.0\npaths: {}\n`
  onSource(text)
}

/** The path or schema name being renamed; drafts are keyed by it until the field loses focus. */
const selKey = computed(() => (sel.value.kind === 'path' ? sel.value.path : sel.value.kind === 'schema' ? sel.value.name : ''))
const pathDraft = reactive<Record<string, string>>({})
const schemaDraft = reactive<Record<string, string>>({})
</script>

<template>
  <component :is="kitLocale ? UidLocaleProvider : 'div'" v-bind="kitLocale ? { locale: kitLocale } : { class: 'oa-locale-passthrough' }">
    <div class="oa-editor">
      <header class="oa-editor__bar">
        <div class="oa-segmented" role="tablist">
          <button
            v-for="v in (['visual', 'source', 'preview'] as View[])"
            :key="v"
            type="button"
            role="tab"
            class="oa-segmented__item"
            :class="{ 'is-active': view === v }"
            :aria-selected="view === v"
            @click="view = v"
          >
            {{ labels[v] }}
          </button>
        </div>
        <div v-if="editor.doc.value" class="oa-segmented">
          <button
            v-for="f in (['yaml', 'json'] as const)"
            :key="f"
            type="button"
            class="oa-segmented__item"
            :class="{ 'is-active': editor.format.value === f }"
            :disabled="!!editor.parseError.value"
            @click="editor.setFormat(f)"
          >
            {{ f.toUpperCase() }}
          </button>
        </div>
        <button type="button" class="oa-editor__issues" :class="{ 'has-errors': errorCount > 0 }" @click="view = 'source'">
          {{ errorCount ? `${labels.issues}: ${errorCount}` : labels.noIssues }}
        </button>
      </header>

      <div v-if="view === 'source'" class="oa-editor__body">
        <OaSourceEditor
          :model-value="editor.text.value"
          :language="editor.format.value"
          :issues="editor.issues.value"
          :parse-error="editor.parseError.value"
          :labels="labels"
          @update:model-value="onSource"
        />
      </div>

      <div v-else-if="view === 'preview'" class="oa-editor__body oa-editor__preview">
        <UidAlert v-if="editor.parseError.value" variant="danger" :title="labels.parseError">{{ editor.parseError.value.message }}</UidAlert>
        <OpenApiReference v-else-if="editor.doc.value" :spec="editor.text.value" :locale="locale" :send="send" :hash-navigation="false" />
      </div>

      <div v-else class="oa-editor__body">
        <UidAlert v-if="editor.parseError.value" variant="danger" :title="labels.parseError">
          {{ editor.parseError.value.message }}
          <UidButton size="sm" variant="secondary" @click="view = 'source'">{{ labels.source }}</UidButton>
        </UidAlert>
        <div v-else-if="!editor.doc.value" class="oa-editor__empty">
          <p>{{ labels.empty }}</p>
          <UidButton variant="primary" @click="createDocument">{{ labels.create }}</UidButton>
        </div>
        <UidAlert v-else-if="isSwagger2" variant="info">
          {{ labels.swagger2 }}
          <UidButton size="sm" variant="primary" @click="editor.convertTo31()">{{ labels.convert }}</UidButton>
        </UidAlert>

        <div v-if="canVisual && doc" class="oa-editor__visual">
          <nav class="oa-editor__tree">
            <button type="button" class="oa-tree__item" :class="{ 'is-active': isSel({ kind: 'info' }) }" @click="sel = { kind: 'info' }">{{ labels.info }}</button>
            <button type="button" class="oa-tree__item" :class="{ 'is-active': isSel({ kind: 'servers' }) }" @click="sel = { kind: 'servers' }">
              {{ labels.servers }} <span class="oa-tree__count">{{ doc.servers?.length ?? 0 }}</span>
            </button>
            <button type="button" class="oa-tree__item" :class="{ 'is-active': isSel({ kind: 'tags' }) }" @click="sel = { kind: 'tags' }">
              {{ labels.tags }} <span class="oa-tree__count">{{ doc.tags?.length ?? 0 }}</span>
            </button>

            <div class="oa-tree__section">
              <span>{{ labels.securitySchemes }}</span>
              <button type="button" class="oa-tree__add" :title="labels.addScheme" @click="addScheme">+</button>
            </div>
            <button
              v-for="n in schemeNames"
              :key="n"
              type="button"
              class="oa-tree__item oa-tree__item--nested"
              :class="{ 'is-active': isSel({ kind: 'scheme', name: n }) }"
              @click="sel = { kind: 'scheme', name: n }"
            >{{ n }}</button>

            <div class="oa-tree__section">
              <span>{{ labels.paths }}</span>
              <button type="button" class="oa-tree__add" :title="labels.addPath" @click="addPath">+</button>
            </div>
            <template v-for="p in paths" :key="p">
              <button type="button" class="oa-tree__item oa-tree__item--path" :class="{ 'is-active': isSel({ kind: 'path', path: p }) }" @click="sel = { kind: 'path', path: p }">
                <code>{{ p }}</code>
              </button>
              <button
                v-for="m in methodsOf(p)"
                :key="m"
                type="button"
                class="oa-tree__item oa-tree__item--nested"
                :class="{ 'is-active': isSel({ kind: 'operation', path: p, method: m }) }"
                @click="sel = { kind: 'operation', path: p, method: m }"
              >
                <span class="oa-method oa-method--small" :class="`oa-method--${m}`">{{ m === 'delete' ? 'DEL' : m.toUpperCase() }}</span>
                <span class="oa-nav__label">{{ doc.paths[p][m].summary || doc.paths[p][m].operationId || '' }}</span>
              </button>
            </template>

            <div class="oa-tree__section">
              <span>{{ labels.schemas }}</span>
              <button type="button" class="oa-tree__add" :title="labels.addSchema" @click="addSchema">+</button>
            </div>
            <button
              v-for="n in schemaNames"
              :key="n"
              type="button"
              class="oa-tree__item oa-tree__item--nested"
              :class="{ 'is-active': isSel({ kind: 'schema', name: n }) }"
              @click="sel = { kind: 'schema', name: n }"
            >{{ n }}</button>
          </nav>

          <section class="oa-editor__form">
            <OaEditInfo v-if="sel.kind === 'info'" />
            <OaEditServers v-else-if="sel.kind === 'servers'" />
            <OaEditTags v-else-if="sel.kind === 'tags'" />
            <OaEditScheme v-else-if="sel.kind === 'scheme'" :key="sel.name" :name="sel.name" />
            <OaEditOperation v-else-if="sel.kind === 'operation'" :key="`${sel.path} ${sel.method}`" :path="sel.path" :method="sel.method" />

            <div v-else-if="sel.kind === 'path'" :key="sel.path" class="oa-ef">
              <div class="oa-es__row">
                <UidInput
                  class="oa-ef__grow"
                  size="sm"
                  :label="labels.path"
                  :model-value="pathDraft[sel.path] ?? sel.path"
                  @update:model-value="(v: string) => (pathDraft[selKey] = v)"
                  @blur="renamePath(sel.path, pathDraft[sel.path] ?? sel.path)"
                />
                <UidButton size="sm" variant="ghost" @click="removePath(sel.path)">{{ labels.remove }}</UidButton>
              </div>
              <div class="oa-es__row">
                <button
                  v-for="m in methodsOf(sel.path)"
                  :key="m"
                  type="button"
                  class="oa-chip"
                  @click="sel = { kind: 'operation', path: sel.path, method: m }"
                >{{ m.toUpperCase() }}</button>
              </div>
              <div class="oa-es__row">
                <UidSelect
                  class="oa-ef__in"
                  size="sm"
                  :options="METHODS.filter((m) => !doc!.paths[sel.kind === 'path' ? sel.path : ''][m]).map((m) => ({ value: m, label: m.toUpperCase() }))"
                  :model-value="newMethod"
                  @update:model-value="(v: unknown) => (newMethod = String(v))"
                />
                <UidButton size="sm" variant="secondary" @click="addOperation(sel.path)">{{ labels.addOperation }}</UidButton>
              </div>
            </div>

            <div v-else-if="sel.kind === 'schema' && doc.components?.schemas?.[sel.name]" :key="sel.name" class="oa-ef">
              <div class="oa-es__row">
                <UidInput
                  class="oa-ef__grow"
                  size="sm"
                  :label="labels.name"
                  :model-value="schemaDraft[sel.name] ?? sel.name"
                  @update:model-value="(v: string) => (schemaDraft[selKey] = v)"
                  @blur="renameSchema(sel.name, schemaDraft[sel.name] ?? sel.name)"
                />
                <UidButton size="sm" variant="ghost" @click="removeSchema(sel.name)">{{ labels.remove }}</UidButton>
              </div>
              <OaEditSchema :schema="doc.components.schemas[sel.name]" />
            </div>

            <div v-if="sel.kind === 'operation'" class="oa-ef__footer">
              <UidButton size="sm" variant="danger" @click="removeCurrent">{{ labels.remove }}</UidButton>
            </div>
            <div v-if="sel.kind === 'scheme'" class="oa-ef__footer">
              <UidButton size="sm" variant="danger" @click="removeCurrent">{{ labels.remove }}</UidButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  </component>
</template>

<style src="./openapi.css"></style>
