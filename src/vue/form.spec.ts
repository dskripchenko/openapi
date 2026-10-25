import type { Schema } from '../core/types'
import { formatBytes, formFields, isBinaryBody, isFileSchema, placeholderName } from './form'

const schemas: Record<string, Schema> = {
  Base: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
}
const resolve = (ref: string) => schemas[ref.split('/').pop()!]

describe('try-it forms', () => {
  it('finds file fields through $ref and allOf', () => {
    const fields = formFields(
      'multipart/form-data',
      {
        schema: {
          allOf: [
            { $ref: '#/components/schemas/Base' },
            {
              properties: {
                photos: { type: 'array', items: { type: 'string', contentMediaType: 'image/png' } },
                note: { type: 'string' },
                id: { type: 'string', readOnly: true },
              },
            },
          ],
        },
        encoding: { file: { contentType: 'application/pdf' } },
      },
      resolve,
    )
    expect(fields?.map((f) => [f.name, f.file, f.multiple, f.required, f.accept])).toEqual([
      ['file', true, false, true, 'application/pdf'],
      ['photos', true, true, false, 'image/png'],
      ['note', false, false, false, undefined],
    ])
  })

  it('urlencoded forms take no files; other bodies are no form', () => {
    const media = { schema: { type: 'object', properties: { f: { type: 'string', format: 'binary' } } } }
    expect(formFields('application/x-www-form-urlencoded', media)?.[0]?.file).toBe(false)
    expect(formFields('application/json', media)).toBeUndefined()
  })

  it('tells binary bodies', () => {
    expect(isBinaryBody('application/octet-stream', undefined)).toBe(true)
    expect(isBinaryBody('image/*', { schema: { type: 'object' } })).toBe(true)
    expect(isBinaryBody('application/x-custom', { schema: { type: 'string', format: 'binary' } })).toBe(true)
    expect(isBinaryBody('application/x-custom', undefined)).toBe(true)
    expect(isBinaryBody('application/json', undefined)).toBe(false)
    expect(isBinaryBody('text/plain', undefined)).toBe(false)
    expect(isBinaryBody('multipart/form-data', undefined)).toBe(false)
    expect(isFileSchema({ type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' })).toBe(false)
  })

  it('names placeholders and sizes', () => {
    expect(placeholderName('file', 'image/png, image/jpeg')).toBe('file.png')
    expect(placeholderName('$body')).toBe('file')
    expect(placeholderName('doc', 'application/octet-stream')).toBe('doc')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(30 * 1024 * 1024)).toBe('30 MB')
  })
})
