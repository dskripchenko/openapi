/**
 * The print view's stylesheets and the choice of how to print: plain
 * TypeScript, no Vue (see print.ts).
 */
/** iOS and iPadOS (which reports itself as a Mac, with touch): every browser there is WebKit. */
export function printsWholePage(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

/**
 * The stylesheet of the print document: A4, light colors whatever the page's
 * theme, nothing interactive. The margins are split: `@page` gives most of
 * them, the body's own padding (repeated on every sheet) the rest — a print
 * dialog set to "None" / "Minimum" margins drops `@page`, and the text would
 * touch the paper's edge.
 */
export const PRINT_CSS = `
@page { size: A4; margin: 10mm 6mm 12mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1a1d23; }
body { font: 10.5pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 6mm 8mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
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
th, td { padding: 4px 6px; border: 1px solid #d5d9e0; text-align: left; vertical-align: top; overflow-wrap: anywhere; font-size: 9pt; }
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
.oap-cycle { color: #4a5160; font-style: italic; font-size: 9pt; }
.oap-schema__root { margin: 0.3em 0; }
.oap-status { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.oap-md img { max-width: 100%; }
.oap-md blockquote { margin: 0.4em 0; padding-left: 10px; border-left: 3px solid #d5d9e0; color: #4a5160; }
.oap-toc { padding-left: 1.4em; }
.oap-toc li { margin: 2px 0; }
.oap-toc .oap-method { min-width: 0; margin-right: 4px; }
.oap-footer { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 18px; padding-top: 6px; border-top: 1px solid #d5d9e0; color: #4a5160; font-size: 8.5pt; }
`

/**
 * The page stylesheet for `page` mode: on paper only the print container
 * shows, and a host's full-height, scroll-clipped layout is let out so the
 * container runs over as many sheets as it needs.
 */
export const PAGE_PRINT_CSS = `
[data-oa-print-page] { display: none; }
@media print {
  @page { size: A4; margin: 10mm 6mm 12mm; }
  html, body { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not([data-oa-print-page]) { display: none !important; }
  [data-oa-print-page] { display: block !important; position: static !important; }
}
`

/**
 * PRINT_CSS for a shadow root: it speaks to a document (`:root`, `html, body`),
 * here the container `.oap-body` plays the body; `@page` only works at the
 * document level (PAGE_PRINT_CSS) and the screen-only page frame is dropped.
 */
export function shadowPrintCss(css = PRINT_CSS): string {
  return css
    .replace(/@page\s*\{[^}]*\}\n?/, '')
    .replace(/@media screen \{[^{}]*\{[^}]*\}\s*\}\n?/, '')
    .replace(/:root\s*\{/, ':host {')
    .replace(/(^|\n)html, body \{/, '$1.oap-body {')
    .replace(/(^|\n)body \{/, '$1.oap-body {')
}
