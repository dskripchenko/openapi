/**
 * Printing an operation (or the whole spec) through the browser's own print
 * dialog, which also saves PDF files — no PDF library involved.
 *
 * The print view is rendered once, as static HTML, and printed one of two ways:
 *
 * - `frame` (desktop browsers): written into a hidden iframe that carries only
 *   its own stylesheet, and the frame is printed. The host page is neither
 *   hidden nor restyled.
 * - `page` (iOS and iPadOS): WebKit there ignores a frame's `print()` and
 *   prints the whole top page — the reference's interface over dozens of
 *   sheets. The view goes into a shadow root on the page (the host's styles
 *   stay out), and a print-only stylesheet hides everything else for the
 *   dialog's duration.
 *
 * The title (`{API} — {operation}`) is what browsers offer as the PDF's file
 * name: the frame's, and the host's for the dialog's duration too, since some
 * browsers take the top page's. Everything goes away after printing, or when
 * the next print starts.
 */
import { createApp, h, nextTick, type Component } from 'vue'
import type { OperationEntry } from '../model'
import { referenceKey, type ReferenceContext } from './context'
import OaPrintDocument from './OaPrintDocument.vue'
import OaPrintOperation from './OaPrintOperation.vue'
import { PAGE_PRINT_CSS, PRINT_CSS, printsWholePage, shadowPrintCss } from './printStyles'

export { PAGE_PRINT_CSS, PRINT_CSS, printsWholePage, shadowPrintCss }

/** How the print view reaches the dialog: see the module comment. `auto` picks `page` on iOS/iPadOS. */
export type PrintMode = 'auto' | 'frame' | 'page'

export interface PrintOptions {
  /**
   * The address printed with the operation; by default the page without its
   * hash, `#` and the operation's canonical anchor.
   */
  url?: string
  mode?: PrintMode
}

export interface PrintDocumentOptions {
  /** The page the operation anchors are appended to; the current page by default. */
  base?: string
  mode?: PrintMode
}

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const resolveMode = (mode: PrintMode = 'auto'): 'frame' | 'page' => (mode === 'auto' ? (printsWholePage() ? 'page' : 'frame') : mode)

/** Renders a print view to static HTML with the given context. */
async function renderStatic(component: Component, props: Record<string, unknown>, ctx: ReferenceContext): Promise<string> {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component, props) })
  app.provide(referenceKey, ctx)
  app.mount(host)
  await nextTick()
  const html = host.innerHTML
  app.unmount()
  return html
}

let current: { node: HTMLElement; restore: () => void } | null = null

/** Removes the last print frame (or page container) and gives the host page its title back. */
function cleanup(): void {
  if (!current) return
  current.restore()
  current.node.remove()
  current = null
}

/** Resolves when the pictures among `images` have loaded or failed, or after a short wait. */
async function imagesSettled(images: HTMLImageElement[]): Promise<void> {
  const pending = images.filter((img) => !img.complete)
  if (!pending.length) return
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise((done) => {
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          }),
      ),
    ),
    new Promise((r) => setTimeout(r, 2000)),
  ])
}

/**
 * Opens the print dialog for `body` (static HTML styled by `PRINT_CSS`), in a
 * hidden iframe or on the page itself (see `PrintMode`). Resolves with the
 * frame or the page container once the dialog is asked for.
 */
export async function printHtml(body: string, title: string, lang = document.documentElement.lang || 'en', mode: PrintMode = 'auto'): Promise<HTMLElement> {
  cleanup()
  return resolveMode(mode) === 'page' ? printOnPage(body, title, lang) : printInFrame(body, title, lang)
}

async function printInFrame(body: string, title: string, lang: string): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe')
  frame.setAttribute('data-oa-print', '')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', title)
  frame.tabIndex = -1
  // Off screen, but laid out at paper width (a zero-sized frame may print blank).
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(frame)
  const hostTitle = document.title
  current = { node: frame, restore: () => void (document.title = hostTitle) }

  const doc = frame.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${PRINT_CSS}</style></head><body>${body}</body></html>`,
  )
  doc.close()
  // Pictures from the descriptions: printed once they arrive (or after a short wait).
  await imagesSettled([...doc.images])
  const win = frame.contentWindow
  if (!win) return frame
  const mine = current
  win.addEventListener('afterprint', () => {
    if (current === mine) cleanup()
  }, { once: true })
  document.title = title
  win.focus()
  win.print()
  return frame
}

async function printOnPage(body: string, title: string, lang: string): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.setAttribute('data-oa-print-page', '')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('lang', lang)
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${shadowPrintCss()}</style><div class="oap-body">${body}</div>`
  const style = document.createElement('style')
  style.setAttribute('data-oa-print-page', '')
  style.textContent = PAGE_PRINT_CSS
  document.head.appendChild(style)
  document.body.appendChild(host)
  const hostTitle = document.title
  current = {
    node: host,
    restore: () => {
      document.title = hostTitle
      style.remove()
    },
  }
  await imagesSettled([...root.querySelectorAll('img')])
  const mine = current
  window.addEventListener('afterprint', () => {
    if (current === mine) cleanup()
  }, { once: true })
  document.title = title
  window.print()
  return host
}

/** The address of an operation in the reference: the page without its hash, `#`, the anchor. */
export function operationUrl(entry: OperationEntry, ctx: ReferenceContext, base = window.location.href.split('#')[0]!): string {
  return `${base}#${ctx.anchorPrefix.value}operation/${entry.id}`
}

/** Opens the print dialog for one operation (paper, or "Save as PDF"). */
export async function printOperation(entry: OperationEntry, ctx: ReferenceContext, options: PrintOptions = {}): Promise<HTMLElement> {
  const url = options.url ?? operationUrl(entry, ctx)
  const html = await renderStatic(OaPrintOperation, { entry, url }, ctx)
  const api = ctx.spec.value.document.info.title
  const name = entry.operation.summary || `${entry.method.toUpperCase()} ${entry.path}`
  return printHtml(html, api ? `${api} — ${name}` : name, undefined, options.mode)
}

/** Opens the print dialog for the whole spec: the introduction, every operation, the schemas. */
export async function printDocument(ctx: ReferenceContext, options: PrintDocumentOptions = {}): Promise<HTMLElement> {
  const base = options.base ?? window.location.href.split('#')[0]!
  const html = await renderStatic(OaPrintDocument, { base }, ctx)
  const info = ctx.spec.value.document.info
  return printHtml(html, [info.title, info.version].filter(Boolean).join(' — ') || 'OpenAPI', undefined, options.mode)
}
