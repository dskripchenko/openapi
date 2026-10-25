import { inject, type InjectionKey, type Ref } from 'vue'
import type { EditorDoc } from './state'
import type { EditorLabels } from './labels'

export interface EditorContext {
  editor: EditorDoc
  labels: Ref<EditorLabels>
  /** Names of components.schemas, for $ref pickers. */
  schemaNames: Ref<string[]>
  /** 3.0 writes `nullable: true`; 3.1 adds 'null' to the type. */
  is31: Ref<boolean>
}

export const editorKey: InjectionKey<EditorContext> = Symbol('openapi-editor')

export function useEditor(): EditorContext {
  const ctx = inject(editorKey)
  if (!ctx) throw new Error('Editor parts must be used inside <OpenApiEditor>')
  return ctx
}
