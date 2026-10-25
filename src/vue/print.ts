/**
 * Printing an operation (or the whole spec) through the browser's own print
 * dialog, which also saves PDF files — no PDF library involved.
 *
 * The print view is rendered once, as static HTML, and written into a hidden
 * iframe that carries only its own stylesheet: the host page's styles do not
 * leak in, and the host page itself is neither hidden nor restyled. The
 * frame's title (`{API} — {operation}`) is what browsers offer as the PDF's
 * file name; the host's title is set to it for the dialog's duration too,
 * since some browsers take the top page's. The frame goes away after
 * printing, or when the next print starts.
 */
import { createApp, h, nextTick, type Component } from 'vue'
import type { OperationEntry } from '../model'
import { referenceKey, type ReferenceContext } from './context'
import OaPrintDocument from './OaPrintDocument.vue'
import OaPrintOperation from './OaPrintOperation.vue'

export interface PrintOptions {
  /**
   * The address printed with the operation; by default the page without its
   * hash, `#` and the operation's canonical anchor.
   */
  url?: string
}

export interface PrintDocumentOptions {
  /** The page the operation anchors are appended to; the current page by default. */
  base?: string
}

/** The stylesheet of the print document: A4, light colors whatever the page's theme, nothing interactive. */
export const PRINT_CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1a1d23; }
body { font: 10.5pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media screen { body { max-width: 210mm; margin: 0 auto; padding: 16mm 14mm; } }
h1, h2, h3, h4 { margin: 1.1em 0 0.4em; line-height: 1.25; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 18pt; margin-top: 0; }
h2 { font-size: 12.5pt; padding-bottom: 3px; border-bottom: 1px solid #d5d9e0; }
h3 { font-size: 11pt; }
h4 { font-size: 10pt; color: #4a5160; }
p, ul, ol { margin: 0.4em 0; }
a { color: #1d4ed8; text-decoration: none; word-break: break-all; }
a[href^="http"]:not(.oap-url)::after { content: " (" attr(href) ")"; color: #4a5160; font-size: 0.9em; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 9pt; }
code { padding: 0 2px; border-radius: 3px; background: #f1f3f6; overflow-wrap: anywhere; }
pre code { padding: 0; background: none; }
pre, .oap-code { margin: 0.4em 0; padding: 8px 10px; border: 1px solid #d5d9e0; border-radius: 4px; background: #f7f8fa; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; break-inside: avoid; page-break-inside: avoid; }
table { width: 100%; margin: 0.4em 0 0.8em; border-collapse: collapse; break-inside: auto; }
tr, .oap-security li { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
th, td { padding: 4px 6px; border: 1px solid #d5d9e0; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
th { background: #f1f3f6; font-size: 9pt; font-weight: 600; }
th::first-letter { text-transform: uppercase; }
td > p:first-child, td .oap-md > :first-child { margin-top: 0; }
td .oap-md > :last-child { margin-bottom: 0; }
.oap-table--schema td:first-child { width: 32%; }
.oap-row--branch td { background: #fafbfc; }
.oap-page { break-before: page; page-break-before: always; }
.oap-op__head { margin-bottom: 8px; }
.oap-call { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: 6px 0; }
.oap-call__url { font-size: 10pt; background: none; }
.oap-method { display: inline-block; min-width: 46px; padding: 1px 6px; border: 1px solid currentColor; border-radius: 4px; font: 600 8.5pt/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: center; color: #4a5160; }
.oap-method--get { color: #1d4ed8; } .oap-method--post { color: #15803d; } .oap-method--put, .oap-method--patch { color: #b45309; } .oap-method--delete { color: #b91c1c; }
.oap-meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 6px 0; font-size: 9.5pt; }
.oap-meta dt { color: #4a5160; } .oap-meta dd { margin: 0; }
.oap-flag, .oap-required { display: inline-block; margin-left: 6px; padding: 0 5px; border: 1px solid #d5d9e0; border-radius: 3px; font-size: 8pt; font-weight: 500; vertical-align: middle; color: #4a5160; }
.oap-required { border-color: #fca5a5; color: #b91c1c; }
.oap-flag--deprecated { border-color: #fcd34d; color: #92400e; }
.oap-note { color: #4a5160; font-size: 9pt; }
.oap-note code { margin-right: 4px; }
.oap-cycle { color: #4a5160; font-style: italic; }
.oap-schema__root { margin: 0.3em 0; }
.oap-status { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.oap-md img { max-width: 100%; }
.oap-md blockquote { margin: 0.4em 0; padding-left: 10px; border-left: 3px solid #d5d9e0; color: #4a5160; }
.oap-toc { padding-left: 1.4em; }
.oap-toc li { margin: 2px 0; }
.oap-toc .oap-method { min-width: 0; margin-right: 4px; }
.oap-footer { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 18px; padding-top: 6px; border-top: 1px solid #d5d9e0; color: #4a5160; font-size: 8.5pt; }
`

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

let current: { frame: HTMLIFrameElement; restore: () => void } | null = null

/** Removes the last print frame and gives the host page its title back. */
function cleanup(): void {
  if (!current) return
  current.restore()
  current.frame.remove()
  current = null
}

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * Writes `body` into a fresh hidden iframe and opens the print dialog for it.
 * Resolves with the frame once the dialog is asked for.
 */
export async function printHtml(body: string, title: string, lang = document.documentElement.lang || 'en'): Promise<HTMLIFrameElement> {
  cleanup()
  const frame = document.createElement('iframe')
  frame.setAttribute('data-oa-print', '')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', title)
  frame.tabIndex = -1
  // Off screen, but laid out at paper width (a zero-sized frame may print blank).
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(frame)
  const hostTitle = document.title
  current = { frame, restore: () => void (document.title = hostTitle) }

  const doc = frame.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${PRINT_CSS}</style></head><body>${body}</body></html>`,
  )
  doc.close()
  // Pictures from the descriptions: printed once they arrive (or after a short wait).
  const images = [...doc.images].filter((img) => !img.complete)
  if (images.length) {
    await Promise.race([
      Promise.all(
        images.map(
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

/** The address of an operation in the reference: the page without its hash, `#`, the anchor. */
export function operationUrl(entry: OperationEntry, ctx: ReferenceContext, base = window.location.href.split('#')[0]!): string {
  return `${base}#${ctx.anchorPrefix.value}operation/${entry.id}`
}

/** Opens the print dialog for one operation (paper, or "Save as PDF"). */
export async function printOperation(entry: OperationEntry, ctx: ReferenceContext, options: PrintOptions = {}): Promise<HTMLIFrameElement> {
  const url = options.url ?? operationUrl(entry, ctx)
  const html = await renderStatic(OaPrintOperation, { entry, url }, ctx)
  const api = ctx.spec.value.document.info.title
  const name = entry.operation.summary || `${entry.method.toUpperCase()} ${entry.path}`
  return printHtml(html, api ? `${api} — ${name}` : name)
}

/** Opens the print dialog for the whole spec: the introduction, every operation, the schemas. */
export async function printDocument(ctx: ReferenceContext, options: PrintDocumentOptions = {}): Promise<HTMLIFrameElement> {
  const base = options.base ?? window.location.href.split('#')[0]!
  const html = await renderStatic(OaPrintDocument, { base }, ctx)
  const info = ctx.spec.value.document.info
  return printHtml(html, [info.title, info.version].filter(Boolean).join(' — ') || 'OpenAPI')
}
