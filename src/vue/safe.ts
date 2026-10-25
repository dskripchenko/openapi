/**
 * Links taken from a spec go into `href`: only http(s), mailto and relative
 * addresses pass, so a spec cannot plant a `javascript:` or `data:` link.
 */
export function safeHref(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  const trimmed = url.trim()
  if (trimmed === '') return undefined
  // Control characters and whitespace inside a scheme are how filters get fooled.
  // eslint-disable-next-line no-control-regex -- the control characters are the point
  const compact = trimmed.replace(/[\u0000- \u007f]/g, '')
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(compact)?.[1]?.toLowerCase()
  if (scheme === undefined) return trimmed
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto' ? trimmed : undefined
}
