<script setup lang="ts">
/**
 * A `content` map — media type → schema — as tabs of media types, each with
 * its schema form. Used by request bodies and responses.
 */
import { computed, ref, watch } from 'vue'
import { UidButton, UidInput } from '@dskripchenko/ui'
import { useEditor } from './context'
import type { Doc } from './state'
import OaEditSchema from './OaEditSchema.vue'

const props = defineProps<{ owner: Doc }>()
const { labels } = useEditor()

const types = computed(() => Object.keys(props.owner.content ?? {}))
const active = ref(types.value[0] ?? '')
watch(types, (list) => {
  if (!list.includes(active.value)) active.value = list[0] ?? ''
})

const newType = ref('')
function add(): void {
  const t = newType.value.trim() || 'application/json'
  props.owner.content ??= {}
  if (!(t in props.owner.content)) props.owner.content[t] = { schema: { type: 'object', properties: {} } }
  active.value = t
  newType.value = ''
}
function remove(t: string): void {
  delete props.owner.content[t]
  if (!Object.keys(props.owner.content).length) delete props.owner.content
}
</script>

<template>
  <div class="oa-ec">
    <div class="oa-block__media oa-ec__types">
      <button v-for="t in types" :key="t" type="button" class="oa-chip" :class="{ 'is-active': t === active }" @click="active = t">{{ t }}</button>
      <UidInput class="oa-ec__new" size="sm" placeholder="application/json" v-model="newType" @keydown.enter.prevent="add" />
      <UidButton size="sm" variant="ghost" @click="add">{{ labels.addMediaType }}</UidButton>
    </div>
    <template v-if="active && owner.content?.[active]">
      <div class="oa-es__row">
        <span class="oa-schema__type">{{ active }}</span>
        <UidButton size="sm" variant="ghost" @click="remove(active)">{{ labels.remove }}</UidButton>
      </div>
      <OaEditSchema v-if="owner.content[active].schema" :schema="owner.content[active].schema" />
      <UidButton v-else size="sm" variant="secondary" @click="owner.content[active].schema = { type: 'object', properties: {} }">{{ labels.reference }}</UidButton>
    </template>
  </div>
</template>
