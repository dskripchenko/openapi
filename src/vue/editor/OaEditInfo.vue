<script setup lang="ts">
/** The document's info block: title, version, description, contact, license. */
import { computed } from 'vue'
import { UidInput, UidTextarea } from '@dskripchenko/ui'
import { useEditor } from './context'
import { bind, setField, type Doc } from './state'

const { editor, labels } = useEditor()
const info = computed<Doc>(() => (editor.doc.value!.info ??= { title: '', version: '1.0.0' }))

/** contact / license sub-objects appear when a field is filled and go when emptied. */
function sub(key: 'contact' | 'license', field: string) {
  const owner = info.value[key] as Doc | undefined
  return {
    modelValue: owner?.[field] === undefined ? '' : String(owner[field]),
    'onUpdate:modelValue': (v: string) => {
      const target: Doc = (info.value[key] ??= {})
      setField(target, field, v)
      if (!Object.keys(target).length) delete info.value[key]
    },
  }
}
</script>

<template>
  <div class="oa-ef">
    <div class="oa-es__grid">
      <UidInput size="sm" :label="labels.title" required v-bind="bind(info, 'title')" />
      <UidInput size="sm" :label="labels.version" required v-bind="bind(info, 'version')" />
    </div>
    <UidInput size="sm" :label="labels.summary" v-bind="bind(info, 'summary')" />
    <UidTextarea size="sm" :label="labels.description" :rows="6" auto-grow v-bind="bind(info, 'description')" />
    <div class="oa-es__grid">
      <UidInput size="sm" :label="labels.contactName" v-bind="sub('contact', 'name')" />
      <UidInput size="sm" :label="labels.contactEmail" v-bind="sub('contact', 'email')" />
      <UidInput size="sm" :label="labels.contactUrl" v-bind="sub('contact', 'url')" />
      <UidInput size="sm" :label="labels.licenseName" v-bind="sub('license', 'name')" />
      <UidInput size="sm" :label="labels.licenseUrl" v-bind="sub('license', 'url')" />
      <UidInput size="sm" :label="labels.termsOfService" v-bind="bind(info, 'termsOfService')" />
    </div>
  </div>
</template>
