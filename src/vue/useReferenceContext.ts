/**
 * The shared state behind a reference and an embedded operation: loading the
 * spec, the chosen server, the credentials (kept between visits when asked),
 * the OAuth relay, how requests are sent and printed, the strings and the
 * kit's locale. OpenApiReference and OpenApiOperation both call it and
 * provide the same ReferenceContext to the parts below them.
 */
import { computed, onMounted, provide, reactive, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { en as uidEn, ru as uidRu } from '@dskripchenko/ui'
import { loadSpec } from '../load'
import type { LoadedSpec, ResolverOptions } from '../model'
import { sendRequest, type SendFn } from '../request'
import type { SnippetTarget } from '../snippets'
import { referenceKey, type ReferenceContext, type SpecInput, type SpecSource } from './context'
import { LOCALES, en, type OpenApiLabels } from './labels'
import { relayOAuthCallback } from './oauthPopup'
import { credentialsKey, persistMode, usePersistedCredentials } from './persist'

/** The props a reference and an embed share; read reactively. */
export interface ReferenceSettings {
  send?: SendFn
  tryIt?: boolean
  locale?: string
  labels?: Partial<OpenApiLabels>
  snippetTargets?: SnippetTarget[]
  defaultSnippet?: SnippetTarget
  baseUrl?: string
  external?: ResolverOptions['external']
  persistCredentials?: boolean | 'session' | 'local'
  oauthRedirectUrl?: string
}

/** Turns a spec input into a loaded spec, at once or later. */
export type SpecObtainer = (input: SpecInput, external: ResolverOptions['external'] | undefined) => LoadedSpec | Promise<LoadedSpec>

export interface ReferenceSetup {
  /** The specs to choose from. */
  sources: () => SpecSource[]
  /** The id open first. */
  initial: string
  /** The prefix of section ids for the open spec. */
  anchorPrefix: (activeId: string) => string
  /** How an input becomes a spec; a loader is awaited and the text parsed by default. */
  obtain?: SpecObtainer
  /** Runs on a switch to another spec, after the credentials are swapped and before it loads. */
  onSwitch?: (id: string) => void
  onLoaded?: (spec: LoadedSpec, id: string) => void
  onError?: (error: Error, id: string) => void
}

export interface ReferenceState {
  ctx: ReferenceContext
  loaded: ShallowRef<LoadedSpec | null>
  loading: Ref<boolean>
  loadError: Ref<string | null>
  activeId: Ref<string>
  /** Loaded specs by id, kept while their source stays the same. */
  cache: Map<string, { input: SpecInput; spec: LoadedSpec }>
  labels: Ref<OpenApiLabels>
  /** The kit's locale when `locale` is set; undefined leaves the host's UidLocaleProvider in charge. */
  kitLocale: Ref<typeof uidEn | undefined>
  load: (id: string) => Promise<void>
  /** Opens another spec: its own credentials come back, the current ones are kept for later. */
  open: (id: string) => Promise<void>
}

/** Text and objects load at once (the first render already shows them); a loader is awaited. */
const defaultObtain: SpecObtainer = (input, external) => {
  const opts = external ? { external } : {}
  if (typeof input === 'function') return (input as () => Promise<string | object>)().then((value) => loadSpec(value, opts))
  return loadSpec(input, opts)
}

export function useReferenceContext(props: ReferenceSettings, setup: ReferenceSetup): ReferenceState {
  const obtain = setup.obtain ?? defaultObtain
  const activeId = ref(setup.initial)
  const cache = new Map<string, { input: SpecInput; spec: LoadedSpec }>()
  const loaded = shallowRef<LoadedSpec | null>(null)
  const loadError = ref<string | null>(null)
  const loading = ref(false)
  let ticket = 0

  async function load(id: string): Promise<void> {
    const source = setup.sources().find((s) => s.id === id)
    const my = ++ticket
    if (!source) {
      loaded.value = null
      return
    }
    const hit = cache.get(id)
    // A loader is matched by the spec's id: an inline `specs` array makes new
    // functions on every render, and they must not fetch again.
    const same = hit && (hit.input === source.spec || (typeof hit.input === 'function' && typeof source.spec === 'function'))
    if (hit && same) {
      loaded.value = hit.spec
      loadError.value = null
      return
    }
    try {
      const result = obtain(source.spec, props.external)
      // Text and objects load at once; only a pending load shows the spinner.
      let spec: LoadedSpec
      if (result instanceof Promise) {
        loading.value = true
        spec = await result
        if (my !== ticket) return
      } else spec = result
      cache.set(id, { input: source.spec, spec })
      loaded.value = spec
      loadError.value = null
      setup.onLoaded?.(spec, id)
    } catch (error) {
      if (my !== ticket) return
      loaded.value = null
      loadError.value = error instanceof Error ? error.message : String(error)
      setup.onError?.(error instanceof Error ? error : new Error(String(error)), id)
    } finally {
      if (my === ticket) loading.value = false
    }
  }

  /** Credentials typed per spec, kept across switches. */
  const savedCredentials = new Map<string, Record<string, unknown>>()
  const savedExpiry = new Map<string, Record<string, number>>()

  async function open(id: string): Promise<void> {
    if (!setup.sources().some((s) => s.id === id)) return
    savedCredentials.set(activeId.value, { ...ctx.credentials })
    for (const k of Object.keys(ctx.credentials)) delete ctx.credentials[k]
    Object.assign(ctx.credentials, savedCredentials.get(id) ?? {})
    savedExpiry.set(activeId.value, { ...ctx.tokenExpiry })
    for (const k of Object.keys(ctx.tokenExpiry)) delete ctx.tokenExpiry[k]
    Object.assign(ctx.tokenExpiry, savedExpiry.get(id) ?? {})
    activeId.value = id
    setup.onSwitch?.(id)
    await load(id)
  }

  watch(
    () => [setup.sources(), props.external],
    () => {
      if (props.external) cache.clear()
      const sources = setup.sources()
      if (!sources.some((s) => s.id === activeId.value)) activeId.value = sources[0]?.id ?? setup.initial
      void load(activeId.value)
    },
  )

  const labels = computed<OpenApiLabels>(() => ({ ...(LOCALES[props.locale ?? 'en'] ?? en), ...props.labels }))
  const kitLocale = computed(() => (props.locale === 'ru' ? uidRu : props.locale === 'en' ? uidEn : undefined))

  const defaultSend: SendFn = (req, options) => sendRequest(req, options?.signal ? { signal: options.signal } : {})
  const ctx: ReferenceContext = {
    spec: computed(() => loaded.value!) as ReferenceContext['spec'],
    labels,
    server: reactive({ index: 0, custom: '', variables: {} }),
    credentials: reactive({}),
    snippetTarget: ref(props.defaultSnippet ?? 'curl'),
    snippetTargets: computed(() => props.snippetTargets ?? []),
    send: computed(() => props.send ?? defaultSend),
    tryIt: computed(() => props.tryIt ?? true),
    baseUrl: computed(() => props.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : undefined)),
    anchorPrefix: computed(() => setup.anchorPrefix(activeId.value)),
    prefill: shallowRef(null),
    tokenExpiry: reactive({}),
    oauthRedirectUrl: computed(() => props.oauthRedirectUrl),
    persistence: computed(() => persistMode(props.persistCredentials)),
    forgetCredentials: () => persisted.forget(),
  }
  provide(referenceKey, ctx)
  // The key exists once the open spec has loaded (not while a switch is still loading it).
  const persisted = usePersistedCredentials(
    ctx,
    () => ctx.persistence.value,
    () => {
      const spec = loaded.value
      return spec && cache.get(activeId.value)?.spec === spec ? credentialsKey(activeId.value, spec.document.info.title) : null
    },
  )
  // Loaded in a sign-in popup and redirected back: hand the result to the opener.
  onMounted(relayOAuthCallback)
  void load(activeId.value)

  watch(
    loaded,
    (spec) => {
      const first = spec?.document.servers?.[0]
      ctx.server.index = 0
      ctx.server.variables = Object.fromEntries(Object.entries(first?.variables ?? {}).map(([k, v]) => [k, v.default]))
    },
    { immediate: true },
  )

  return { ctx, loaded, loading, loadError, activeId, cache, labels, kitLocale, load, open }
}
