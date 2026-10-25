import { detectVersion } from './detect'
import { OpenApiError } from './errors'

describe('detectVersion', () => {
  it('detects the three families', () => {
    expect(detectVersion({ swagger: '2.0' })).toEqual({ family: 'swagger2', version: '2.0' })
    expect(detectVersion({ openapi: '3.0.3' })).toEqual({ family: 'openapi30', version: '3.0.3' })
    expect(detectVersion({ openapi: '3.0' })).toEqual({ family: 'openapi30', version: '3.0' })
    expect(detectVersion({ openapi: '3.1.0' })).toEqual({ family: 'openapi31', version: '3.1.0' })
    expect(detectVersion({ openapi: '3.2.0' }).family).toBe('openapi31')
  })

  it('accepts a numeric swagger version from YAML', () => {
    expect(detectVersion({ swagger: 2.0 }).family).toBe('swagger2')
  })

  it('throws for something that is not a spec', () => {
    expect(() => detectVersion(null)).toThrow(OpenApiError)
    expect(() => detectVersion([])).toThrow(OpenApiError)
    expect(() => detectVersion({ info: {} })).toThrow(/Not an OpenAPI document/)
    expect(() => detectVersion({ openapi: '4.0.0' })).toThrow(/Unsupported OpenAPI version/)
    expect(() => detectVersion({ swagger: '1.2' })).toThrow(/Unsupported Swagger version/)
  })
})
