import type { Server } from '../core/types'

/**
 * Resolves a server URL template: `{var}` takes the given value, else the
 * variable's default; unknown variables stay as they are. Values are inserted
 * verbatim (server variables usually hold hosts, ports or path prefixes).
 */
export function serverUrl(server: Server, variables: Record<string, string> = {}): string {
  return server.url.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const given = variables[name]
    if (given !== undefined) return given
    return server.variables?.[name]?.default ?? match
  })
}

/**
 * Joins a base URL and a path: exactly one slash between them. A relative
 * base (`/api`, `''`) stays relative — the caller resolves it against the
 * page origin (`new URL(url, location.href)`) when it needs an absolute URL.
 */
export function joinUrl(base: string, path: string): string {
  if (!base) return path || '/'
  if (!path) return base
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}
