/**
 * @dskripchenko/openapi/vue — the reference and editor components, built on
 * @dskripchenko/ui. Import the styles once: `@dskripchenko/openapi/style.css`.
 */
export { default as OpenApiReference } from './OpenApiReference.vue'
export { default as OpenApiEditor } from './OpenApiEditor.vue'
export { editorEn, editorRu, EDITOR_LOCALES, type EditorLabels } from './editor/labels'
export { en, ru, LOCALES, type OpenApiLabels } from './labels'
export { referenceKey, useReference, type ReferenceContext, type ServerState, type SpecInput, type SpecSource } from './context'
