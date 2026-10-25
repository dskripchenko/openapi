<script setup lang="ts">
/** The auth scheme of a request (or the shared one of a block) and the fields its kind needs. */
import { computed } from 'vue'
import { UidFormField, UidInput, UidSelect } from '@dskripchenko/ui'
import { OAUTH_FLOWS, type AuthKind, type AuthModel } from '../../blocks'
import type { BlockLabels } from './labels'

const props = defineProps<{
  auth: AuthModel
  labels: BlockLabels
  /** The name of "no auth of its own": "None" for one request, "Shared" under a shared scheme. */
  inheritLabel: string
  /** Offer an explicit "None (public)" too: it overrides a shared scheme. */
  allowNone?: boolean
}>()

const kinds = computed(() => {
  const list: { value: AuthKind; label: string }[] = [{ value: 'inherit', label: props.inheritLabel }]
  if (props.allowNone || props.auth.kind === 'none') list.push({ value: 'none', label: props.labels.authNone })
  for (const k of ['bearer', 'basic', 'apiKey', 'oauth2', 'openIdConnect'] as const) list.push({ value: k, label: props.labels[k] })
  return list
})
const locations = ['header', 'query', 'cookie'].map((v) => ({ value: v, label: v }))
const flows = OAUTH_FLOWS.map((v) => ({ value: v, label: v }))
const needsAuthUrl = computed(() => props.auth.flow === 'authorizationCode' || props.auth.flow === 'implicit')
const needsTokenUrl = computed(() => props.auth.flow !== 'implicit')
</script>

<template>
  <div class="oa-bk__auth">
    <UidFormField class="oa-bk__auth-kind" :label="labels.scheme">
      <UidSelect size="sm" :options="kinds" :model-value="auth.kind" @update:model-value="(v: unknown) => (auth.kind = v as AuthKind)" />
    </UidFormField>
    <template v-if="auth.kind === 'bearer'">
      <UidInput size="sm" :label="labels.bearerFormat" placeholder="JWT" v-model="auth.bearerFormat" />
    </template>
    <template v-else-if="auth.kind === 'apiKey'">
      <UidFormField :label="labels.keyIn">
        <UidSelect size="sm" :options="locations" :model-value="auth.in" @update:model-value="(v: unknown) => (auth.in = v as AuthModel['in'])" />
      </UidFormField>
      <UidInput size="sm" :label="labels.keyName" placeholder="X-API-Key" v-model="auth.name" />
    </template>
    <template v-else-if="auth.kind === 'oauth2'">
      <UidFormField :label="labels.flow">
        <UidSelect size="sm" :options="flows" :model-value="auth.flow" @update:model-value="(v: unknown) => (auth.flow = v as AuthModel['flow'])" />
      </UidFormField>
      <UidInput v-if="needsAuthUrl" class="oa-bk__wide" size="sm" :label="labels.authorizationUrl" placeholder="https://auth.example.com/authorize" v-model="auth.authorizationUrl" />
      <UidInput v-if="needsTokenUrl" class="oa-bk__wide" size="sm" :label="labels.tokenUrl" placeholder="https://auth.example.com/token" v-model="auth.tokenUrl" />
      <UidInput class="oa-bk__wide" size="sm" :label="labels.scopes" placeholder="read write" v-model="auth.scopes" />
    </template>
    <template v-else-if="auth.kind === 'openIdConnect'">
      <UidInput class="oa-bk__wide" size="sm" :label="labels.openIdConnectUrl" placeholder="https://auth.example.com/.well-known/openid-configuration" v-model="auth.url" />
      <UidInput class="oa-bk__wide" size="sm" :label="labels.scopes" placeholder="openid profile" v-model="auth.scopes" />
    </template>
  </div>
</template>
