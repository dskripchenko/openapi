import { safeHref } from '../src/vue/safe'

describe('safeHref', () => {
  it('passes http(s), mailto and relative links', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeHref('mailto:a@example.com')).toBe('mailto:a@example.com')
    expect(safeHref('/terms')).toBe('/terms')
    expect(safeHref('#section')).toBe('#section')
  })
  it('drops script, data and disguised schemes', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\tscript:alert(1)', 'java\u0000script:x', 'data:text/html,<b>', 'vbscript:x']) {
      expect(safeHref(bad)).toBeUndefined()
    }
    expect(safeHref('')).toBeUndefined()
    expect(safeHref(42)).toBeUndefined()
  })
})
