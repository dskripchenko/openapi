/**
 * The browser side of the redirect-based OAuth flows: a sign-in popup and the
 * two ways its result comes back. The opener polls the popup while it is on
 * the identity provider (cross-origin reads throw) and reads the redirect URI
 * once it lands there; or the page at the redirect URI — the reference itself,
 * or a host page calling `relayOAuthCallback()` — posts the result to the
 * opener and closes. Whichever comes first wins; the state is checked either way.
 */
import { parseCallbackUrl, type OAuthCallback } from '../request'

/** The `type` of the message a redirect page posts to its opener. */
export const OAUTH_MESSAGE = 'dsk-openapi-oauth'

export type OAuthPopupErrorCode = 'blocked' | 'closed' | 'state' | 'timeout'

export class OAuthPopupError extends Error {
  constructor(
    readonly code: OAuthPopupErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OAuthPopupError'
  }
}

/**
 * Opens an empty, centered popup. Call it straight from the click handler,
 * before anything async, or the browser blocks it; navigate it afterwards.
 */
export function openOAuthPopup(width = 520, height = 680): Window | null {
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  const features = `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`
  try {
    return window.open('about:blank', 'dsk-openapi-oauth', features)
  } catch {
    return null
  }
}

/** The redirect URI without query and fragment: what a landed popup is compared with. */
function landing(url: string): string | null {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return null
  }
}

/**
 * Waits for the authorization response of `popup` on `redirectUri`, checks
 * the state and closes the popup. Rejects when the user closes the popup,
 * the state does not match, or nothing comes within `timeoutMs`.
 */
export function waitForOAuthCallback(popup: Window, redirectUri: string, state: string, timeoutMs = 5 * 60_000): Promise<OAuthCallback> {
  const target = landing(redirectUri)
  const origin = target ? new URL(redirectUri).origin : null
  return new Promise((resolve, reject) => {
    let done = false
    let closedAt = 0
    const started = Date.now()

    const finish = (result: OAuthCallback | OAuthPopupError): void => {
      if (done) return
      done = true
      clearInterval(timer)
      window.removeEventListener('message', onMessage)
      try {
        if (!popup.closed) popup.close()
      } catch {
        // Nothing to close.
      }
      if (result instanceof OAuthPopupError) reject(result)
      else if (result.state !== state) reject(new OAuthPopupError('state', 'The authorization response does not match the request'))
      else resolve(result)
    }

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as ({ type?: unknown } & OAuthCallback) | null
      if (event.origin !== origin || !data || data.type !== OAUTH_MESSAGE) return
      const callback: OAuthCallback = { ...data }
      delete (callback as { type?: unknown }).type
      finish(callback)
    }
    window.addEventListener('message', onMessage)

    const timer = setInterval(() => {
      let href = ''
      try {
        href = popup.location.href
      } catch {
        // Cross-origin: still on the identity provider.
      }
      if (href && target && landing(href) === target) {
        const callback = parseCallbackUrl(href)
        if (callback) return finish(callback)
      }
      if (popup.closed) {
        // A relaying page closes itself right after posting: give its message a moment.
        closedAt ||= Date.now()
        if (Date.now() - closedAt > 800) finish(new OAuthPopupError('closed', 'The sign-in window was closed'))
      } else if (Date.now() - started > timeoutMs) {
        finish(new OAuthPopupError('timeout', 'The sign-in took too long'))
      }
    }, 150)
  })
}

/**
 * On a page opened as a sign-in popup and redirected back with an OAuth
 * response, posts the response to the opener (same origin only) and closes
 * the window. Returns whether it did. OpenApiReference calls it on mount;
 * a host with a dedicated redirect page calls it there.
 */
export function relayOAuthCallback(): boolean {
  if (typeof window === 'undefined') return false
  let opener: Window | null
  try {
    opener = window.opener as Window | null
    if (!opener || opener.closed || opener.location.origin !== window.location.origin) return false
  } catch {
    // A cross-origin opener: it reads the result by polling, if at all.
    return false
  }
  const callback = parseCallbackUrl(window.location.href)
  if (!callback) return false
  opener.postMessage({ type: OAUTH_MESSAGE, ...callback }, window.location.origin)
  window.close()
  return true
}
