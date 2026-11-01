// @vitest-environment jsdom
// Mounts the Vue components: type-checked with tsconfig.vue.json.
import { describe, expect, it } from 'vitest'

describe('print views for a host printing its own page', () => {
  it('the reference and an operation give their static views', async () => {
    const { createApp, h, nextTick } = await import('vue')
    const { default: OpenApiReference } = await import('../src/vue/OpenApiReference.vue')
    const { default: OpenApiOperation } = await import('../src/vue/OpenApiOperation.vue')
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Orders API', version: '1.0.0' },
      paths: { '/orders': { get: { operationId: 'listOrders', summary: 'List the orders', responses: { '200': { description: 'OK' } } } } },
    }
    const mount = async (component: unknown, props: Record<string, unknown>) => {
      const el = document.createElement('div')
      document.body.append(el)
      let exposed: { printView(): Promise<{ html: string; css: string; title: string } | null> } | null = null
      createApp({ render: () => h(component as never, { ...props, ref: (r: unknown) => (exposed = r as never) }) }).mount(el)
      for (let i = 0; i < 50 && !(await exposed!.printView()); i++) {
        await nextTick()
        await new Promise((r) => setTimeout(r, 10))
      }
      return exposed!.printView()
    }
    const doc = await mount(OpenApiReference, { spec })
    expect(doc!.title).toBe('Orders API — 1.0.0')
    expect(doc!.html).toContain('List the orders')
    expect(doc!.css).not.toContain('@page')
    const op = await mount(OpenApiOperation, { spec, operation: 'listOrders' })
    expect(op!.title).toBe('Orders API — List the orders')
    expect(op!.html).toContain('/orders')
  })
})
