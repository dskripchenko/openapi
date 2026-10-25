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
}

export const referenceKey: InjectionKey<ReferenceContext> = Symbol('openapi-reference')

export function useReference(): ReferenceContext {
  const ctx = inject(referenceKey)
  if (!ctx) throw new Error('OpenAPI reference parts must be used inside <OpenApiReference>')
  return ctx
}
