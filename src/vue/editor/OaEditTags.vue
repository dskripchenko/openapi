<script setup lang="ts">
/** The declared tags: their order is the order of the reference's sections. */
import { computed } from 'vue'
import { UidButton, UidInput } from '@dskripchenko/ui'
import { useEditor } from './context'
import { bind, setField, type Doc } from './state'

const { editor, labels } = useEditor()
const tags = computed<Doc[]>(() => editor.doc.value!.tags ?? [])

function add(): void {
  editor.doc.value!.tags ??= []
  editor.doc.value!.tags.push({ name: `tag${tags.value.length + 1}` })
}
function move(i: number, by: number): void {
  const list = tags.value
  const j = i + by
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j]!, list[i]!]
}
function remove(i: number): void {
  tags.value.splice(i, 1)
  setField(editor.doc.value!, 'tags', tags.value)
}
</script>

<template>
  <div class="oa-ef">
    <div v-for="(t, i) in tags" :key="i" class="oa-es__row oa-es__prop">
      <UidInput class="oa-es__prop-name" size="sm" v-bind="bind(t, 'name')" />
      <UidInput class="oa-ef__grow" size="sm" :placeholder="labels.description" v-bind="bind(t, 'description')" />
      <UidButton size="sm" variant="ghost" :disabled="i === 0" @click="move(i, -1)">↑</UidButton>
      <UidButton size="sm" variant="ghost" :disabled="i === tags.length - 1" @click="move(i, 1)">↓</UidButton>
      <UidButton size="sm" variant="ghost" @click="remove(i)">{{ labels.remove }}</UidButton>
    </div>
    <UidButton size="sm" variant="secondary" @click="add">{{ labels.addTag }}</UidButton>
  </div>
</template>
