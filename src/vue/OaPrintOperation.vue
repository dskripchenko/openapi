<script setup lang="ts">
/**
 * One operation for paper: everything the reference shows, laid out
 * statically — no toggles, no try-it, schemas fully expanded, the default
 * examples and a request sample. Credentials are never printed: the security
 * section names the schemes, and the sample is built without them.
 */
import { computed } from 'vue'
import { UidMarkdown } from '@dskripchenko/ui'
import type { Header, MediaType, Parameter, RequestBody, Response, SecurityScheme } from '../core/types'
import type { OperationEntry } from '../model'
import { joinUrl } from '../request'
import { describe as describeSchema } from '../schema'
import { generateSnippet, SNIPPET_TARGETS } from '../snippets'
import { useReference, type ReferenceContext } from './context'
import { createDraft, currentServer, defaultExample, exampleText, mediaTypes } from './draft'
import OaPrintSchema from './OaPrintSchema.vue'
import { safeHref } from './safe'

const props = withDefaults(
  defineProps<{
    entry: OperationEntry
    /** The operation's address (its canonical anchor), printed under it. */
    url?: string
    /** A page of its own: the footer with the API, the date and the address. */
    standalone?: boolean
  }>(),
  { url: undefined, standalone: true },
)
const ctx = useReference()
const labels = ctx.labels
const doc = computed(() => ctx.spec.value.document)
const deref = <T,>(v: unknown): T | undefined => ctx.spec.value.resolver.deref(v as never) as T | undefined
const resolveRef = (r: string) => ctx.spec.value.resolver.get(r) as never
const op = computed(() => props.entry.operation)
const title = computed(() => op.value.summary || `${props.entry.method.toUpperCase()} ${props.entry.path}`)
const fullUrl = computed(() => (props.entry.webhook ? props.entry.path : joinUrl(currentServer(ctx, props.entry), props.entry.path)))

/* Security: the requirement alternatives, by scheme name and kind. */
function schemeKind(s: SecurityScheme | undefined): string {
  if (!s) return ''
  if (s.type === 'apiKey') return `API key (${s.in ?? 'header'}: ${s.name ?? ''})`
  if (s.type === 'http') return `HTTP ${s.scheme ?? ''}${s.bearerFormat ? ` (${s.bearerFormat})` : ''}`.trim()
  if (s.type === 'oauth2') return `OAuth 2.0 (${Object.keys(s.flows ?? {}).join(', ')})`
  if (s.type === 'openIdConnect') return 'OpenID Connect'
  return s.type
}
const security = computed(() => {
  const requirements = op.value.security ?? doc.value.security ?? []
  const schemes = doc.value.components?.securitySchemes ?? {}
  return requirements.map((req) =>
    Object.entries(req).map(([name, scopes]) => ({ name, kind: schemeKind(deref<SecurityScheme>(schemes[name])), scopes })),
  )
})

const paramType = (p: Parameter): string => (p.schema ? describeSchema(p.schema, { resolve: resolveRef }) : Object.keys(p.content ?? {})[0] ?? '')
const json = (v: unknown): string => JSON.stringify(v)

const body = computed(() => deref<RequestBody>(op.value.requestBody))
const bodies = computed(() => mediaTypes(body.value).map((type) => ({ type, media: body.value!.content[type]! })))
const example = (media: MediaType, type: string, mode: 'request' | 'response'): string =>
  exampleText(media, defaultExample(media, ctx), ctx, type, mode)

const responses = computed(() =>
  Object.entries(op.value.responses ?? {}).map(([code, r]) => {
    const response = deref<Response>(r)
    return {
      code,
      response,
      headers: Object.entries(response?.headers ?? {}).map(([name, h]) => ({ name, header: deref<Header>(h) })),
      contents: Object.entries(response?.content ?? {}).map(([type, media]) => ({ type, media })),
    }
  }),
)

/* The sample: a fresh draft without the typed credentials, in the chosen language and in curl. */
const sampleCtx: ReferenceContext = { ...ctx, credentials: {}, tokenExpiry: {} }
const draft = props.entry.webhook ? null : createDraft(props.entry, sampleCtx)
const samples = computed(() => {
  if (!draft) return []
  const chosen = SNIPPET_TARGETS.find((t) => t.id === ctx.snippetTarget.value) ?? SNIPPET_TARGETS[0]!
  const targets = chosen.id === 'curl' ? [chosen] : [chosen, SNIPPET_TARGETS.find((t) => t.id === 'curl')!]
  return targets.map((t) => ({ label: t.label, code: generateSnippet(t.id, draft.request) }))
})

const today = new Date().toISOString().slice(0, 10)
</script>

<template>
  <article class="oap-op" :data-operation="entry.id">
    <header class="oap-op__head">
      <h1 class="oap-op__title">
        {{ title }}
        <span v-if="entry.deprecated" class="oap-flag oap-flag--deprecated">{{ labels.deprecated }}</span>
      </h1>
      <p class="oap-call">
        <span class="oap-method" :class="`oap-method--${entry.method}`">{{ entry.method.toUpperCase() }}</span>
        <code class="oap-call__url">{{ fullUrl }}</code>
      </p>
      <dl class="oap-meta">
        <template v-if="op.operationId">
          <dt>{{ labels.operationId }}</dt>
          <dd><code>{{ op.operationId }}</code></dd>
        </template>
        <template v-if="entry.tags.length">
          <dt>{{ labels.tags }}</dt>
          <dd>{{ entry.tags.join(', ') }}</dd>
        </template>
        <template v-if="url && !standalone">
          <dt>URL</dt>
          <dd><a class="oap-url" :href="url">{{ url }}</a></dd>
        </template>
      </dl>
    </header>

    <UidMarkdown v-if="op.description" class="oap-md" :source="op.description" />
    <p v-if="safeHref(op.externalDocs?.url)" class="oap-note">
      <a :href="safeHref(op.externalDocs?.url)">{{ op.externalDocs?.description || labels.externalDocs }}</a>
    </p>

    <section v-if="security.length" class="oap-section">
      <h2>{{ labels.security }}</h2>
      <ul class="oap-security">
        <li v-for="(req, i) in security" :key="i">
          <template v-if="!req.length">{{ labels.noSecurity }}</template>
          <template v-for="(s, j) in req" :key="s.name">
            <template v-if="j"> + </template>
            <code>{{ s.name }}</code> — {{ s.kind }}<template v-if="s.scopes.length"> ({{ labels.scopes }}: {{ s.scopes.join(', ') }})</template>
          </template>
        </li>
      </ul>
    </section>

    <section v-if="entry.parameters.length" class="oap-section">
      <h2>{{ labels.parameters }}</h2>
      <table class="oap-table">
        <thead>
          <tr><th>{{ labels.name }}</th><th>{{ labels.location }}</th><th>{{ labels.type }}</th><th>{{ labels.required }}</th><th>{{ labels.description }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in entry.parameters" :key="`${p.in}:${p.name}`">
            <td><code>{{ p.name }}</code></td>
            <td>{{ p.in }}</td>
            <td><code>{{ paramType(p) }}</code></td>
            <td>{{ p.required ? '✓' : '' }}</td>
            <td>
              <span v-if="p.deprecated" class="oap-flag oap-flag--deprecated">{{ labels.deprecated }}</span>
              <UidMarkdown v-if="p.description" class="oap-md" :source="p.description" />
              <div v-if="p.schema?.enum" class="oap-note">{{ labels.enum }}: <code v-for="(e, i) in p.schema.enum" :key="i">{{ json(e) }}</code></div>
              <div v-if="p.schema?.default !== undefined" class="oap-note">{{ labels.default }}: <code>{{ json(p.schema.default) }}</code></div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="body" class="oap-section">
      <h2>
        {{ labels.requestBody }}
        <span v-if="body.required" class="oap-required">{{ labels.required }}</span>
      </h2>
      <UidMarkdown v-if="body.description" class="oap-md" :source="body.description" />
      <div v-for="b in bodies" :key="b.type" class="oap-media">
        <h3><code>{{ b.type }}</code></h3>
        <OaPrintSchema v-if="b.media.schema" :schema="b.media.schema" mode="request" />
        <template v-if="example(b.media, b.type, 'request')">
          <h4>{{ labels.example }}</h4>
          <pre class="oap-code">{{ example(b.media, b.type, 'request') }}</pre>
        </template>
      </div>
    </section>

    <section v-if="responses.length" class="oap-section">
      <h2>{{ labels.responses }}</h2>
      <div v-for="r in responses" :key="r.code" class="oap-response">
        <h3><span class="oap-status">{{ r.code }}</span> {{ r.response?.description }}</h3>
        <table v-if="r.headers.length" class="oap-table">
          <thead><tr><th>{{ labels.headers }}</th><th>{{ labels.type }}</th><th>{{ labels.description }}</th></tr></thead>
          <tbody>
            <tr v-for="h in r.headers" :key="h.name">
              <td><code>{{ h.name }}</code></td>
              <td><code>{{ h.header?.schema ? describeSchema(h.header.schema, { resolve: resolveRef }) : '' }}</code></td>
              <td>{{ h.header?.description }}</td>
            </tr>
          </tbody>
        </table>
        <div v-for="c in r.contents" :key="c.type" class="oap-media">
          <h4><code>{{ c.type }}</code></h4>
          <OaPrintSchema v-if="c.media.schema" :schema="c.media.schema" mode="response" />
          <template v-if="example(c.media, c.type, 'response')">
            <h4>{{ labels.example }}</h4>
            <pre class="oap-code">{{ example(c.media, c.type, 'response') }}</pre>
          </template>
        </div>
      </div>
    </section>

    <section v-if="samples.length" class="oap-section">
      <h2>{{ labels.requestSample }}</h2>
      <div v-for="s in samples" :key="s.label" class="oap-media">
        <h3>{{ s.label }}</h3>
        <pre class="oap-code">{{ s.code }}</pre>
      </div>
    </section>

    <footer v-if="standalone" class="oap-footer">
      <span>{{ doc.info.title }} · {{ doc.info.version }}</span>
      <span>{{ labels.generatedOn }} {{ today }}</span>
      <a v-if="url" class="oap-url" :href="url">{{ url }}</a>
    </footer>
  </article>
</template>
