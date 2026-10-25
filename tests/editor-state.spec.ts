import { nextTick } from 'vue'
import { renameKey, setField, useEditorDoc } from '../src/vue/editor/state'

const YAML = 'openapi: 3.0.3\ninfo:\n  title: T\n  version: "1"\npaths: {}\n'

describe('editor state', () => {
  it('parses the text, keeps its format, and writes edits back in it', () => {
    const emitted: string[] = []
    const ed = useEditorDoc(YAML, (t) => emitted.push(t))
    expect(ed.format.value).toBe('yaml')
    expect(ed.family.value).toBe('openapi30')
    ed.doc.value!.info.title = 'Changed'
    ed.commit()
    expect(emitted.at(-1)).toContain('title: Changed')
    ed.setFormat('json')
    expect(JSON.parse(emitted.at(-1)!).info.title).toBe('Changed')
  })

  it('reports a parse error with its line and keeps the last good document', () => {
    const ed = useEditorDoc(YAML, () => {})
    const doc = ed.doc.value
    ed.setText('openapi: 3.0.3\ninfo: [oops')
    expect(ed.parseError.value?.line).toBeGreaterThan(0)
    expect(ed.doc.value).toBe(doc)
    ed.setText(YAML)
    expect(ed.parseError.value).toBeNull()
  })

  it('lists the document problems with lines from the current text', async () => {
    const ed = useEditorDoc(YAML.replace('paths: {}', 'paths:\n  /a/{id}:\n    get:\n      responses:\n        "200":\n          description: ok'), () => {})
    await nextTick()
    const issue = ed.issues.value.find((i) => i.message.includes('id'))
    expect(issue?.line).toBe(7)
  })

  it('converts Swagger 2.0 to 3.1 in place', () => {
    const emitted: string[] = []
    const ed = useEditorDoc(JSON.stringify({ swagger: '2.0', info: { title: 'S', version: '1' }, host: 'api.example.com', paths: {} }), (t) => emitted.push(t))
    expect(ed.family.value).toBe('swagger2')
    ed.convertTo31()
    const doc = JSON.parse(emitted.at(-1)!)
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.servers[0].url).toBe('https://api.example.com')
  })

  it('setField drops empty values; renameKey keeps the order', () => {
    const o: Record<string, unknown> = { a: 1, b: 2, c: 3 }
    setField(o, 'b', '')
    expect(o).toEqual({ a: 1, c: 3 })
    setField(o, 'd', [])
    expect('d' in o).toBe(false)
    expect(renameKey(o, 'a', 'z')).toBe(true)
    expect(Object.keys(o)).toEqual(['z', 'c'])
    expect(renameKey(o, 'z', 'c')).toBe(false)
  })
})
