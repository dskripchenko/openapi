// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { PAGE_PRINT_CSS, PRINT_CSS, printsWholePage, shadowPrintCss } from '../src/vue/printStyles'

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints })

describe('print', () => {
  it('prints on the page on iOS and iPadOS only', () => {
    expect(printsWholePage(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 'iPhone', 5))).toBe(true)
    expect(printsWholePage(nav('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) CriOS/130.0', 'iPad', 5))).toBe(true)
    // iPadOS asks for the desktop site: a Mac with touch.
    expect(printsWholePage(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15', 'MacIntel', 5))).toBe(true)
    expect(printsWholePage(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15', 'MacIntel', 0))).toBe(false)
    expect(printsWholePage(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36', 'Linux armv8l', 5))).toBe(false)
    expect(printsWholePage(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0', 'Win32', 0))).toBe(false)
  })

  it('turns the document stylesheet into one for the shadow container', () => {
    const css = shadowPrintCss()
    expect(css).not.toContain('@page')
    expect(css).not.toContain('@media screen')
    expect(css).not.toMatch(/(^|\n)(html, body|body) \{/)
    expect(css).toContain(':host { color-scheme: light; }')
    expect(css.match(/\.oap-body \{/g)).toHaveLength(2)
    // Everything else is kept as is.
    expect(css).toContain('.oap-page { break-before: page;')
    expect(PRINT_CSS.length - css.length).toBeLessThan(200)
  })

  it('hides the page around the container on paper only', () => {
    expect(PAGE_PRINT_CSS).toMatch(/\[data-oa-print-page\] \{ display: none; \}/)
    expect(PAGE_PRINT_CSS).toContain('body > *:not([data-oa-print-page]) { display: none !important; }')
    expect(PAGE_PRINT_CSS).toContain('overflow: visible !important')
    expect(PAGE_PRINT_CSS).toContain('@page { size: A4;')
  })

  it('keeps a margin of its own when a print dialog drops @page', () => {
    // "None" / "Minimum" margins in a print dialog ignore @page: the body's
    // padding, repeated on every sheet, keeps the text off the paper's edge.
    const body = PRINT_CSS.match(/(^|\n)body \{[^}]*\}/)![0]
    expect(body).toContain('padding: 6mm 8mm')
    expect(body).toContain('box-decoration-break: clone')
    expect(shadowPrintCss()).toMatch(/\.oap-body \{[^}]*padding: 6mm 8mm/)
    expect(PRINT_CSS).toContain('@page { size: A4; margin: 10mm 6mm 12mm; }')
  })
})
