/**
 * API blocks in a rendered page, from the standalone script: every
 * `<pre><code class="language-openapi">` (what markdown renderers make of a
 * ```openapi fence; `language-openapi-yaml` and `language-openapi-json` too)
 * becomes a live, read-only widget in place of the code.
 *
 *   <pre><code class="language-openapi">method: GET
 *   url: https://api.example.com/users/{id}</code></pre>
 *   <script src=".../standalone.js" data-auto></script>
 *
 * With `data-auto` the script renders them once the document is parsed;
 * otherwise call `DskOpenApi.renderBlocks(root?, options?)` — again after
 * adding content: a rendered block is no longer a code element.
 */
import { resolveLocale, type PageTheme } from '../vue/page'
import { mountOpenApiBlock, type OpenApiBlockHandle, type OpenApiBlockOptions } from '../vue/blocks/mount'
import { applyTheme, lightFallback } from './embed'
import { proxySend } from '../request/proxy'

export const BLOCK_SELECTOR = ['openapi', 'openapi-yaml', 'openapi-json'].map((l) => `pre > code.language-${l}`).join(', ')

export interface RenderBlocksOptions extends Omit<OpenApiBlockOptions, 'editable' | 'locale' | 'send' | 'tab'> {
  /** Written to <html data-theme> only when given; 'system' follows `prefers-color-scheme`. */
  theme?: PageTheme
  /** 'en', 'ru' or 'auto' (the page's `lang`, else the browser's language). 'auto' by default. */
  locale?: 'en' | 'ru' | 'auto'
  /** Try-it requests go through this endpoint; see `proxySend`. */
  proxy?: string
}

/** A rendered block: its element in place of the `<pre>`, and the widget's handle. */
export interface RenderedBlock extends OpenApiBlockHandle {
  element: HTMLElement
}

/**
 * Replaces each ```openapi code block under `root` (a node or a selector;
 * the document by default) with a read-only API block widget. Returns the
 * blocks it rendered this time; one that fails is logged and left as code.
 */
export function renderBlocks(root: ParentNode | string = document, options: RenderBlocksOptions = {}): RenderedBlock[] {
  const scope = typeof root === 'string' ? document.querySelector(root) : root
  if (!scope) throw new Error(`renderBlocks: no element matches ${String(root)}`)
  const { theme, locale = 'auto', proxy, ...rest } = options
  if (theme) applyTheme(theme)
  lightFallback()
  const send = proxy ? proxySend(proxy) : undefined
  const out: RenderedBlock[] = []
  for (const code of scope.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    const pre = code.parentElement
    if (!pre) continue
    const element = document.createElement('div')
    element.className = 'oa-block-host'
    element.setAttribute('data-openapi-block', '')
    const lang = resolveLocale(locale, locale === 'auto' ? document.documentElement.lang || undefined : undefined)
    element.setAttribute('lang', lang)
    pre.replaceWith(element)
    try {
      const handle = mountOpenApiBlock(element, { ...rest, source: code.textContent ?? '', editable: false, locale: lang, ...(send ? { send } : {}) })
      element.setAttribute('data-openapi-mounted', '')
      out.push({ ...handle, element })
    } catch (error) {
      // One broken block must not stop the rest; it stays readable as code.
      console.error(error)
      element.replaceWith(pre)
    }
  }
  return out
}
