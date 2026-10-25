/**
 * Single operations in a documentation page, from the standalone script.
 *
 *   <div data-openapi-operation="createOrder" data-openapi-src="/openapi.json"></div>
 *   <script src=".../standalone.js" data-auto></script>
 *
 * With `data-auto` on its script tag, the script mounts every
 * `[data-openapi-operation]` element once the document is parsed. Without
 * it, call `DskOpenApi.autoMount()` (after adding elements, again: mounted
 * ones are skipped) or `DskOpenApi.mountOperation(target, options)`.
 *
 * Attributes: `data-openapi-src` (the spec's URL), `data-openapi-theme`
 * (light | dark | system), `data-openapi-locale` (en | ru | auto),
 * `data-openapi-proxy`, `data-openapi-try-it="false"`,
 * `data-openapi-reference` (the full reference's URL, for "Open in
 * reference"), `data-openapi-slug` (the spec's id there).
 *
 * Embeds of one URL fetch it once. The theme is left to the host page unless
 * given: the kit's themes key off <html data-theme>, so an explicit theme is
 * written there, for the whole page. Without one (and without the attribute)
 * the kit's light tokens apply to `:root:not([data-theme])` — only --uid-*
 * custom properties, nothing the host page uses.
 */
import { createApp, h, reactive, watchEffect, type App } from 'vue'
import kitThemes from '@dskripchenko/ui/styles/themes.css?raw'
import OpenApiOperation from '../vue/OpenApiOperation.vue'
import { isPageTheme, resolveLocale, type PageTheme } from '../vue/page'
import type { SnippetTarget } from '../snippets'
import { urlLoader, type StandaloneSource } from './options'
import { proxySend } from './proxy'

export interface OperationEmbedOptions {
  /** The spec: its URL, or a source as in `createApiReference` (`content` wins over `url`). */
  source?: StandaloneSource | string
  /** operationId, `METHOD /path`, or an anchor (ours or Scalar's). */
  operation: string
  /** Written to <html data-theme> only when given; 'system' follows `prefers-color-scheme`. */
  theme?: PageTheme
  /** 'en', 'ru' or 'auto' (the page's `lang`, else the browser's language). 'auto' by default. */
  locale?: 'en' | 'ru' | 'auto'
  /** Try-it requests go through this endpoint; see `proxySend`. */
  proxy?: string
  tryIt?: boolean
  /** The full reference's URL: the card links to the operation there. */
  referenceUrl?: string
  baseUrl?: string
  snippetTargets?: SnippetTarget[]
  defaultSnippet?: SnippetTarget
  /** Keeps API keys and tokens between visits: 'session' or 'local'. */
  persistCredentials?: boolean | 'session' | 'local'
  oauthRedirectUrl?: string
}

export interface OperationEmbed {
  app: App
  unmount(): void
  setTheme(theme: PageTheme): void
  setLocale(locale: 'en' | 'ru' | 'auto'): void
}

/** One loader per absolute URL: embeds of the same spec share it, and the load behind it. */
const loaders = new Map<string, () => Promise<string>>()
function loaderFor(url: string): () => Promise<string> {
  const key = new URL(url, document.baseURI).href
  let loader = loaders.get(key)
  if (!loader) loaders.set(key, (loader = urlLoader(url)))
  return loader
}

/* The theme on <html>, set only on request; 'system' follows the browser live. */
let themeMedia: MediaQueryList | null = null
let themeListener: (() => void) | null = null
function applyTheme(theme: PageTheme): void {
  if (themeMedia && themeListener) themeMedia.removeEventListener('change', themeListener)
  themeMedia = themeListener = null
  const set = (t: 'light' | 'dark'): void => void (document.documentElement.dataset.theme = t)
  if (theme !== 'system') return set(theme)
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media) return set('light')
  themeMedia = media
  themeListener = () => set(media.matches ? 'dark' : 'light')
  media.addEventListener('change', themeListener)
  themeListener()
}

/** The kit's light theme for a page that sets no <html data-theme>: once, as custom properties only. */
function lightFallback(): void {
  if (document.querySelector('style[data-dsk-openapi-light]')) return
  const block = /:root\[data-theme='light'\]\s*\{[^}]*\}/.exec(kitThemes)?.[0]
  if (!block) return
  const style = document.createElement('style')
  style.setAttribute('data-dsk-openapi-light', '')
  style.textContent = block.replace(":root[data-theme='light']", ':root:not([data-theme])')
  document.head.appendChild(style)
}

/** Mounts one operation into `target` (a selector or an element). */
export function mountOperation(target: string | Element, options: OperationEmbedOptions): OperationEmbed {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error(`mountOperation: no element matches ${String(target)}`)
  const source: StandaloneSource = typeof options.source === 'string' ? { url: options.source } : (options.source ?? {})
  const spec = source.content !== undefined ? source.content : source.url !== undefined ? loaderFor(source.url) : ''
  const send = options.proxy ? proxySend(options.proxy) : undefined
  const state = reactive({ locale: options.locale ?? ('auto' as 'en' | 'ru' | 'auto') })
  if (options.theme) applyTheme(options.theme)
  lightFallback()

  const app = createApp({
    setup() {
      const lang = (): string => resolveLocale(state.locale, state.locale === 'auto' ? document.documentElement.lang || undefined : undefined)
      // The card's own language, for the screen reader; the host page's <html lang> stays.
      watchEffect(() => el.setAttribute('lang', lang()))
      return () =>
        h(OpenApiOperation, {
          spec,
          operation: options.operation,
          specId: source.slug,
          locale: lang(),
          send,
          tryIt: options.tryIt ?? true,
          referenceUrl: options.referenceUrl,
          baseUrl: options.baseUrl,
          snippetTargets: options.snippetTargets,
          defaultSnippet: options.defaultSnippet,
          persistCredentials: options.persistCredentials ?? false,
          oauthRedirectUrl: options.oauthRedirectUrl,
        })
    },
  })
  app.mount(el)
  el.setAttribute('data-openapi-mounted', '')
  return {
    app,
    unmount: () => {
      app.unmount()
      el.removeAttribute('data-openapi-mounted')
    },
    setTheme: (t) => applyTheme(t),
    setLocale: (l) => void (state.locale = l),
  }
}

const LOCALES = ['en', 'ru', 'auto'] as const

/** Mounts every `[data-openapi-operation]` element under `root` that is not mounted yet. */
export function autoMount(root: ParentNode = document): OperationEmbed[] {
  const out: OperationEmbed[] = []
  for (const el of root.querySelectorAll<HTMLElement>('[data-openapi-operation]:not([data-openapi-mounted])')) {
    const d = el.dataset
    const theme = d.openapiTheme
    const locale = d.openapiLocale as (typeof LOCALES)[number] | undefined
    try {
      out.push(
        mountOperation(el, {
          operation: d.openapiOperation ?? '',
          source: { ...(d.openapiSrc ? { url: d.openapiSrc } : {}), ...(d.openapiSlug ? { slug: d.openapiSlug } : {}) },
          ...(isPageTheme(theme) ? { theme } : {}),
          ...(locale && LOCALES.includes(locale) ? { locale } : {}),
          ...(d.openapiProxy ? { proxy: d.openapiProxy } : {}),
          ...(d.openapiReference ? { referenceUrl: d.openapiReference } : {}),
          tryIt: d.openapiTryIt !== 'false',
        }),
      )
    } catch (error) {
      // One broken element must not stop the rest.
      console.error(error)
    }
  }
  return out
}

/** `<script src=".../standalone.js" data-auto>`: mount the page's embeds once it is parsed. */
export function autoMountOnLoad(script: HTMLOrSVGScriptElement | null): void {
  if (!script?.hasAttribute('data-auto')) return
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void autoMount(), { once: true })
  else autoMount()
}
