/**
 * The standalone build: one <script> that puts the reference on any page.
 *
 *   <div id="app"></div>
 *   <script src=".../standalone.js"></script>
 *   <script>
 *     DskOpenApi.createApiReference('#app', { sources: [{ url: '/openapi.json', title: 'API', slug: 'api' }] })
 *   </script>
 *
 * Vue, the kit and all styles are inside; the script injects the CSS itself
 * (dist/standalone.css is the same CSS, for a page that prefers a <link>).
 */
// The kit's tokens, themes and components; its page-wide reset comes scoped, in standalone.css.
import '@dskripchenko/ui/styles/tokens.css'
import '@dskripchenko/ui/styles/themes.css'
import '@dskripchenko/ui/styles/index.css'
import './standalone.css'
import { createApp, h, reactive, watchEffect, type App } from 'vue'
import OpenApiPage from '../vue/OpenApiPage.vue'
import { isPageTheme, resolveLocale, type PageTheme } from '../vue/page'
import { renderBlocks, type RenderBlocksOptions } from './blocks'
import { autoMount, autoMountOnLoad } from './embed'
import { toSpecSources, type StandaloneOptions } from './options'
import { proxySend } from '../request/proxy'

export type { StandaloneOptions, StandaloneSource } from './options'
export type { OperationEmbed, OperationEmbedOptions } from './embed'
export type { RenderBlocksOptions, RenderedBlock } from './blocks'
export { autoMount, mountOperation } from './embed'
export { renderBlocks } from './blocks'
export { mountOpenApiBlock } from '../vue/blocks/mount'
export { proxySend } from '../request/proxy'

export interface ApiReference {
  app: App
  unmount(): void
  setTheme(theme: PageTheme): void
  setLocale(locale: 'en' | 'ru' | 'auto'): void
}

/** Mounts the reference page into `target` (a selector or an element). */
export function createApiReference(target: string | Element, options: StandaloneOptions = {}): ApiReference {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error(`createApiReference: no element matches ${String(target)}`)

  const state = reactive({ theme: options.theme ?? ('system' as PageTheme), locale: options.locale ?? 'auto' })
  const specs = toSpecSources(options)
  const send = options.proxy ? proxySend(options.proxy) : undefined
  if (options.title) document.title = options.title

  const app = createApp({
    setup() {
      // <html lang> follows the language switcher.
      watchEffect(() => (document.documentElement.lang = resolveLocale(state.locale)))
      return () =>
        h(OpenApiPage, {
          theme: state.theme,
          'onUpdate:theme': (t: PageTheme) => (state.theme = t),
          locale: state.locale,
          'onUpdate:locale': (l: string) => (state.locale = l as typeof state.locale),
          title: options.title,
          persistTheme: options.persistTheme ?? false,
          specs,
          send,
          tryIt: options.tryIt ?? true,
          baseUrl: options.baseUrl,
          snippetTargets: options.snippetTargets,
          defaultSnippet: options.defaultSnippet,
          persistCredentials: options.persistCredentials ?? false,
          oauthRedirectUrl: options.oauthRedirectUrl,
        })
    },
  })
  app.mount(el)
  return {
    app,
    unmount: () => app.unmount(),
    setTheme: (t) => void (state.theme = t),
    setLocale: (l) => void (state.locale = l),
  }
}

// A script tag with `data-auto` mounts the page's `[data-openapi-operation]`
// elements (see ./embed) and renders its ```openapi code blocks (./blocks)
// once the document is parsed; the tag's data-openapi-theme / -locale /
// -proxy apply to the blocks. Read now: the current script is known only
// while it runs.
if (typeof document !== 'undefined') {
  const script = document.currentScript
  autoMountOnLoad(script, () => {
    autoMount()
    renderBlocks(document, blockOptions(script))
  })
}

function blockOptions(script: HTMLOrSVGScriptElement | null): RenderBlocksOptions {
  const d = (script as HTMLElement | null)?.dataset ?? {}
  const locale = d.openapiLocale
  return {
    ...(isPageTheme(d.openapiTheme) ? { theme: d.openapiTheme } : {}),
    ...(locale === 'en' || locale === 'ru' || locale === 'auto' ? { locale } : {}),
    ...(d.openapiProxy ? { proxy: d.openapiProxy } : {}),
  }
}
