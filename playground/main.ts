import { createApp, h, ref } from 'vue'
import '@dskripchenko/ui/styles/all.css'
import { OpenApiEditor, OpenApiReference } from '../src/vue'
import '../src/vue/openapi.css'
import petstore from '../tests/fixtures/specs/petstore-30.yaml?raw'
import kitchen from '../tests/fixtures/specs/kitchen-sink-31.json?raw'
import swagger from '../tests/fixtures/specs/petstore-swagger2.json?raw'

const specs: Record<string, string> = { petstore, kitchen, swagger, empty: '' }
const params = new URLSearchParams(location.search)
const name = params.get('spec') ?? 'petstore'
const mode = params.get('mode') ?? 'reference'
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
const initial = url ? await (await fetch(url)).text() : (specs[name] ?? petstore)

createApp({
  setup() {
    const text = ref(initial)
    window.__text = () => text.value
    const locale = params.get('locale') ?? 'en'
    return () =>
      h('div', { style: 'padding: 16px 24px; max-width: 1440px; margin: 0 auto' }, [
        mode === 'editor'
          ? h(OpenApiEditor, {
              modelValue: text.value,
              'onUpdate:modelValue': (v: string) => (text.value = v),
              locale,
              view: (params.get('view') as 'visual' | 'source' | 'preview' | null) ?? 'visual',
            })
          : h(OpenApiReference, { spec: text.value, locale }),
      ])
  },
}).mount('#app')
