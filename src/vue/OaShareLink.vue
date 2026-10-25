<script setup lang="ts">
/**
 * "Copy link": a link to the operation with the try-it form as it is now.
 * Credentials go into it only when the user ticks the box.
 */
import { ref } from 'vue'
import { UidButton, UidCheckbox } from '@dskripchenko/ui'
import { encodePrefill, prefillHash } from '../links'
import type { OperationEntry } from '../model'
import { useReference } from './context'
import type { OperationDraft } from './draft'
import { copyText, draftPrefill, pageAddress } from './share'

const props = defineProps<{ entry: OperationEntry; draft: OperationDraft }>()
const ctx = useReference()
const labels = ctx.labels

const withCredentials = ref(false)
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  const payload = await encodePrefill(draftPrefill(props.draft, props.entry, ctx, withCredentials.value))
  const anchor = `${ctx.anchorPrefix.value}operation/${props.entry.id}`
  copied.value = await copyText(`${pageAddress()}#${prefillHash(anchor, payload)}`)
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="oa-share">
    <div class="oa-share__row">
      <UidButton variant="ghost" size="sm" class="oa-share__copy" @click="copy">{{ labels.copyLink }}</UidButton>
      <span v-if="copied" class="oa-share__done" aria-live="polite">{{ labels.linkCopied }}</span>
      <UidCheckbox v-model="withCredentials" class="oa-share__creds" :label="labels.includeCredentials" />
    </div>
    <div v-if="withCredentials" class="oa-tryit__warn">{{ labels.credentialsWarning }}</div>
  </div>
</template>
