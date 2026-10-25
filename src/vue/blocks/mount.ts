/**
 * API blocks outside a Vue template: mounting the widget into an element,
 * and a block renderer for host editors and markdown views that render
 * fenced code blocks by language (```openapi).
 */
import { createApp, defineComponent, h, render, shallowReactive, type App, type AppContext } from 'vue'
import type { SendFn } from '../../request'
import type { SnippetTarget } from '../../snippets'
import type { OpenApiLabels } from '../labels'
import OpenApiBlock, { type BlockTab } from '../OpenApiBlock.vue'
import type { BlockLabels } from './labels'

/** The widget's options, as OpenApiBlock's props. */
export interface OpenApiBlockOptions {
  editable?: boolean
  tab?: BlockTab
  locale?: string
  labels?: Partial<OpenApiLabels>
  blockLabels?: Partial<BlockLabels>
  send?: SendFn
  tryIt?: boolean
  snippetTargets?: SnippetTarget[]
  defaultSnippet?: SnippetTarget
  baseUrl?: string
  persistCredentials?: boolean | 'session' | 'local'
  oauthRedirectUrl?: string
  debounce?: number
}

export interface MountOpenApiBlockOptions extends OpenApiBlockOptions {
  /** The block's text. */
  source: string
  /** Called with the new text after an edit (editable only). */
  onChange?: (source: string) => void
  /**
   * The host application's context: the widget renders inside it, so the
   * host's provides (the kit's theme and locale, i18n, block renderers)
   * reach it. Without it the widget is an application of its own.
   */
  appContext?: AppContext
}

export interface OpenApiBlockHandle {
  /** Puts a text changed outside (undo, redo, a collaborator) into the widget; the open tab stays. */
  update(source: string): void
  /** Unmounts the widget and leaves the element empty. */
  destroy(): void
}

/** Mounts OpenApiBlock into `el`. */
export function mountOpenApiBlock(el: Element, options: MountOpenApiBlockOptions): OpenApiBlockHandle {
  const { source, onChange, appContext, ...rest } = options
  const state = shallowReactive({ source })
  const Root = defineComponent({
    name: 'OpenApiBlockRoot',
    setup: () => () =>
      h(OpenApiBlock, {
        ...rest,
        source: state.source,
        'onUpdate:source': (next: string) => {
          state.source = next
          onChange?.(next)
        },
      }),
  })

  let app: App | null = null
  if (appContext) {
    const vnode = h(Root)
    vnode.appContext = appContext
    render(vnode, el)
  } else {
    app = createApp(Root)
    app.mount(el)
  }
  let alive = true
  return {
    update: (next) => {
      if (alive) state.source = next
    },
    destroy: () => {
      if (!alive) return
      alive = false
      if (app) app.unmount()
      else render(null, el)
    },
  }
}

/* --------------------------- the block renderer contract --------------------------- */

/** What a host passes to a mounted island. */
export interface BlockMountContext {
  code: string
  language: string
  /** False in read-only views. */
  editable: boolean
  /** Replaces the block's code (editable only); the host does not re-render the island for this change. */
  setCode(code: string): void
}

export interface BlockMountHandle {
  update?(code: string): void
  destroy?(): void
}

export interface BlockRenderResult {
  html?: string
  error?: string
  /** A live island: called with the island element; returns a handle. */
  mount?: (el: HTMLElement, ctx: BlockMountContext) => BlockMountHandle | (() => void) | void
}

/** Renders one fenced code block of a language. */
export type BlockRenderer = (code: string, ctx: { language: string; index: number }) => BlockRenderResult | Promise<BlockRenderResult>

/**
 * A block renderer for ```openapi blocks: each block becomes a live island
 * with OpenApiBlock — editable where the host is, with its edits handed back
 * through `setCode`, and read-only elsewhere. A block that does not read is
 * still mounted: the widget shows the error and, when editable, the source
 * and the constructor to fix it.
 */
export function openApiBlockRenderer(options: Omit<OpenApiBlockOptions, 'editable'> & { appContext?: AppContext } = {}): BlockRenderer {
  return (code) => ({
    mount: (el, ctx) =>
      mountOpenApiBlock(el, {
        ...options,
        source: ctx.code ?? code,
        editable: ctx.editable,
        ...(ctx.editable ? { onChange: (next: string) => ctx.setCode(next) } : {}),
      }),
  })
}
