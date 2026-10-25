<script setup lang="ts">
/**
 * Credentials for the document's security schemes. What the user types here
 * is applied to every request the page makes and every sample it prints.
 * OAuth2 and OpenID Connect get a token in place: client credentials and
 * password flows from the token endpoint, authorization code (with PKCE) and
 * implicit flows through a sign-in popup.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { UidButton, UidCheckbox, UidInput, UidMarkdown } from '@dskripchenko/ui'
import type { SecurityScheme } from '../core/types'
import {
  buildAuthorizeUrl,
  codeChallenge,
  createCodeVerifier,
  exchangeAuthorizationCode,
  fetchOAuthToken,
  fetchOpenIdConfiguration,
  randomToken,
  type OAuthToken,
  type OpenIdConfiguration,
  type SendFn,
} from '../request'
import type { BasicCredentials } from '../request/security'
import { useReference } from './context'
import { OAuthPopupError, openOAuthPopup, waitForOAuthCallback } from './oauthPopup'

const ctx = useReference()
const labels = ctx.labels

const schemes = computed(() =>
  Object.entries(ctx.spec.value.document.components?.securitySchemes ?? {})
    .map(([name, s]) => ({ name, scheme: ctx.spec.value.resolver.deref(s) as SecurityScheme | undefined }))
    .filter((s): s is { name: string; scheme: SecurityScheme } => !!s.scheme && s.scheme.type !== 'mutualTLS'),
)

const isBasic = (s: SecurityScheme): boolean => s.type === 'http' && (s.scheme ?? '').toLowerCase() === 'basic'
function basic(name: string): BasicCredentials {
  const v = ctx.credentials[name]
  if (typeof v === 'object') return v
  const created = reactive({ username: '', password: '' })
  ctx.credentials[name] = created
  return created
}
const hint = (s: SecurityScheme): string =>
  s.type === 'apiKey' ? `${s.in}: ${s.name}` : s.type === 'http' ? `${s.scheme}${s.bearerFormat ? ` (${s.bearerFormat})` : ''}` : s.type

/* ------------------------------ the flows ------------------------------- */

type Flow = 'authorizationCode' | 'implicit' | 'clientCredentials' | 'password'
const FLOWS: Flow[] = ['authorizationCode', 'implicit', 'clientCredentials', 'password']
const flowLabel = (f: Flow): string =>
  ({
    authorizationCode: labels.value.flowAuthorizationCode,
    implicit: labels.value.flowImplicit,
    clientCredentials: labels.value.flowClientCredentials,
    password: labels.value.flowPassword,
  })[f]
interface FlowInfo {
  authorizationUrl?: string
  tokenUrl?: string
  scopes: Record<string, string>
}

interface AuthState {
  flow: Flow | ''
  clientId: string
  clientSecret: string
  username: string
  password: string
  /** Empty: the default redirect URI. */
  redirectUri: string
  /** Scopes the user unticked; all are requested by default. */
  unchecked: string[]
  error: string
  busy: boolean
  discovery: OpenIdConfiguration | null
  discoveryError: string
}
const oauth = reactive<Record<string, AuthState>>({})
function oauthState(name: string): AuthState {
  return (oauth[name] ??= {
    flow: '',
    clientId: '',
    clientSecret: '',
    username: '',
    password: '',
    redirectUri: '',
    unchecked: [],
    error: '',
    busy: false,
    discovery: null,
    discoveryError: '',
  })
}

/** The usable flows of a scheme: from `flows`, or from the OpenID Connect discovery document. */
function flowsOf(name: string, s: SecurityScheme): Partial<Record<Flow, FlowInfo>> {
  const out: Partial<Record<Flow, FlowInfo>> = {}
  if (s.type === 'oauth2') {
    const f = s.flows ?? {}
    if (f.authorizationCode?.authorizationUrl && f.authorizationCode.tokenUrl) out.authorizationCode = f.authorizationCode
    if (f.implicit?.authorizationUrl) out.implicit = f.implicit
    if (f.clientCredentials?.tokenUrl) out.clientCredentials = f.clientCredentials
    if (f.password?.tokenUrl) out.password = f.password
  } else if (s.type === 'openIdConnect') {
    const d = oauthState(name).discovery
    if (!d) return out
    const scopes = Object.fromEntries(d.scopesSupported.map((x) => [x, '']))
    const auth = d.authorizationEndpoint
    const token = d.tokenEndpoint
    if (auth && token) out.authorizationCode = { authorizationUrl: auth, tokenUrl: token, scopes }
    if (auth && d.responseTypesSupported.some((t) => t.split(' ').includes('token'))) out.implicit = { authorizationUrl: auth, scopes }
    if (token && d.grantTypesSupported.includes('client_credentials')) out.clientCredentials = { tokenUrl: token, scopes }
    if (token && d.grantTypesSupported.includes('password')) out.password = { tokenUrl: token, scopes }
  }
  return out
}
const flowList = (name: string, s: SecurityScheme): Flow[] => FLOWS.filter((f) => flowsOf(name, s)[f])
function flowOf(name: string, s: SecurityScheme): Flow | null {
  const list = flowList(name, s)
  const chosen = oauthState(name).flow
  return chosen && list.includes(chosen) ? chosen : (list[0] ?? null)
}
const isRedirect = (f: Flow | null): boolean => f === 'authorizationCode' || f === 'implicit'

function scopesOf(name: string, s: SecurityScheme): [string, string][] {
  const f = flowOf(name, s)
  return f ? Object.entries(flowsOf(name, s)[f]?.scopes ?? {}) : []
}
function toggleScope(name: string, scope: string, on: boolean): void {
  const st = oauthState(name)
  st.unchecked = on ? st.unchecked.filter((x) => x !== scope) : [...st.unchecked, scope]
}
const checkedScopes = (name: string, s: SecurityScheme): string[] =>
  scopesOf(name, s)
    .map(([k]) => k)
    .filter((k) => !oauthState(name).unchecked.includes(k))

/** A URL from the spec, resolved like a relative server URL is. */
function absolute(url: string): string {
  try {
    return new URL(url, ctx.baseUrl.value ?? window.location.href).toString()
  } catch {
    return url
  }
}
const defaultRedirect = computed(() => {
  if (ctx.oauthRedirectUrl.value) return ctx.oauthRedirectUrl.value
  if (typeof window === 'undefined') return ''
  return window.location.origin + window.location.pathname
})
const redirectOf = (name: string): string => oauthState(name).redirectUri || defaultRedirect.value

/**
 * A fetch that goes through the reference's `send`, so the token request takes
 * the host's proxy like every try-it request (the token endpoint need not allow CORS).
 */
function fetchVia(send: SendFn): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: [string, string][] = []
    new Headers(init?.headers).forEach((v, k) => headers.push([k, v]))
    const text = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : undefined
    const mediaType = headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? 'application/x-www-form-urlencoded'
    const r = await send({ method: init?.method ?? 'GET', url: String(input), headers, body: text === undefined ? undefined : { mediaType, text } })
    if (r.error) throw new Error(r.error)
    return new Response(r.body, { status: r.status || 500, statusText: r.statusText, headers: r.headers })
  }) as typeof fetch
}

function store(name: string, token: OAuthToken): void {
  ctx.credentials[name] = token.accessToken
  now.value = Date.now()
  if (token.expiresIn !== undefined) ctx.tokenExpiry[name] = Date.now() + token.expiresIn * 1000
  else delete ctx.tokenExpiry[name]
}
const messageOf = (e: unknown): string => {
  if (e instanceof OAuthPopupError) {
    if (e.code === 'closed') return labels.value.popupClosed
    if (e.code === 'state') return labels.value.stateMismatch
  }
  return e instanceof Error ? e.message : String(e)
}

/** Client credentials and password: straight to the token endpoint. */
async function getToken(name: string, s: SecurityScheme): Promise<void> {
  const flow = flowOf(name, s)
  const info = flow && flowsOf(name, s)[flow]
  if ((flow !== 'clientCredentials' && flow !== 'password') || !info?.tokenUrl) return
  const st = oauthState(name)
  st.busy = true
  st.error = ''
  try {
    const token = await fetchOAuthToken(flow, {
      tokenUrl: absolute(info.tokenUrl),
      clientId: st.clientId,
      clientSecret: st.clientSecret || undefined,
      username: st.username,
      password: st.password,
      scopes: checkedScopes(name, s),
      fetch: fetchVia(ctx.send.value),
    })
    store(name, token)
  } catch (e) {
    st.error = messageOf(e)
  } finally {
    st.busy = false
  }
}

/** Authorization code and implicit: a sign-in popup, then (for a code) the token endpoint. */
async function authorize(name: string, s: SecurityScheme): Promise<void> {
  const flow = flowOf(name, s)
  const info = flow && flowsOf(name, s)[flow]
  if (!isRedirect(flow) || !info?.authorizationUrl) return
  const st = oauthState(name)
  st.error = ''
  // Opened before anything async, so the click still counts as the user's.
  const popup = openOAuthPopup()
  if (!popup) {
    st.error = labels.value.popupBlocked
    return
  }
  st.busy = true
  try {
    const state = randomToken(16)
    const redirectUri = redirectOf(name)
    const verifier = flow === 'authorizationCode' ? createCodeVerifier() : undefined
    popup.location.href = buildAuthorizeUrl({
      authorizationUrl: absolute(info.authorizationUrl),
      responseType: flow === 'implicit' ? 'token' : 'code',
      clientId: st.clientId,
      redirectUri,
      scopes: checkedScopes(name, s),
      state,
      ...(verifier ? { codeChallenge: await codeChallenge(verifier) } : {}),
    })
    const callback = await waitForOAuthCallback(popup, redirectUri, state)
    if (callback.error) throw new Error(callback.errorDescription ? `${callback.error}: ${callback.errorDescription}` : callback.error)
    if (flow === 'implicit') {
      if (!callback.accessToken) throw new Error('No access_token in the authorization response')
      store(name, { accessToken: callback.accessToken, ...(callback.expiresIn !== undefined ? { expiresIn: callback.expiresIn } : {}) })
    } else {
      if (!callback.code) throw new Error('No code in the authorization response')
      const token = await exchangeAuthorizationCode({
        tokenUrl: absolute(info.tokenUrl!),
        code: callback.code,
        redirectUri,
        clientId: st.clientId,
        clientSecret: st.clientSecret || undefined,
        codeVerifier: verifier,
        fetch: fetchVia(ctx.send.value),
      })
      store(name, token)
    }
  } catch (e) {
    try {
      if (!popup.closed) popup.close()
    } catch {
      // Already gone.
    }
    st.error = messageOf(e)
  } finally {
    st.busy = false
  }
}

/** Reads the OpenID Connect discovery documents, once each, when the panel opens. */
async function discover(name: string, s: SecurityScheme): Promise<void> {
  const st = oauthState(name)
  if (st.discovery || st.busy || !s.openIdConnectUrl) return
  st.busy = true
  st.discoveryError = ''
  try {
    st.discovery = await fetchOpenIdConfiguration(absolute(s.openIdConnectUrl), { fetch: fetchVia(ctx.send.value) })
  } catch (e) {
    st.discoveryError = messageOf(e)
  } finally {
    st.busy = false
  }
}

/* --------------------------- tokens and storage ------------------------- */

const hasValue = (name: string): boolean => {
  const v = ctx.credentials[name]
  return typeof v === 'object' ? !!(v.username || v.password) : !!v
}
function setToken(name: string, value: string): void {
  ctx.credentials[name] = value
  // A token typed by hand has no known expiry.
  delete ctx.tokenExpiry[name]
}
function logOut(name: string): void {
  delete ctx.credentials[name]
  delete ctx.tokenExpiry[name]
}

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => (ticker = setInterval(() => (now.value = Date.now()), 30_000)))
onBeforeUnmount(() => clearInterval(ticker))
function expiryText(name: string): string {
  const at = ctx.tokenExpiry[name]
  if (at === undefined || !hasValue(name)) return ''
  const minutes = Math.ceil((at - now.value) / 60_000)
  return minutes <= 0 ? labels.value.tokenExpired : labels.value.expiresIn.replace('{n}', String(minutes))
}

/** In the header's settings drawer the panel is always open and has no head of its own. */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const open = ref(props.embedded)
watch(open, (v) => {
  if (!v) return
  now.value = Date.now()
  for (const { name, scheme } of schemes.value) if (scheme.type === 'openIdConnect') void discover(name, scheme)
}, { immediate: true })
</script>

<template>
  <section v-if="schemes.length" class="oa-auth" :class="embedded ? 'oa-auth--embedded' : 'oa-panel'">
    <button v-if="!embedded" type="button" class="oa-panel__head oa-panel__head--button" :aria-expanded="open" @click="open = !open">
      <span class="oa-panel__title">{{ labels.authentication }}</span>
      <span class="oa-auth__names">{{ schemes.map((s) => s.name).join(', ') }}</span>
      <span class="oa-schema__chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
    </button>
    <div v-if="open" class="oa-auth__body">
      <div v-for="{ name, scheme } in schemes" :key="name" class="oa-auth__scheme" :data-scheme="name">
        <div class="oa-schema__row">
          <code class="oa-schema__name">{{ name }}</code>
          <span class="oa-schema__type">{{ hint(scheme) }}</span>
        </div>
        <UidMarkdown v-if="scheme.description" class="oa-md oa-md--small" :source="scheme.description" />
        <div v-if="isBasic(scheme)" class="oa-auth__row">
          <UidInput size="sm" :label="labels.username" v-model="basic(name).username" autocomplete="off" />
          <UidInput size="sm" :label="labels.password" type="password" v-model="basic(name).password" autocomplete="off" />
        </div>
        <UidInput
          v-else
          class="oa-auth__token"
          size="sm"
          :label="scheme.type === 'apiKey' ? scheme.name : labels.token"
          type="password"
          autocomplete="off"
          :model-value="typeof ctx.credentials[name] === 'string' ? (ctx.credentials[name] as string) : ''"
          @update:model-value="(v: string) => setToken(name, v)"
        />
        <div v-if="hasValue(name)" class="oa-auth__status">
          <span v-if="expiryText(name)" class="oa-auth__expiry">{{ expiryText(name) }}</span>
          <UidButton class="oa-auth__logout" size="sm" variant="ghost" @click="logOut(name)">{{ labels.logOut }}</UidButton>
        </div>
        <div v-if="oauthState(name).discoveryError" class="oa-tryit__warn">{{ oauthState(name).discoveryError }}</div>
        <div v-if="flowOf(name, scheme)" class="oa-auth__oauth">
          <div v-if="flowList(name, scheme).length > 1" class="oa-segmented oa-auth__flows" role="tablist">
            <button
              v-for="f in flowList(name, scheme)"
              :key="f"
              type="button"
              role="tab"
              class="oa-segmented__item"
              :class="{ 'is-active': flowOf(name, scheme) === f }"
              :aria-selected="flowOf(name, scheme) === f"
              :data-flow="f"
              @click="oauthState(name).flow = f"
            >
              {{ flowLabel(f) }}
            </button>
          </div>
          <div class="oa-auth__row">
            <UidInput size="sm" :label="labels.clientId" v-model="oauthState(name).clientId" autocomplete="off" />
            <UidInput
              v-if="flowOf(name, scheme) !== 'implicit'"
              size="sm"
              :label="labels.clientSecret"
              type="password"
              v-model="oauthState(name).clientSecret"
              autocomplete="off"
            />
          </div>
          <div v-if="flowOf(name, scheme) === 'password'" class="oa-auth__row">
            <UidInput size="sm" :label="labels.username" v-model="oauthState(name).username" autocomplete="off" />
            <UidInput size="sm" :label="labels.password" type="password" v-model="oauthState(name).password" autocomplete="off" />
          </div>
          <UidInput
            v-if="isRedirect(flowOf(name, scheme))"
            class="oa-auth__redirect"
            size="sm"
            :label="labels.redirectUri"
            :hint="labels.redirectHint"
            autocomplete="off"
            :model-value="redirectOf(name)"
            @update:model-value="(v: string) => (oauthState(name).redirectUri = v)"
          />
          <div v-if="scopesOf(name, scheme).length" class="oa-auth__scopes" role="group" :aria-label="labels.scopes">
            <span class="oa-auth__label">{{ labels.scopes }}</span>
            <UidCheckbox
              v-for="[scope, about] in scopesOf(name, scheme)"
              :key="scope"
              :label="scope"
              :hint="about || undefined"
              :model-value="!oauthState(name).unchecked.includes(scope)"
              @update:model-value="(v: boolean) => toggleScope(name, scope, v)"
            />
          </div>
          <div>
            <UidButton
              v-if="isRedirect(flowOf(name, scheme))"
              class="oa-auth__authorize"
              size="sm"
              variant="secondary"
              :loading="oauthState(name).busy"
              @click="authorize(name, scheme)"
            >
              {{ labels.authorize }}
            </UidButton>
            <UidButton v-else size="sm" variant="secondary" :loading="oauthState(name).busy" @click="getToken(name, scheme)">{{ labels.getToken }}</UidButton>
          </div>
          <div v-if="oauthState(name).error" class="oa-tryit__warn oa-auth__error">{{ oauthState(name).error }}</div>
        </div>
      </div>
      <div v-if="ctx.persistence.value" class="oa-auth__persist">
        <span>{{ labels.savedInBrowser }}</span>
        <UidButton class="oa-auth__forget" size="sm" variant="ghost" @click="ctx.forgetCredentials()">{{ labels.forget }}</UidButton>
      </div>
    </div>
  </section>
</template>
