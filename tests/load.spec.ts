import { loadSpec, parseSpec, stringifySpec, validateDocument } from '../src'
import { fixtureText } from './fixtures/specs'

describe('loadSpec', () => {
  it('loads the YAML petstore with positions and the source format', () => {
    const spec = loadSpec(fixtureText('petstore-30.yaml'))
    expect(spec.source.family).toBe('openapi30')
    expect(spec.source.format).toBe('yaml')
    expect(spec.document.openapi).toBe('3.1.0')
    expect(spec.operations.length).toBeGreaterThan(0)
    expect(spec.positions?.get('/info')).toEqual({ line: expect.any(Number), column: 1 })
  })

  it('agrees between YAML and JSON of the same document', () => {
    const yaml = parseSpec(fixtureText('petstore-30.yaml'))
    const json = stringifySpec(yaml.value, 'json')
    const fromJson = loadSpec(json)
    expect(fromJson.source.format).toBe('json')
    expect(fromJson.document).toEqual(loadSpec(fixtureText('petstore-30.yaml')).document)
    expect(parseSpec(stringifySpec(yaml.value, 'yaml')).value).toEqual(yaml.value)
  })

  it('reports a document issue on its YAML line', () => {
    const text = ['openapi: 3.0.3', 'info:', '  title: T', '  version: "1"', 'paths:', '  /pets/{id}:', '    get:', '      responses:', "        '200':", '          description: ok'].join('\n')
    const { value, positions } = parseSpec(text)
    const issue = validateDocument(value, { positions }).find((i) => i.message.includes('id'))
    expect(issue?.severity).toBe('error')
    expect(issue?.line).toBe(7)
  })

  it('takes an already parsed object', () => {
    expect(loadSpec({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} }).operations).toEqual([])
  })
})
