import { createApp, h, ref } from 'vue'
import '@dskripchenko/ui/styles/all.css'
import { OpenApiReference } from '../src/vue'
import '../src/vue/openapi.css'
import petstore from '../tests/fixtures/specs/petstore-30.yaml?raw'
import kitchen from '../tests/fixtures/specs/kitchen-sink-31.json?raw'
import swagger from '../tests/fixtures/specs/petstore-swagger2.json?raw'

const specs: Record<string, string> = { petstore, kitchen, swagger }
const params = new URLSearchParams(location.search)
const name = params.get('spec') ?? 'petstore'
document.documentElement.setAttribute('data-theme', params.get('theme') ?? 'light')
document.body.style.margin = '0'
document.body.style.background = 'var(--uid-surface-base, var(--uid-color-bg))'

createApp({
  setup() {
    const spec = ref(specs[name] ?? petstore)
    return () =>
      h('div', { style: 'padding: 16px 24px; max-width: 1440px; margin: 0 auto' }, [
        h(OpenApiReference, { spec: spec.value, locale: params.get('locale') ?? 'en' }),
      ])
  },
}).mount('#app')
