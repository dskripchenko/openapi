<script setup lang="ts">
/**
 * OpenApiPage — OpenApiReference as a whole page: a slim sticky bar with the
 * API title on the left and theme and language switchers on the right.
 *
 * Every attribute it does not declare (`spec`, `specs`, `send`, `tryIt`,
 * `labels`, listeners, …) goes to the inner OpenApiReference unchanged; `class`
 * and `style` stay on the page. The theme is written to `data-theme` on
 * <html>, which is what the kit's themes.css keys off; 'system' follows
 * `prefers-color-scheme` live. The bar's height becomes `--oa-sticky-top`, so
 * the navigation and side panels stick below it.
 */
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch, watchEffect } from 'vue'
import { LOCALES, en, type OpenApiLabels } from './labels'
import OpenApiReference from './OpenApiReference.vue'
import { PAGE_THEMES as THEMES, isPageTheme, resolveLocale, type PageTheme } from './page'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 'light', 'dark' or 'system' (`v-model:theme`). */
    theme?: PageTheme
    /** 'en', 'ru' or 'auto' — the browser's language (`v-model:locale`). */
    locale?: string
    /** The bar's title; the open spec's own title by default. */
    title?: string
    /** The languages the switcher offers. */
    languages?: string[]
    /** Remembers the chosen theme in localStorage; it then wins over `theme`. */
    persistTheme?: boolean
    /** Writes `data-theme` on <html>. Turn off when the host themes the page itself. */
    applyTheme?: boolean
  }>(),
  {
    theme: 'system',
    locale: 'auto',
    title: undefined,
    languages: () => ['en', 'ru'],
    persistTheme: false,
    applyTheme: true,
  },
)

const emit = defineEmits<{
  'update:theme': [theme: PageTheme]
  'update:locale': [locale: string]
}>()

const attrs = useAttrs()
const referenceAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

/* -------------------------------- theme --------------------------------- */

const STORAGE_KEY = 'dsk-openapi-theme'

function stored(): PageTheme | null {
  if (!props.persistTheme) return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isPageTheme(v) ? v : null
  } catch {
    return null
  }
}

const mode = ref<PageTheme>(stored() ?? props.theme)
if (mode.value !== props.theme) emit('update:theme', mode.value)
watch(
  () => props.theme,
  (t) => {
    if (t !== mode.value) mode.value = t
  },
)

function setTheme(t: PageTheme): void {
  mode.value = t
  emit('update:theme', t)
  if (!props.persistTheme) return
  try {
    localStorage.setItem(STORAGE_KEY, t)
  } catch {
    // Storage may be off (private mode, sandboxed frame): the choice lives for the visit.
  }
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
const systemDark = ref(media?.matches ?? false)
const onSystem = (e: MediaQueryListEvent): void => void (systemDark.value = e.matches)
media?.addEventListener('change', onSystem)
onBeforeUnmount(() => media?.removeEventListener('change', onSystem))

/** The theme actually shown: 'system' resolved. */
const resolved = computed<'light' | 'dark'>(() => (mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value))
watchEffect(() => {
  if (props.applyTheme && typeof document !== 'undefined') document.documentElement.dataset.theme = resolved.value
})

/* ------------------------------- language ------------------------------- */

const lang = computed(() => resolveLocale(props.locale))
const setLocale = (l: string): void => emit('update:locale', l)

const labels = computed<OpenApiLabels>(() => ({
  ...(LOCALES[lang.value] ?? en),
  ...((attrs.labels as Partial<OpenApiLabels> | undefined) ?? {}),
}))

/* --------------------------------- bar ---------------------------------- */

const reference = ref<InstanceType<typeof OpenApiReference> | null>(null)
const heading = computed(() => props.title ?? reference.value?.spec?.document.info.title ?? '')

const bar = ref<HTMLElement | null>(null)
const barHeight = ref(0)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!bar.value) return
  barHeight.value = bar.value.offsetHeight
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => {
    if (bar.value) barHeight.value = bar.value.offsetHeight
  })
  observer.observe(bar.value)
})
onBeforeUnmount(() => observer?.disconnect())

const themeTitle = (t: PageTheme): string =>
  t === 'light' ? labels.value.themeLight : t === 'dark' ? labels.value.themeDark : labels.value.themeSystem

/** Arrow keys move the choice inside a radio group, as the ARIA pattern asks. */
function onArrows<T>(e: KeyboardEvent, items: T[], current: T, pick: (v: T) => void): void {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const next = items[(items.indexOf(current) + step + items.length) % items.length]!
  pick(next)
  const group = (e.currentTarget as HTMLElement | null)?.closest('[role="radiogroup"]')
  void Promise.resolve().then(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
}

defineExpose({ reference, setTheme, theme: resolved })
</script>

<template>
  <div class="oa-page" :class="attrs.class" :style="[attrs.style as never,{ '--oa-sticky-top': `${barHeight}px` }]">
    <header ref="bar" class="oa-page__bar">
      <div class="oa-page__title">
        <slot name="title" :title="heading">{{ heading }}</slot>
      </div>
      <div class="oa-page__actions">
        <slot name="actions" />
        <div class="oa-segmented oa-page__theme" role="radiogroup" :aria-label="labels.theme">
          <button
            v-for="t in THEMES"
            :key="t"
            type="button"
            role="radio"
            class="oa-segmented__item oa-page__icon"
            :class="{ 'is-active': mode === t }"
            :aria-checked="mode === t"
            :aria-label="themeTitle(t)"
            :title="themeTitle(t)"
            :tabindex="mode === t ? 0 : -1"
            :data-theme-option="t"
            @click="setTheme(t)"
            @keydown="onArrows($event, THEMES, mode, setTheme)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <template v-if="t === 'light'">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </template>
              <path v-else-if="t === 'dark'" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              <template v-else>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </template>
            </svg>
          </button>
        </div>
        <div v-if="languages.length > 1" class="oa-segmented oa-page__lang" role="radiogroup" :aria-label="labels.language">
          <button
            v-for="l in languages"
            :key="l"
            type="button"
            role="radio"
            class="oa-segmented__item"
            :class="{ 'is-active': lang === l }"
            :aria-checked="lang === l"
            :tabindex="lang === l ? 0 : -1"
            :lang="l"
            :data-locale-option="l"
            @click="setLocale(l)"
            @keydown="onArrows($event, languages, lang, setLocale)"
          >
            {{ l.toUpperCase() }}
          </button>
        </div>
      </div>
    </header>
    <div class="oa-page__body">
      <OpenApiReference ref="reference" v-bind="referenceAttrs" :locale="lang" />
    </div>
  </div>
</template>
