<script setup lang="ts">
/** One security scheme: the fields of its type. */
import { computed } from 'vue'
import { UidInput, UidSelect, UidTextarea } from '@dskripchenko/ui'
import { useEditor } from './context'
import { bind, setField, type Doc } from './state'

const props = defineProps<{ name: string }>()
const { editor, labels } = useEditor()
const scheme = computed<Doc>(() => editor.doc.value!.components.securitySchemes[props.name])

const KEEP = new Set(['type', 'description'])
function setType(t: unknown): void {
  const s = scheme.value
  for (const k of Object.keys(s)) if (!KEEP.has(k)) delete s[k]
  s.type = t
  if (t === 'apiKey') Object.assign(s, { in: 'header', name: 'X-API-Key' })
  if (t === 'http') s.scheme = 'bearer'
  if (t === 'oauth2') s.flows = { clientCredentials: { tokenUrl: 'https://auth.example.com/token', scopes: {} } }
  if (t === 'openIdConnect') s.openIdConnectUrl = 'https://auth.example.com/.well-known/openid-configuration'
}

const flowName = computed(() => Object.keys(scheme.value.flows ?? {})[0] ?? 'clientCredentials')
const flow = computed<Doc | undefined>(() => scheme.value.flows?.[flowName.value])
function setFlow(name: unknown): void {
  const prev = flow.value ?? { scopes: {} }
  scheme.value.flows = { [String(name)]: prev }
}
const scopesText = computed({
  get: () => Object.entries(flow.value?.scopes ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
  set: (text: string) => {
    if (!flow.value) return
    flow.value.scopes = Object.fromEntries(
      text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const i = l.indexOf(':')
        return i === -1 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
    )
  },
})
</script>

<template>
  <div class="oa-ef">
    <UidSelect
      size="sm"
      :options="['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS'].map((t) => ({ value: t, label: t }))"
      :model-value="scheme.type"
      @update:model-value="setType"
    />
    <UidTextarea size="sm" :rows="1" auto-grow :placeholder="labels.description" v-bind="bind(scheme, 'description')" />
    <div v-if="scheme.type === 'apiKey'" class="oa-es__grid">
      <UidInput size="sm" :label="labels.headerName" v-bind="bind(scheme, 'name')" />
      <UidSelect size="sm" :options="['header', 'query', 'cookie'].map((x) => ({ value: x, label: x }))" :model-value="scheme.in" @update:model-value="(v: unknown) => (scheme.in = v)" />
    </div>
    <div v-if="scheme.type === 'http'" class="oa-es__grid">
      <UidSelect size="sm" :options="['bearer', 'basic', 'digest'].map((x) => ({ value: x, label: x }))" :model-value="scheme.scheme" @update:model-value="(v: unknown) => (scheme.scheme = v)" />
      <UidInput v-if="scheme.scheme === 'bearer'" size="sm" :label="labels.bearerFormat" v-bind="bind(scheme, 'bearerFormat')" />
    </div>
    <template v-if="scheme.type === 'oauth2'">
      <UidSelect
        size="sm"
        :options="['clientCredentials', 'password', 'authorizationCode', 'implicit'].map((x) => ({ value: x, label: x }))"
        :model-value="flowName"
        @update:model-value="setFlow"
      />
      <div v-if="flow" class="oa-es__grid">
        <UidInput v-if="flowName === 'authorizationCode' || flowName === 'implicit'" size="sm" :label="labels.authorizationUrl" v-bind="bind(flow, 'authorizationUrl')" />
        <UidInput v-if="flowName !== 'implicit'" size="sm" :label="labels.tokenUrl" v-bind="bind(flow, 'tokenUrl')" />
      </div>
      <UidTextarea size="sm" :label="labels.scopes" :rows="3" auto-grow :model-value="scopesText" @update:model-value="(v: string) => (scopesText = v)" />
    </template>
    <UidInput v-if="scheme.type === 'openIdConnect'" size="sm" :label="labels.openIdConnectUrl" v-bind="bind(scheme, 'openIdConnectUrl')" />
  </div>
</template>
