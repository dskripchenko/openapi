<script setup lang="ts">
/** The server requests go to: one of the document's, or a custom URL, with its variables. */
import { computed } from 'vue'
import { UidInput, UidSelect } from '@dskripchenko/ui'
import type { Server } from '../core/types'
import { useReference } from './context'
import { currentServer } from './draft'

const ctx = useReference()
const labels = ctx.labels
const servers = computed<Server[]>(() => ctx.spec.value.document.servers ?? [])
const options = computed(() => [
  ...servers.value.map((s, i) => ({ value: i, label: s.description ? `${s.description} — ${s.url}` : s.url })),
  { value: -1, label: labels.value.customServer },
])
const current = computed(() => (ctx.server.index === -1 ? undefined : servers.value[ctx.server.index]))
/** The URL as it will be called, variables filled in. */
const resolved = computed(() => currentServer(ctx))

function choose(v: unknown): void {
  if (typeof v !== 'number') return
  ctx.server.index = v
  ctx.server.variables = Object.fromEntries(Object.entries(servers.value[v]?.variables ?? {}).map(([k, sv]) => [k, sv.default]))
}
</script>

<template>
  <div class="oa-servers">
    <UidSelect size="sm" :options="options" :model-value="ctx.server.index" :aria-label="labels.servers" @update:model-value="choose" />
    <UidInput v-if="ctx.server.index === -1" size="sm" v-model="ctx.server.custom" placeholder="https://api.example.com" />
    <div v-if="current?.variables" class="oa-servers__vars">
      <template v-for="(v, name) in current.variables" :key="name">
        <label v-if="v.enum" class="oa-servers__var">
          <span>{{ name }}</span>
          <UidSelect
            size="sm"
            :options="v.enum.map((e) => ({ value: e, label: e }))"
            :model-value="ctx.server.variables[name] ?? v.default"
            @update:model-value="(x: unknown) => (ctx.server.variables[name] = String(x))"
          />
        </label>
        <UidInput v-else size="sm" :label="String(name)" v-model="ctx.server.variables[name]" />
      </template>
    </div>
    <code v-if="resolved" class="oa-servers__url">{{ resolved }}</code>
  </div>
</template>
