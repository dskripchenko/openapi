<script setup lang="ts">
/**
 * Credentials for the document's security schemes. What the user types here
 * is applied to every request the page makes and every sample it prints.
 * OAuth2 client-credentials and password flows can fetch a token in place.
 */
import { computed, reactive, ref } from 'vue'
import { UidButton, UidInput, UidMarkdown } from '@dskripchenko/ui'
import type { SecurityScheme } from '../core/types'
import { fetchOAuthToken, type SendFn } from '../request'
import type { BasicCredentials } from '../request/security'
import { useReference } from './context'

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

type Flow = 'clientCredentials' | 'password'
const oauth = reactive<Record<string, { clientId: string; clientSecret: string; username: string; password: string; error: string; busy: boolean }>>({})
const flowOf = (s: SecurityScheme): Flow | null =>
  s.flows?.clientCredentials?.tokenUrl ? 'clientCredentials' : s.flows?.password?.tokenUrl ? 'password' : null
function oauthState(name: string) {
  return (oauth[name] ??= { clientId: '', clientSecret: '', username: '', password: '', error: '', busy: false })
}
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

async function getToken(name: string, s: SecurityScheme): Promise<void> {
  const flow = flowOf(s)
  if (!flow) return
  const st = oauthState(name)
  st.busy = true
  st.error = ''
  try {
    const f = s.flows![flow]!
    const token = await fetchOAuthToken(flow, {
      tokenUrl: f.tokenUrl!,
      clientId: st.clientId,
      clientSecret: st.clientSecret || undefined,
      username: st.username,
      password: st.password,
      scopes: Object.keys(f.scopes ?? {}),
      fetch: fetchVia(ctx.send.value),
    })
    ctx.credentials[name] = token.accessToken
  } catch (e) {
    st.error = e instanceof Error ? e.message : String(e)
  } finally {
    st.busy = false
  }
}
const open = ref(false)
</script>

<template>
  <section v-if="schemes.length" class="oa-panel oa-auth">
    <button type="button" class="oa-panel__head oa-panel__head--button" :aria-expanded="open" @click="open = !open">
      <span class="oa-panel__title">{{ labels.authentication }}</span>
      <span class="oa-auth__names">{{ schemes.map((s) => s.name).join(', ') }}</span>
      <span class="oa-schema__chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
    </button>
    <div v-if="open" class="oa-auth__body">
      <div v-for="{ name, scheme } in schemes" :key="name" class="oa-auth__scheme">
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
          size="sm"
          :label="scheme.type === 'apiKey' ? scheme.name : labels.token"
          type="password"
          autocomplete="off"
          :model-value="typeof ctx.credentials[name] === 'string' ? (ctx.credentials[name] as string) : ''"
          @update:model-value="(v: string) => (ctx.credentials[name] = v)"
        />
        <div v-if="flowOf(scheme)" class="oa-auth__oauth">
          <div class="oa-auth__row">
            <UidInput size="sm" :label="labels.clientId" v-model="oauthState(name).clientId" autocomplete="off" />
            <UidInput size="sm" :label="labels.clientSecret" type="password" v-model="oauthState(name).clientSecret" autocomplete="off" />
          </div>
          <div v-if="flowOf(scheme) === 'password'" class="oa-auth__row">
            <UidInput size="sm" :label="labels.username" v-model="oauthState(name).username" autocomplete="off" />
            <UidInput size="sm" :label="labels.password" type="password" v-model="oauthState(name).password" autocomplete="off" />
          </div>
          <UidButton size="sm" variant="secondary" :loading="oauthState(name).busy" @click="getToken(name, scheme)">{{ labels.getToken }}</UidButton>
          <div v-if="oauthState(name).error" class="oa-tryit__warn">{{ oauthState(name).error }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
