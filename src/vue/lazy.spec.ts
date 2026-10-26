// @vitest-environment jsdom
import { EAGER_OPERATIONS, isLargeSpec } from './lazy'
import * as core from '../index'
import * as vue from './index'
import * as standalone from '../standalone'

const spec = (n: number) => ({ operations: Array.from({ length: n }, () => ({}) as never) })

describe('isLargeSpec', () => {
  it('renders small specs whole and large ones lazily', () => {
    expect(isLargeSpec(spec(0))).toBe(false)
    expect(isLargeSpec(spec(EAGER_OPERATIONS))).toBe(false)
    expect(isLargeSpec(spec(EAGER_OPERATIONS + 1))).toBe(true)
  })
})

describe('proxySend', () => {
  it('is exported by the core, the Vue entry and the standalone bundle — the same function', () => {
    expect(typeof core.proxySend).toBe('function')
    expect(vue.proxySend).toBe(core.proxySend)
    expect(standalone.proxySend).toBe(core.proxySend)
  })
})
