/**
 * `v-auto-grow`: a textarea as tall as its text, so the page scrolls instead
 * of the box. It refits when the text changes and when the width changes
 * (wrapped lines move).
 */
import type { Directive } from 'vue'

const observers = new WeakMap<HTMLTextAreaElement, ResizeObserver>()

function fit(el: HTMLTextAreaElement): void {
  const border = el.offsetHeight - el.clientHeight
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + Math.max(0, border)}px`
}

export const vAutoGrow: Directive<HTMLTextAreaElement> = {
  mounted(el) {
    el.style.overflowY = 'hidden'
    el.style.resize = 'none'
    fit(el)
    el.addEventListener('input', () => fit(el))
    if (typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit(el)
    })
    observer.observe(el)
    observers.set(el, observer)
  },
  updated(el) {
    fit(el)
  },
  unmounted(el) {
    observers.get(el)?.disconnect()
    observers.delete(el)
  },
}
