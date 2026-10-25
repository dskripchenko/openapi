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
import '@dskripchenko/ui/styles/all.css'
import './standalone.css'
import { createApp, h, reactive, watchEffect, type App } from 'vue'
import OpenApiPage from '../vue/OpenApiPage.vue'
import { resolveLocale, type PageTheme } from '../vue/page'
import { toSpecSources, type StandaloneOptions } from './options'
import { proxySend } from './proxy'

export type { StandaloneOptions, StandaloneSource } from './options'
export { proxySend } from './proxy'

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
