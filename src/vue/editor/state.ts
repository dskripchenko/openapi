/**
 * The editor's document: the parsed source as one reactive object that the
 * forms edit in place. Every change is written back in the source's format
 * (YAML stays YAML) and emitted; text coming from outside is parsed again.
 *
 * The source object is edited, not the normalized copy, so a 3.0 document
 * stays 3.0. A Swagger 2.0 document is shown in source mode until the user
 * converts it to 3.1 — the forms speak 3.x.
 */
import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { PositionMap } from '../../core/types'
import { parseSpec, stringifySpec, type SpecFormat } from '../../load'
import { detectVersion, normalize, type SpecFamily } from '../../model'
import { validateDocument, type DocumentIssue } from '../../validate'

export type Selection =
  | { kind: 'info' }
  | { kind: 'servers' }
  | { kind: 'tags' }
  | { kind: 'security' }
  | { kind: 'path'; path: string }
  | { kind: 'operation'; path: string; method: string }
  | { kind: 'schema'; name: string }
  | { kind: 'scheme'; name: string }

export type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface EditorDoc {
  /** The parsed source, edited in place by the forms. */
  doc: Ref<Doc | null>
  format: Ref<SpecFormat>
  family: Ref<SpecFamily | null>
  /** The last text: emitted or received. */
  text: Ref<string>
  parseError: Ref<{ message: string; line?: number; column?: number } | null>
  positions: Ref<PositionMap | undefined>
  issues: Ref<DocumentIssue[]>
  selection: Ref<Selection>
  /**
   * Replaces the text (source mode, outside updates) and parses it. `lazy`
   * parses a large text after typing pauses instead of on every key.
   */
  setText(text: string, opts?: { lazy?: boolean }): void
  /** Re-serializes `doc` after a form edit. */
  commit(): void
  setFormat(format: SpecFormat): void
  convertTo31(): void
}

export function useEditorDoc(initial: string, emit: (text: string) => void): EditorDoc {
  const doc = ref<Doc | null>(null)
  const format = ref<SpecFormat>('yaml')
  const family = ref<SpecFamily | null>(null)
  const text = ref(initial)
  const parseError = ref<EditorDoc['parseError']['value']>(null)
  const positions = ref<PositionMap>()
  const selection = ref<Selection>({ kind: 'info' })
  /** Bumped when the document changes (a parse or a commit): what the problems follow. */
  const revision = ref(0)

  function parse(source: string): void {
    if (source.trim() === '') {
      doc.value = null
      parseError.value = null
      return
    }
    try {
      const parsed = parseSpec(source)
      format.value = parsed.format
      positions.value = parsed.positions
      doc.value = reactive(parsed.value as Doc) as Doc
      parseError.value = null
      revision.value++
      try {
        family.value = detectVersion(parsed.value).family
      } catch {
        family.value = null
      }
    } catch (error) {
      const e = error as { message?: string; reason?: string; line?: number; column?: number }
      parseError.value = { message: e.reason ?? e.message ?? String(error), line: e.line, column: e.column }
    }
  }

  let parseTimer: ReturnType<typeof setTimeout> | null = null
  function setText(next: string, opts: { lazy?: boolean } = {}): void {
    text.value = next
    if (parseTimer) clearTimeout(parseTimer)
    parseTimer = null
    if (opts.lazy && next.length > 100_000) {
      parseTimer = setTimeout(() => {
        parseTimer = null
        parse(text.value)
      }, 300)
    } else parse(next)
  }

  let lastEmitted = initial
  function write(next: string): void {
    text.value = next
    lastEmitted = next
    emit(next)
  }

  function commit(): void {
    if (!doc.value) return
    const next = stringifySpec(doc.value, format.value)
    // Positions follow the new text, so issues point at the right lines.
    try {
      positions.value = parseSpec(next, format.value).positions
    } catch {
      positions.value = undefined
    }
    write(next)
    revision.value++
  }

  function setFormat(next: SpecFormat): void {
    if (next === format.value) return
    format.value = next
    commit()
  }

  function convertTo31(): void {
    if (!doc.value) return
    doc.value = reactive(normalize(JSON.parse(JSON.stringify(doc.value))).document as Doc) as Doc
    family.value = 'openapi31'
    commit()
  }

  const issues = computed<DocumentIssue[]>(() => {
    if (!doc.value) return []
    // Recomputed per parse or commit, not per keystroke.
    void revision.value
    return validateDocument(doc.value, { positions: positions.value })
  })

  parse(initial)
  return {
    doc,
    format,
    family,
    text,
    parseError,
    positions,
    issues,
    selection,
    setText,
    commit,
    setFormat,
    convertTo31,
    // Lets the component ignore its own echo coming back through v-model.
    get lastEmitted() {
      return lastEmitted
    },
  } as EditorDoc & { readonly lastEmitted: string }
}

/** Watches a deep reactive part of the doc and commits after edits settle. */
export function autoCommit(editor: EditorDoc, delay = 250): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => editor.doc.value,
    (next, prev) => {
      // A new object is a parse of new text, not an edit: nothing to write back.
      if (next !== prev) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        editor.commit()
      }, delay)
    },
    { deep: true },
  )
}

/** Sets a field, deleting it when the value is empty, so no `key: ''` lands in the file. */
export function setField(obj: Doc, key: string, value: unknown): void {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete obj[key]
  else obj[key] = value
}

/** v-bind helper for a text field bound to `obj[key]`. */
export function bind(obj: Doc, key: string): { modelValue: string; 'onUpdate:modelValue': (v: string) => void } {
  return {
    modelValue: obj[key] === undefined ? '' : String(obj[key]),
    'onUpdate:modelValue': (v: string) => setField(obj, key, v),
  }
}

/** Moves `from` to `to` in an object keeping the key order (renames a path or schema). */
export function renameKey(obj: Doc, from: string, to: string): boolean {
  if (!to || from === to || to in obj) return false
  const entries = Object.entries(obj)
  for (const k of Object.keys(obj)) delete obj[k]
  for (const [k, v] of entries) obj[k === from ? to : k] = v
  return true
}

export const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const
