<script setup lang="ts">
/**
 * The source as text: a textarea over a highlighted copy (the kit's
 * tokenizer), with line numbers and the problems listed under it. A problem
 * with a line jumps the caret there.
 */
import { computed, h, nextTick, ref, type VNode } from 'vue'
import { tokenize } from '@dskripchenko/ui'
import type { DocumentIssue } from '../../validate'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language: 'yaml' | 'json'
    issues?: DocumentIssue[]
    parseError?: { message: string; line?: number; column?: number } | null
    labels?: { issues: string; noIssues: string; parseError: string }
    /** Without the problem list under the text (the host shows its own). */
    bare?: boolean
    /** Grows with the text between these line counts instead of the fixed --oa-source-height. */
    fit?: { min: number; max: number }
    /** The textarea's accessible name. */
    ariaLabel?: string
  }>(),
  { issues: () => [], parseError: null, labels: () => ({ issues: '', noIssues: '', parseError: '' }), bare: false, fit: undefined, ariaLabel: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [text: string] }>()

const textarea = ref<HTMLTextAreaElement | null>(null)
const highlight = ref<HTMLElement | null>(null)
const gutter = ref<HTMLElement | null>(null)

/** Past this size the text is shown plain: tokenizing a megabyte on every key is too slow. */
const HIGHLIGHT_LIMIT = 150_000
const plain = computed(() => props.modelValue.length > HIGHLIGHT_LIMIT)
const lineCount = computed(() => {
  let n = 1
  for (let i = props.modelValue.indexOf('\n'); i !== -1; i = props.modelValue.indexOf('\n', i + 1)) n++
  return n
})
/** One text node for all the numbers: a node per line would be tens of thousands. */
const numbers = computed(() => Array.from({ length: lineCount.value }, (_, i) => i + 1).join('\n'))
/* 1.6em a line plus the frame's padding and border; the em is the frame's, where the height applies. */
const fitStyle = computed(() =>
  props.fit ? { '--oa-source-height': `calc(${Math.min(props.fit.max, Math.max(props.fit.min, lineCount.value))} * 1.6em + 22px)` } : undefined,
)
const errorLines = computed(() => {
  const lines = new Set<number>()
  for (const i of props.issues) if (i.severity === 'error' && i.line) lines.add(i.line)
  if (props.parseError?.line) lines.add(props.parseError.line)
  return lines
})

// Text nodes and spans, no v-html: the source stays escaped.
const Highlighted = (): VNode[] | string =>
  plain.value ? '' : tokenize(props.modelValue + '\n', props.language).map((t) =>
    t.type === 'plain' ? (t.text as unknown as VNode) : h('span', { class: `uid-code__tok--${t.type}` }, t.text),
  )

function sync(): void {
  const ta = textarea.value
  if (!ta) return
  if (highlight.value) {
    highlight.value.scrollTop = ta.scrollTop
    highlight.value.scrollLeft = ta.scrollLeft
  }
  if (gutter.value) gutter.value.scrollTop = ta.scrollTop
}

/** Tab inserts two spaces instead of leaving the field. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Tab' || e.shiftKey) return
  e.preventDefault()
  const ta = e.target as HTMLTextAreaElement
  const { selectionStart: s, selectionEnd: end } = ta
  const next = props.modelValue.slice(0, s) + '  ' + props.modelValue.slice(end)
  emit('update:modelValue', next)
  void nextTick(() => ta.setSelectionRange(s + 2, s + 2))
}

async function goToLine(line?: number, column = 1): Promise<void> {
  const ta = textarea.value
  if (!ta || !line) return
  const lines = props.modelValue.split('\n')
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i]!.length + 1
  offset += Math.max(0, column - 1)
  ta.focus()
  ta.setSelectionRange(offset, offset)
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 18
  ta.scrollTop = Math.max(0, (line - 4) * lineHeight)
  await nextTick()
  sync()
}

defineExpose({ goToLine })
</script>

<template>
  <div class="oa-source" :class="{ 'oa-source--plain': plain }" :style="fitStyle">
    <div class="oa-source__frame">
      <div ref="gutter" class="oa-source__gutter" aria-hidden="true">
        <div class="oa-source__gutter-inner">
          <span v-for="n in errorLines" :key="n" class="oa-source__mark" :style="{ top: `calc(${n - 1} * 1.6em + 10px)` }" />
          <pre class="oa-source__numbers">{{ numbers }}</pre>
        </div>
      </div>
      <div class="oa-source__stack">
        <pre v-if="!plain" ref="highlight" class="oa-source__highlight" aria-hidden="true"><Highlighted /></pre>
        <textarea
          ref="textarea"
          class="oa-source__textarea"
          :value="modelValue"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          wrap="off"
          :aria-label="ariaLabel"
          @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
          @scroll="sync"
          @keydown="onKeydown"
        />
      </div>
    </div>
    <div v-if="!bare" class="oa-source__issues">
      <button v-if="parseError" type="button" class="oa-source__issue is-error" @click="goToLine(parseError.line, parseError.column)">
        <span class="oa-source__where">{{ parseError.line ? `${parseError.line}:${parseError.column ?? 1}` : '—' }}</span>
        {{ labels.parseError }}: {{ parseError.message }}
      </button>
      <template v-else>
        <div class="oa-source__issues-title">{{ issues.length ? `${labels.issues} (${issues.length})` : labels.noIssues }}</div>
        <button
          v-for="(i, n) in issues"
          :key="n"
          type="button"
          class="oa-source__issue"
          :class="i.severity === 'error' ? 'is-error' : 'is-warning'"
          @click="goToLine(i.line, i.column)"
        >
          <span class="oa-source__where">{{ i.line ? `${i.line}:${i.column ?? 1}` : i.pointer }}</span>
          {{ i.message }}
        </button>
      </template>
    </div>
  </div>
</template>
