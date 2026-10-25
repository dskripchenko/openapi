/**
 * What every part of the reference shares: the loaded spec, the strings, the
 * chosen server, the credentials the user typed, and how requests are sent.
 */
import { inject, type InjectionKey, type Ref } from 'vue'
import type { LoadedSpec } from '../model'
import type { SendFn } from '../request'
import type { BasicCredentials } from '../request/security'
import type { SnippetTarget } from '../snippets'
import type { OpenApiLabels } from './labels'

export interface ServerState {
  /** Index into the document's servers, or -1 for a custom URL. */
  index: number
  custom: string
  variables: Record<string, string>
}

/** A spec as given: YAML/JSON text, a parsed object, or a loader of either. */
export type SpecInput = string | object | (() => Promise<string | object>)

/** One of several specs on a page. */
export interface SpecSource {
  /** Stable id: the deep-link prefix and the `active` value. */
  id: string
  /** The switcher's label; the spec's title once loaded, else the id. */
  name?: string
  spec: SpecInput
}

export interface ReferenceContext {
  spec: Ref<LoadedSpec>
  labels: Ref<OpenApiLabels>
  server: ServerState
  /** Values per security scheme name: a key/token, or basic credentials. */
  credentials: Record<string, string | BasicCredentials>
  snippetTarget: Ref<SnippetTarget>
  snippetTargets: Ref<SnippetTarget[]>
  send: Ref<SendFn>
  tryIt: Ref<boolean>
  /** Resolves a relative server URL; the page origin by default. */
  baseUrl: Ref<string | undefined>
  /** Prefix of the section ids: `{specId}/` when the page has several specs. */
  anchorPrefix: Ref<string>
  /** When each scheme's token expires (epoch ms), if the token endpoint said so. */
  tokenExpiry: Record<string, number>
  /** The OAuth redirect URI; the page URL without query and fragment by default. */
  oauthRedirectUrl: Ref<string | undefined>
  /** Where credentials are kept between visits, or null when they are not kept. */
  persistence: Ref<'session' | 'local' | null>
  /** Clears the open spec's credentials, in memory and in the browser's storage. */
  forgetCredentials: () => void
}

export const referenceKey: InjectionKey<ReferenceContext> = Symbol('openapi-reference')

export function useReference(): ReferenceContext {
  const ctx = inject(referenceKey)
  if (!ctx) throw new Error('OpenAPI reference parts must be used inside <OpenApiReference>')
  return ctx
}
