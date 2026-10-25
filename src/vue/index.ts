/**
 * @dskripchenko/openapi/vue — the reference and editor components, built on
 * @dskripchenko/ui. Import the styles once: `@dskripchenko/openapi/style.css`.
 */
export { default as OpenApiReference } from './OpenApiReference.vue'
export { default as OpenApiOperation } from './OpenApiOperation.vue'
export { default as OpenApiEditor } from './OpenApiEditor.vue'
export { editorEn, editorRu, EDITOR_LOCALES, type EditorLabels } from './editor/labels'
export { en, ru, LOCALES, type OpenApiLabels } from './labels'
export { OAUTH_MESSAGE, relayOAuthCallback } from './oauthPopup'
export { referenceKey, useReference, type ReferenceContext, type ServerState, type SpecInput, type SpecSource } from './context'
export { default as OpenApiPage } from './OpenApiPage.vue'
export { PAGE_THEMES, resolveLocale, type PageTheme } from './page'
export { printDocument, printOperation, type PrintDocumentOptions, type PrintOptions } from './print'
export { findOperation } from './embed'
