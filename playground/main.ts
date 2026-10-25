import { createApp, h, ref } from 'vue'
import '@dskripchenko/ui/styles/all.css'
import { OpenApiBlock, OpenApiEditor, OpenApiOperation, OpenApiReference } from '../src/vue'
import '../src/vue/openapi.css'
import petstore from '../tests/fixtures/specs/petstore-30.yaml?raw'
import kitchen from '../tests/fixtures/specs/kitchen-sink-31.json?raw'
import swagger from '../tests/fixtures/specs/petstore-swagger2.json?raw'
import oauth from '../tests/fixtures/specs/oauth-31.json?raw'

const specs: Record<string, string> = { petstore, kitchen, swagger, oauth, empty: '' }

// ?mode=block: an API block, as a WYSIWYG editor would hold it.
const BLOCK = `method: POST
url: https://api.example.com/v1/users/{id}
summary: Update a user
description: Changes the user's **name** and age.
auth: bearer
params:
  path: { id: integer }
  query:
    notify: { type: boolean, description: Send an email, example: true }
body:
  example: { name: Ann, age: 31 }
responses:
  200: { description: The updated user, example: { id: 7, name: Ann, age: 31 } }
  404: Not found
`
const params = new URLSearchParams(location.search)
const mode = params.get('mode') ?? 'reference'
const name = params.get('spec') ?? (mode === 'embed' ? 'kitchen' : 'petstore')
document.documentElement.setAttribute('data-theme', params.get('theme') ?? 'light')
document.body.style.margin = '0'
document.body.style.background = 'var(--uid-surface-base, var(--uid-color-bg))'

declare global {
  interface Window {
    __text: () => string
  }
}

// ?url=/local/spec.json loads a spec over HTTP (files in playground/public/local are not committed).
const url = params.get('url')
const initial = url ? await (await fetch(url)).text() : mode === 'block' ? BLOCK : (specs[name] ?? petstore)

createApp({
  setup() {
    const text = ref(initial)
    window.__text = () => text.value
    const locale = params.get('locale') ?? 'en'
    return () =>
      h('div', { style: 'padding: 16px 24px; max-width: 1440px; margin: 0 auto' }, [
        // ?mode=embed&op=createOrder: one operation in an article, as OpenApiOperation.
        mode === 'block'
          ? h('article', { class: 'playground-article', style: 'max-width: 980px; margin: 0 auto' }, [
              h('h1', { style: 'font: 600 22px/1.3 var(--uid-font-family-sans); color: var(--uid-text-primary)' }, 'A page with an API block'),
              h(OpenApiBlock, {
                source: text.value,
                'onUpdate:source': (v: string) => (text.value = v),
                editable: !params.has('readonly'),
                tab: (params.get('tab') as 'preview' | 'source' | 'constructor' | null) ?? 'preview',
                locale,
                debounce: 150,
              }),
            ])
          : mode === 'embed'
          ? h('article', { class: 'playground-article', style: 'max-width: 1100px; margin: 0 auto' }, [
              h('h1', 'An article with an operation'),
              h('p', 'The operation below is embedded with OpenApiOperation.'),
              h(OpenApiOperation, { spec: text.value, operation: params.get('op') ?? 'createOrder', locale, referenceUrl: '/?spec=kitchen' }),
            ])
          : mode === 'editor'
          ? h(OpenApiEditor, {
              modelValue: text.value,
              'onUpdate:modelValue': (v: string) => (text.value = v),
              locale,
              view: (params.get('view') as 'visual' | 'source' | 'preview' | null) ?? 'visual',
            })
          : params.has('multi') || (!params.has('spec') && !params.has('url'))
            ? h(OpenApiReference, {
                locale,
                specs: [
                  { id: 'pets', spec: petstore },
                  { id: 'shop', name: 'Kitchen Sink', spec: kitchen },
                  // A loader: fetched the first time the spec is opened.
                  { id: 'legacy', name: 'Swagger 2.0', spec: () => new Promise((r) => setTimeout(() => r(swagger), 300)) },
                ],
              })
            : h(OpenApiReference, {
                spec: text.value,
                locale,
                // ?persist=local|session keeps credentials between visits.
                persistCredentials: (params.get('persist') as 'local' | 'session' | null) ?? false,
              }),
      ])
  },
}).mount('#app')
