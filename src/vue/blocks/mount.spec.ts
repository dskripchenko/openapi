// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mountOpenApiBlock, openApiBlockRenderer, type BlockMountHandle } from './mount'

const SOURCE = 'method: GET\nurl: https://api.example.com/users/{id}\nsummary: Get a user\n'
const flush = async () => {
  for (let i = 0; i < 3; i++) await nextTick()
}

describe('mountOpenApiBlock', () => {
  it('shows a read-only block as cards, takes updates and unmounts', async () => {
    const el = document.createElement('div')
    const handle = mountOpenApiBlock(el, { source: SOURCE, locale: 'en', tryIt: false })
    await flush()
    expect(el.querySelector('.oa-bk')).not.toBeNull()
    expect(el.querySelector('.oa-embed__title')?.textContent).toBe('Get a user')
    handle.update(SOURCE.replace('Get a user', 'Fetch a user'))
    await flush()
    expect(el.querySelector('.oa-embed__title')?.textContent).toBe('Fetch a user')
    handle.update('method: FETCH\nurl: /a\n')
    await flush()
    expect(el.querySelector('.uid-alert')?.textContent).toContain('Unknown method "FETCH"')
    handle.destroy()
    expect(el.innerHTML).toBe('')
  })

  it('editable: Source edits come out through onChange, an update keeps the open tab', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const changes: string[] = []
    const handle = mountOpenApiBlock(el, { source: SOURCE, editable: true, tab: 'source', onChange: (s) => changes.push(s) })
    await flush()
    const ta = el.querySelector<HTMLTextAreaElement>('.oa-source__textarea')!
    ta.value = SOURCE + 'description: Hi\n'
    ta.dispatchEvent(new Event('input'))
    await flush()
    expect(changes).toEqual([SOURCE + 'description: Hi\n'])
    handle.update(SOURCE)
    await flush()
    expect(el.querySelector<HTMLTextAreaElement>('.oa-source__textarea')?.value).toBe(SOURCE)
    expect(changes).toHaveLength(1)
    handle.destroy()
    el.remove()
  })
})

describe('openApiBlockRenderer', () => {
  it('returns a mount that never throws for a broken block and hands edits to setCode', async () => {
    const render = openApiBlockRenderer({ locale: 'en' })
    const result = await render('url: [broken', { language: 'openapi', index: 0 })
    expect(result.html).toBeUndefined()
    const el = document.createElement('div')
    const codes: string[] = []
    const handle = result.mount!(el, { code: 'url: [broken', language: 'openapi', editable: true, setCode: (c) => codes.push(c) }) as BlockMountHandle
    await flush()
    expect(el.querySelector('.uid-tabs')).not.toBeNull()
    expect(el.querySelector('.oa-bk__dot')).not.toBeNull()
    handle.update!(SOURCE)
    await flush()
    expect(el.querySelector('.oa-bk__dot')).toBeNull()
    expect(codes).toEqual([])
    handle.destroy!()

    const ro = result.mount!(el, { code: SOURCE, language: 'openapi', editable: false, setCode: () => {} }) as BlockMountHandle
    await flush()
    expect(el.querySelector('.uid-tabs')).toBeNull()
    expect(el.querySelector('.oa-embed__card')).not.toBeNull()
    ro.destroy!()
  })
})
