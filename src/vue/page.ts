/** What OpenApiPage's switchers choose between. */

/** 'system' follows `prefers-color-scheme`. */
export type PageTheme = 'light' | 'dark' | 'system'

export const PAGE_THEMES: PageTheme[] = ['light', 'dark', 'system']

export const isPageTheme = (v: unknown): v is PageTheme => PAGE_THEMES.includes(v as PageTheme)

/** 'auto' (or nothing) becomes the browser's language: 'ru' for any Russian, else 'en'. */
export function resolveLocale(locale: string | undefined, browser?: string): string {
  if (locale && locale !== 'auto') return locale
  const lang = browser ?? (typeof navigator !== 'undefined' ? navigator.language : '')
  return (lang ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
