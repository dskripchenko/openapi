<script setup lang="ts">
/** Servers with their URL variables. */
import { computed } from 'vue'
import { UidButton, UidInput, UidTagsInput } from '@dskripchenko/ui'
import { useEditor } from './context'
import { bind, renameKey, setField, type Doc } from './state'

const { editor, labels } = useEditor()
const servers = computed<Doc[]>(() => editor.doc.value!.servers ?? [])

function add(): void {
  editor.doc.value!.servers ??= []
  editor.doc.value!.servers.push({ url: 'https://api.example.com' })
}
function remove(i: number): void {
  servers.value.splice(i, 1)
  setField(editor.doc.value!, 'servers', servers.value)
}
function addVariable(s: Doc): void {
  s.variables ??= {}
  let i = Object.keys(s.variables).length + 1
  while (`var${i}` in s.variables) i++
  s.variables[`var${i}`] = { default: '' }
}
function enumOf(v: Doc) {
  return {
    modelValue: (v.enum ?? []) as string[],
    'onUpdate:modelValue': (list: string[]) => setField(v, 'enum', list),
  }
}
</script>

<template>
  <div class="oa-ef">
    <div v-for="(s, i) in servers" :key="i" class="oa-es__prop">
      <div class="oa-es__row">
        <UidInput class="oa-ef__grow" size="sm" :label="labels.url" v-bind="bind(s, 'url')" />
        <UidButton size="sm" variant="ghost" @click="remove(i)">{{ labels.remove }}</UidButton>
      </div>
      <UidInput size="sm" :placeholder="labels.description" v-bind="bind(s, 'description')" />
      <div v-for="(v, name) in s.variables ?? {}" :key="name" class="oa-es__row oa-es__nested">
        <UidInput class="oa-es__prop-name" size="sm" :model-value="String(name)" @blur="(e: FocusEvent) => renameKey(s.variables, String(name), (e.target as HTMLInputElement).value.trim())" />
        <UidInput size="sm" :placeholder="labels.default" v-bind="bind(v, 'default')" />
        <UidTagsInput class="oa-ef__grow" size="sm" :placeholder="labels.values" v-bind="enumOf(v)" />
        <UidButton size="sm" variant="ghost" @click="delete s.variables[name]; if (!Object.keys(s.variables).length) delete s.variables">{{ labels.remove }}</UidButton>
      </div>
      <UidButton size="sm" variant="ghost" @click="addVariable(s)">{{ labels.addVariable }}</UidButton>
    </div>
    <UidButton size="sm" variant="secondary" @click="add">{{ labels.addServer }}</UidButton>
  </div>
</template>
